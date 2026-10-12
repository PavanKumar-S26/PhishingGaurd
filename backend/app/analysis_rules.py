from __future__ import annotations

import ipaddress
import re
from urllib.parse import urlsplit

URL_RE = re.compile(r"(?i)\b(?:https?://|www\.)[^\s<>\"'{}|\\^`]+")
URGENCY_RE = re.compile(r"(?i)\b(urgent(?:ly)?|immediately|within 24 hours|account (?:suspended|locked)|verify your (?:account|identity)|password expires|payment failed|confirm your password)\b")
SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "ow.ly", "is.gd", "buff.ly", "cutt.ly", "rb.gy"}
BRANDS = {
    "paypal": {"paypal.com"}, "microsoft": {"microsoft.com", "live.com", "office.com"},
    "apple": {"apple.com", "icloud.com"}, "google": {"google.com", "gmail.com"},
    "amazon": {"amazon.com"}, "netflix": {"netflix.com"}, "docusign": {"docusign.com"},
    "chase": {"chase.com"}, "dropbox": {"dropbox.com"},
}


def _host(url: str) -> str:
    candidate = url if "://" in url else f"http://{url}"
    try:
        return (urlsplit(candidate).hostname or "").lower().rstrip(".")
    except ValueError:
        return ""


def _base_domain(host: str) -> str:
    labels = host.lower().split(".")
    return ".".join(labels[-2:]) if len(labels) >= 2 else host.lower()


def inspect_email(sender_email: str, subject: str, body: str) -> tuple[list[str], list[dict], list[str]]:
    text = f"{subject}\n{body}"
    urls = list(dict.fromkeys(match.rstrip(".,;:!?)]}") for match in URL_RE.findall(text)))[:50]
    indicators: list[dict] = []
    explanation: list[str] = []

    def add(code: str, label: str, severity: str, message: str) -> None:
        if not any(item["code"] == code for item in indicators):
            indicators.append({"code": code, "label": label, "severity": severity, "message": message})
            explanation.append(message)

    for url in urls:
        host = _host(url)
        if not host:
            continue
        if host in SHORTENERS:
            add("url_shortener", "Link shortener", "medium", f"A shortened link ({host}) hides its final destination. Do not open it from an untrusted message.")
        try:
            ipaddress.ip_address(host)
            add("ip_url", "IP-address link", "high", "A link points directly to an IP address instead of a recognizable domain.")
        except ValueError:
            pass
        if "xn--" in host:
            add("punycode_domain", "Internationalized domain", "high", "A link uses a punycode domain, which can be used to imitate another domain.")
        if "@" in urlsplit(url if "://" in url else f"http://{url}").netloc:
            add("url_userinfo", "Misleading link format", "high", "A link contains user-info syntax that can make its actual destination harder to recognize.")
        if len(host) > 55 or host.count("-") >= 4:
            add("unusual_domain", "Unusual link domain", "medium", "A link has an unusually long or hyphen-heavy domain; verify it independently.")

    sender_domain = sender_email.rsplit("@", 1)[-1].strip().lower().rstrip(".") if "@" in sender_email else ""
    linked_domains = {_base_domain(_host(url)) for url in urls if _host(url)}
    if sender_domain and linked_domains:
        sender_base = _base_domain(sender_domain)
        mismatches = [domain for domain in linked_domains if domain != sender_base]
        if mismatches:
            sample = ", ".join(sorted(mismatches)[:2])
            add("sender_link_mismatch", "Sender / link domain mismatch", "low", f"The sender domain ({sender_base}) differs from a linked domain ({sample}); this can be normal, but verify the destination before acting.")

    lowered = text.lower()
    for brand, approved_domains in BRANDS.items():
        if re.search(rf"\b{re.escape(brand)}\b", lowered) and sender_domain and not any(sender_domain == domain or sender_domain.endswith("." + domain) for domain in approved_domains):
            add("brand_sender_mismatch", "Brand / sender mismatch", "medium", f"The message mentions {brand.title()}, but the sender domain ({sender_domain}) is not one of its known domains.")
            break

    if URGENCY_RE.search(text):
        add("urgency_language", "Urgency or credential pressure", "medium", "The message uses urgent account or verification language. Confirm requests through a known official channel.")
    if re.search(r"(?i)\b(password|passcode|one[- ]time code|social security|bank details)\b", text) and re.search(r"(?i)\b(reply|send|enter|confirm|verify|provide)\b", text):
        add("sensitive_data_request", "Sensitive information request", "high", "The message appears to request credentials or other sensitive information. Never send them by email.")

    return urls, indicators, explanation


def calculate_risk(classification: str, probability: float, indicators: list[dict]) -> tuple[str, bool]:
    uncertain = probability < 0.55
    severities = {item["severity"] for item in indicators}
    if classification == "Phishing":
        risk = "Critical" if probability >= 0.80 else "High" if probability >= 0.60 else "Elevated"
    elif classification == "Spam":
        risk = "Elevated" if probability >= 0.75 else "Guarded"
    else:
        risk = "Elevated" if "high" in severities else "Guarded" if severities else "Low"
    if uncertain and risk == "Low":
        risk = "Guarded"
    return risk, uncertain
