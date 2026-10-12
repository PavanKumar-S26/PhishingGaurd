from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.config import settings


class EmailPayload(BaseModel):
    sender_email: str = Field(min_length=3, max_length=320)
    subject: str = Field(max_length=998)
    body: str = Field(min_length=1, max_length=settings.max_email_text_chars)

    @field_validator("sender_email")
    @classmethod
    def validate_sender(cls, value: str) -> str:
        value = value.strip()
        if "\r" in value or "\n" in value or value.count("@") != 1:
            raise ValueError("Enter a valid sender email address.")
        local, domain = value.rsplit("@", 1)
        if not local or not domain or "." not in domain or " " in value:
            raise ValueError("Enter a valid sender email address.")
        return value

    @field_validator("subject", "body")
    @classmethod
    def reject_header_injection(cls, value: str) -> str:
        if "\x00" in value:
            raise ValueError("Email text contains an unsupported character.")
        return value

    @field_validator("body")
    @classmethod
    def reject_blank_body(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Email body must contain readable text.")
        return value


class AnalysisResponse(BaseModel):
    id: int
    classification: Literal["Legitimate", "Spam", "Phishing"]
    risk_level: Literal["Low", "Guarded", "Elevated", "High", "Critical"]
    model_probability: float = Field(ge=0, le=1)
    probability_calibrated: bool
    uncertain: bool
    model_version: str
    urls: list[str]
    indicators: list[dict]
    explanations: list[str]
    created_at: datetime
    safety_note: str


class HistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sender_domain: str | None
    classification: str
    risk_level: str
    model_probability: float
    uncertain: bool
    model_version: str
    source: str
    urls: list[str]
    indicators: list[dict]
    explanations: list[str]
    created_at: datetime


class HistoryResponse(BaseModel):
    items: list[HistoryItem]
    page: int
    page_size: int
    total: int
    pages: int


class AnalyticsResponse(BaseModel):
    total: int
    counts: dict[str, int]
    distribution: list[dict]
    trends: list[dict]
    recent: list[HistoryItem]


class AuthStatus(BaseModel):
    authenticated: bool = True
