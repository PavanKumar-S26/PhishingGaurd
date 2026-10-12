from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError

from app.auth import is_auth_configured
from app.classifier import Classifier
from app.config import settings
from app.database import Base, engine
from app import models  # Register SQLAlchemy tables before create_all.
from app.routes import router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("phishguard")


@asynccontextmanager
async def lifespan(application: FastAPI):
    application.state.classifier = Classifier(settings.model_path)
    if not application.state.classifier.available:
        logger.error("Classifier not loaded: %s", application.state.classifier.error)
    try:
        Base.metadata.create_all(bind=engine)
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            columns = {column["name"] for column in inspect(connection).get_columns("analysis_records")}
            if "owner_id" not in columns:
                connection.exec_driver_sql("ALTER TABLE analysis_records ADD COLUMN owner_id VARCHAR(255) NULL")
            indexes = {index["name"] for index in inspect(connection).get_indexes("analysis_records")}
            if "ix_analysis_owner_created" not in indexes:
                connection.exec_driver_sql(
                    "CREATE INDEX ix_analysis_owner_created ON analysis_records (owner_id, created_at)"
                )
            connection.commit()
        application.state.database_error = None
        logger.info("Database connection and schema are ready.")
    except SQLAlchemyError as exc:
        application.state.database_error = "Unable to connect to MySQL. Check DATABASE_URL and verify that MySQL and the configured database are available."
        logger.exception("MySQL/database is unavailable. Check DATABASE_URL and database setup.")
    yield
    engine.dispose()


app = FastAPI(title="PhishGuard API", version="1.0.0", description="Unified phishing email analysis, history, and analytics API.", lifespan=lifespan)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_hosts)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def enforce_eml_request_size(request: Request, call_next):
    if request.method == "POST" and request.url.path == "/api/analyze/file":
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > settings.max_eml_bytes + 64 * 1024:
                    return JSONResponse(
                        status_code=413,
                        content={"detail": f"The .eml upload exceeds the {settings.max_eml_bytes // (1024 * 1024)} MB file limit."},
                    )
            except ValueError:
                return JSONResponse(status_code=400, content={"detail": "Invalid Content-Length header."})
    return await call_next(request)


app.include_router(router)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


@app.get("/api/health")
def health() -> dict:
    database_error = getattr(app.state, "database_error", "Database has not been checked.")
    model = getattr(app.state, "classifier", None)
    return {
        "status": "ok" if database_error is None and model and model.available and is_auth_configured() else "degraded",
        "database": "connected" if database_error is None else "unavailable",
        "database_error": database_error,
        "model": "loaded" if model and model.available else "unavailable",
        "model_error": None if model and model.available else (model.error if model else "Model has not been loaded."),
        "model_version": model.version if model and model.available else None,
        "authentication": "configured" if is_auth_configured() else "unconfigured",
    }
