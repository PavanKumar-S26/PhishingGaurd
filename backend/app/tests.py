import unittest
from datetime import datetime, timedelta, timezone
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import jwt
from fastapi.testclient import TestClient
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from cryptography.hazmat.primitives.asymmetric import rsa

from app.analysis_rules import calculate_risk, inspect_email
from app.auth import get_current_user
from app.classifier import Classifier
from app.eml_parser import _body_from


class AnalysisRulesTests(unittest.TestCase):
    def test_extracts_urls_and_rule_indicators_without_opening_them(self):
        urls, indicators, explanations = inspect_email(
            "security@sample-mail.test", "Urgent: verify your account",
            "Please verify your password at https://bit.ly/secure-login now.",
        )
        codes = {indicator["code"] for indicator in indicators}
        self.assertEqual(urls, ["https://bit.ly/secure-login"])
        self.assertIn("url_shortener", codes)
        self.assertIn("urgency_language", codes)
        self.assertIn("sensitive_data_request", codes)
        self.assertTrue(explanations)

    def test_sender_mismatch_does_not_override_ml_prediction(self):
        _, indicators, _ = inspect_email("billing@example.test", "Invoice", "Pay at https://payments-other.test/invoice")
        self.assertIn("sender_link_mismatch", {item["code"] for item in indicators})
        self.assertEqual(calculate_risk("Legitimate", 0.91, indicators), ("Guarded", False))

    def test_uncertain_legitimate_prediction_is_not_marked_low_risk(self):
        self.assertEqual(calculate_risk("Legitimate", 0.49, []), ("Guarded", True))

    def test_html_email_extracts_anchor_target_but_ignores_attachments(self):
        message = EmailMessage()
        message.set_content('<html><body><a href="https://example.test/sign-in">Review message</a></body></html>', subtype="html")
        message.add_attachment(b"https://attachment.test/ignore", maintype="text", subtype="plain", filename="notes.txt")
        parsed = BytesParser(policy=policy.default).parsebytes(message.as_bytes())
        body = _body_from(parsed)
        self.assertIn("https://example.test/sign-in", body)
        self.assertNotIn("attachment.test", body)


class AuthenticationTests(unittest.TestCase):
    def setUp(self):
        from app.config import settings

        self.settings = settings
        self.original_auth = (settings.clerk_jwks_url, settings.clerk_issuer, settings.clerk_audience)
        settings.clerk_jwks_url = "https://auth.example.test/.well-known/jwks.json"
        settings.clerk_issuer = "https://auth.example.test"
        settings.clerk_audience = None
        self.private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.public_key = self.private_key.public_key()
        self.now = datetime.now(timezone.utc)

    def tearDown(self):
        self.settings.clerk_jwks_url, self.settings.clerk_issuer, self.settings.clerk_audience = self.original_auth

    def _token(self, **updates):
        claims = {
            "sub": "user_123",
            "iss": "https://auth.example.test",
            "azp": "http://localhost:5173",
            "iat": self.now,
            "nbf": self.now,
            "exp": self.now + timedelta(minutes=5),
        }
        claims.update(updates)
        return jwt.encode(claims, self.private_key, algorithm="RS256", headers={"kid": "test-key"})

    def _credentials(self, token):
        return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    def test_clerk_bearer_token_is_signature_issuer_and_origin_verified(self):
        fake_jwks = type("FakeJwks", (), {"get_signing_key_from_jwt": lambda _self, _token: type("Key", (), {"key": self.public_key})()})()
        with patch("app.auth._jwks_client", return_value=fake_jwks):
            self.assertEqual(get_current_user(self._credentials(self._token())), "user_123")
            for token in (
                self._token(iss="https://attacker.example.test"),
                self._token(azp="https://attacker.example.test"),
                self._token(exp=self.now - timedelta(seconds=1)),
            ):
                with self.assertRaises(HTTPException) as raised:
                    get_current_user(self._credentials(token))
                self.assertEqual(raised.exception.status_code, 401)

    def test_authentication_fails_closed_when_clerk_is_unconfigured(self):
        self.settings.clerk_jwks_url = None
        with self.assertRaises(HTTPException) as raised:
            get_current_user(None)
        self.assertEqual(raised.exception.status_code, 503)


class ApiWorkflowTests(unittest.TestCase):
    def setUp(self):
        from fastapi import Header
        from app import database, main
        from app.auth import get_current_user
        from app.config import settings

        self.temp_dir = TemporaryDirectory()
        self.main = main
        self.database = database
        self.settings = settings
        self.original_engine = main.engine
        self.original_session_factory = database.SessionLocal
        self.original_auth_config = (
            settings.clerk_jwks_url,
            settings.clerk_issuer,
            settings.clerk_audience,
        )
        self.original_dependency_overrides = main.app.dependency_overrides.copy()
        self.engine = create_engine(f"sqlite:///{Path(self.temp_dir.name) / 'integration.sqlite'}")
        database.Base.metadata.create_all(self.engine)
        main.engine = self.engine
        database.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False, expire_on_commit=False)
        settings.clerk_jwks_url = "https://auth.example.test/.well-known/jwks.json"
        settings.clerk_issuer = "https://auth.example.test"
        settings.clerk_audience = None

        def test_user(x_test_user: str = Header(default="user_a")) -> str:
            return x_test_user

        main.app.dependency_overrides[get_current_user] = test_user
        self.client_context = TestClient(main.app)
        self.client = self.client_context.__enter__()
        self.headers = {"X-Test-User": "user_a"}

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.main.engine = self.original_engine
        self.database.SessionLocal = self.original_session_factory
        (
            self.settings.clerk_jwks_url,
            self.settings.clerk_issuer,
            self.settings.clerk_audience,
        ) = self.original_auth_config
        self.main.app.dependency_overrides.clear()
        self.main.app.dependency_overrides.update(self.original_dependency_overrides)
        self.engine.dispose()
        self.temp_dir.cleanup()

    def test_user_analysis_history_detail_delete_analytics_workflow(self):
        response = self.client.post("/api/analyze", headers=self.headers, json={
            "sender_email": "security@paypaI-account-check.example",
            "subject": "URGENT: verify your account immediately",
            "body": "Your account is suspended. Confirm your password at https://bit.ly/secure-login within 24 hours.",
        })
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual(result["classification"], "Phishing")
        self.assertTrue(result["probability_calibrated"])
        self.assertIn("https://bit.ly/secure-login", result["urls"])
        record_id = result["id"]

        history = self.client.get("/api/history", headers=self.headers)
        self.assertEqual(history.status_code, 200, history.text)
        self.assertEqual(history.json()["total"], 1)
        self.assertEqual(history.json()["items"][0]["sender_domain"], "paypai-account-check.example")

        detail = self.client.get(f"/api/history/{record_id}", headers=self.headers)
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertEqual(detail.json()["classification"], "Phishing")

        analytics = self.client.get("/api/analytics", headers=self.headers)
        self.assertEqual(analytics.status_code, 200, analytics.text)
        self.assertEqual(analytics.json()["total"], 1)
        self.assertEqual(analytics.json()["counts"]["Phishing"], 1)

        deleted = self.client.delete(f"/api/history/{record_id}", headers=self.headers)
        self.assertEqual(deleted.status_code, 204)
        self.assertEqual(self.client.get("/api/analytics", headers=self.headers).json()["total"], 0)

    def test_eml_upload_uses_same_classifier_and_persists_source(self):
        eml = (
            b"From: offers@outdoor-store.example\r\n"
            b"Subject: Weekend trail gear sale\r\n"
            b"Content-Type: text/plain; charset=utf-8\r\n\r\n"
            b"Browse our seasonal catalog for hiking equipment."
        )
        response = self.client.post("/api/analyze/file", headers=self.headers, files={"file": ("sample.eml", eml, "message/rfc822")})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn(response.json()["classification"], {"Legitimate", "Spam", "Phishing"})
        history = self.client.get("/api/history", headers=self.headers).json()
        self.assertEqual(history["total"], 1)
        self.assertEqual(history["items"][0]["source"], "eml")

    def test_records_are_private_to_the_authenticated_user(self):
        response = self.client.post("/api/analyze", headers=self.headers, json={
            "sender_email": "security@paypaI-account-check.example",
            "subject": "URGENT: verify your account immediately",
            "body": "Confirm your password at https://bit.ly/secure-login within 24 hours.",
        })
        self.assertEqual(response.status_code, 200, response.text)
        record_id = response.json()["id"]
        other_user_headers = {"X-Test-User": "user_b"}

        self.assertEqual(self.client.get("/api/history", headers=other_user_headers).json()["total"], 0)
        self.assertEqual(self.client.get("/api/analytics", headers=other_user_headers).json()["total"], 0)
        self.assertEqual(self.client.get(f"/api/history/{record_id}", headers=other_user_headers).status_code, 404)
        self.assertEqual(self.client.delete(f"/api/history/{record_id}", headers=other_user_headers).status_code, 404)

    def test_history_requires_a_bearer_session(self):
        from app.auth import get_current_user

        self.main.app.dependency_overrides.pop(get_current_user)
        response = self.client.get("/api/history")
        self.assertEqual(response.status_code, 401)

    def test_oversized_eml_request_is_rejected_before_parsing(self):
        response = self.client.post(
            "/api/analyze/file",
            headers={**self.headers, "Content-Length": str(self.settings.max_eml_bytes + 64 * 1024 + 1)},
        )
        self.assertEqual(response.status_code, 413)


if __name__ == "__main__":
    unittest.main()
