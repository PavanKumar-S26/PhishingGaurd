from sqlalchemy.orm import Session

from app.analysis_rules import calculate_risk, inspect_email
from app.classifier import Classifier, ModelUnavailable
from app.models import AnalysisRecord
from app.schemas import EmailPayload

SAFETY_NOTE = "This is an automated screening aid, not a guarantee of safety. Never open suspicious links or provide credentials; verify important requests through a known channel."


def analyze_and_save(
    payload: EmailPayload,
    db: Session,
    classifier: Classifier,
    owner_id: str,
    source: str = "text",
) -> AnalysisRecord:
    if not classifier.available:
        raise ModelUnavailable(classifier.error or "The trained classifier is unavailable.")
    classification, probability = classifier.predict(payload.sender_email, payload.subject, payload.body)
    urls, indicators, explanations = inspect_email(payload.sender_email, payload.subject, payload.body)
    risk, uncertain = calculate_risk(classification, probability, indicators)
    sender_domain = payload.sender_email.rsplit("@", 1)[-1].lower().rstrip(".")
    record = AnalysisRecord(
        owner_id=owner_id,
        sender_domain=sender_domain,
        classification=classification,
        risk_level=risk,
        model_probability=probability,
        uncertain=uncertain,
        model_version=classifier.version,
        source=source,
        urls=urls,
        indicators=indicators,
        explanations=explanations,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record
