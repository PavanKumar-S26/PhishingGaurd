from datetime import date, datetime, time, timedelta, timezone
import math

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from pydantic import ValidationError

from app.analysis_service import SAFETY_NOTE, analyze_and_save
from app.auth import get_current_user
from app.classifier import Classifier, ModelUnavailable
from app.database import get_db
from app.eml_parser import parse_eml_upload
from app.models import AnalysisRecord
from app.schemas import AnalysisResponse, AnalyticsResponse, AuthStatus, EmailPayload, HistoryResponse

router = APIRouter(prefix="/api")


def _classifier(request) -> Classifier:
    return request.app.state.classifier


def _analysis_response(row: AnalysisRecord) -> AnalysisResponse:
    return AnalysisResponse(
        id=row.id,
        classification=row.classification,
        risk_level=row.risk_level,
        model_probability=row.model_probability,
        probability_calibrated=True,
        uncertain=row.uncertain,
        model_version=row.model_version,
        urls=row.urls or [],
        indicators=row.indicators or [],
        explanations=row.explanations or [],
        created_at=row.created_at.replace(tzinfo=timezone.utc),
        safety_note=SAFETY_NOTE,
    )


def _http_for_model(exc: ModelUnavailable) -> HTTPException:
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Classifier unavailable: {exc}")


@router.get("/auth/check", response_model=AuthStatus)
def auth_check(owner_id: str = Depends(get_current_user)) -> AuthStatus:
    return AuthStatus()


@router.get("/model")
def model_info(request: Request, owner_id: str = Depends(get_current_user)) -> dict:
    classifier = _classifier(request)
    if not classifier.available:
        raise _http_for_model(ModelUnavailable(classifier.error or "The trained classifier is unavailable."))
    return classifier.metadata() or {}


@router.post("/analyze", response_model=AnalysisResponse)
def analyze(
    payload: EmailPayload,
    request: Request,
    owner_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnalysisResponse:
    try:
        row = analyze_and_save(payload, db, _classifier(request), owner_id=owner_id)
    except ModelUnavailable as exc:
        raise _http_for_model(exc) from exc
    return _analysis_response(row)


@router.post("/analyze/file", response_model=AnalysisResponse)
async def analyze_file(
    request: Request,
    file: UploadFile = File(...),
    owner_id: str = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnalysisResponse:
    payload_data = await parse_eml_upload(file)
    try:
        payload = EmailPayload(**payload_data)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail="The parsed .eml sender, subject, or body is invalid.") from exc
    try:
        row = analyze_and_save(payload, db, _classifier(request), owner_id=owner_id, source="eml")
    except ModelUnavailable as exc:
        raise _http_for_model(exc) from exc
    return _analysis_response(row)


@router.get("/history", response_model=HistoryResponse)
def history(
    db: Session = Depends(get_db),
    owner_id: str = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    q: str | None = Query(None, max_length=255),
    classification: str | None = Query(None, pattern="^(Legitimate|Spam|Phishing)$"),
    risk_level: str | None = Query(None, pattern="^(Low|Guarded|Elevated|High|Critical)$"),
    from_date: date | None = None,
    to_date: date | None = None,
) -> HistoryResponse:
    query = select(AnalysisRecord).where(AnalysisRecord.owner_id == owner_id)
    count_query = select(func.count()).select_from(AnalysisRecord).where(AnalysisRecord.owner_id == owner_id)
    if q:
        search = f"%{q.strip()}%"
        filters = (AnalysisRecord.sender_domain.ilike(search), AnalysisRecord.model_version.ilike(search))
        from sqlalchemy import or_
        query, count_query = query.where(or_(*filters)), count_query.where(or_(*filters))
    if classification:
        query, count_query = query.where(AnalysisRecord.classification == classification), count_query.where(AnalysisRecord.classification == classification)
    if risk_level:
        query, count_query = query.where(AnalysisRecord.risk_level == risk_level), count_query.where(AnalysisRecord.risk_level == risk_level)
    if from_date:
        start = datetime.combine(from_date, time.min)
        query, count_query = query.where(AnalysisRecord.created_at >= start), count_query.where(AnalysisRecord.created_at >= start)
    if to_date:
        end = datetime.combine(to_date + timedelta(days=1), time.min)
        query, count_query = query.where(AnalysisRecord.created_at < end), count_query.where(AnalysisRecord.created_at < end)
    total = int(db.scalar(count_query) or 0)
    rows = db.scalars(query.order_by(AnalysisRecord.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return HistoryResponse(items=rows, page=page, page_size=page_size, total=total, pages=math.ceil(total / page_size) if total else 0)


@router.get("/history/{record_id}", response_model=AnalysisResponse)
def history_detail(
    record_id: int,
    db: Session = Depends(get_db),
    owner_id: str = Depends(get_current_user),
) -> AnalysisResponse:
    row = db.scalar(
        select(AnalysisRecord).where(AnalysisRecord.id == record_id, AnalysisRecord.owner_id == owner_id)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Analysis record not found.")
    return _analysis_response(row)


@router.delete("/history/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_history(
    record_id: int,
    db: Session = Depends(get_db),
    owner_id: str = Depends(get_current_user),
) -> None:
    row = db.scalar(
        select(AnalysisRecord).where(AnalysisRecord.id == record_id, AnalysisRecord.owner_id == owner_id)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Analysis record not found.")
    db.delete(row)
    db.commit()


@router.get("/analytics", response_model=AnalyticsResponse)
def analytics(
    db: Session = Depends(get_db),
    owner_id: str = Depends(get_current_user),
    from_date: date | None = None,
    to_date: date | None = None,
) -> AnalyticsResponse:
    filters = [AnalysisRecord.owner_id == owner_id]
    if from_date:
        filters.append(AnalysisRecord.created_at >= datetime.combine(from_date, time.min))
    if to_date:
        filters.append(AnalysisRecord.created_at < datetime.combine(to_date + timedelta(days=1), time.min))
    total = int(db.scalar(select(func.count()).select_from(AnalysisRecord).where(*filters)) or 0)
    rows = db.scalars(select(AnalysisRecord).where(*filters).order_by(AnalysisRecord.created_at.desc())).all()
    counts = {label: 0 for label in ("Phishing", "Spam", "Legitimate")}
    daily: dict[str, dict[str, int]] = {}
    for row in rows:
        counts[row.classification] = counts.get(row.classification, 0) + 1
        day = row.created_at.date().isoformat()
        daily.setdefault(day, {"date": day, "Phishing": 0, "Spam": 0, "Legitimate": 0})
        daily[day][row.classification] = daily[day].get(row.classification, 0) + 1
    trends = [daily[key] for key in sorted(daily)]
    recent = rows[:6]
    return AnalyticsResponse(
        total=total,
        counts=counts,
        distribution=[{"name": name, "value": count} for name, count in counts.items()],
        trends=trends,
        recent=recent,
    )
