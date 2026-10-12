from email import policy
from email.message import Message
from email.parser import BytesParser
from email.utils import getaddresses
from html.parser import HTMLParser
import html
import re

from fastapi import HTTPException, UploadFile

from app.config import settings


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.hidden = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "head"}:
            self.hidden += 1
        elif tag in {"br", "p", "div", "li", "tr", "h1", "h2", "h3"}:
            self.parts.append(" ")
        if tag == "a" and not self.hidden:
            href = next((value for name, value in attrs if name.lower() == "href" and value), None)
            if href and href.lower().startswith(("http://", "https://", "www.")):
                self.parts.extend((" ", href, " "))

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "head"} and self.hidden:
            self.hidden -= 1
        elif tag in {"p", "div", "li", "tr"}:
            self.parts.append(" ")

    def handle_data(self, data: str) -> None:
        if not self.hidden:
            self.parts.append(data)


def _decode_part(part: Message) -> str:
    try:
        content = part.get_content()
        return content if isinstance(content, str) else ""
    except (LookupError, UnicodeError, TypeError):
        payload = part.get_payload(decode=True) or b""
        charset = part.get_content_charset() or "utf-8"
        try:
            return payload.decode(charset, errors="replace")
        except LookupError:
            return payload.decode("utf-8", errors="replace")


def _body_from(message: Message) -> str:
    plain: list[str] = []
    html_parts: list[str] = []
    parts = message.walk() if message.is_multipart() else [message]
    for part in parts:
        if part.is_multipart() or part.get_content_disposition() == "attachment" or part.get_filename():
            continue
        content_type = part.get_content_type()
        if content_type not in {"text/plain", "text/html"}:
            continue
        content = _decode_part(part)
        if content_type == "text/plain":
            plain.append(content)
        else:
            html_parts.append(content)
    if plain:
        body = "\n".join(plain)
    else:
        extractor = _TextExtractor()
        for part in html_parts:
            try:
                extractor.feed(part)
            except Exception:
                continue
        body = html.unescape(" ".join(extractor.parts))
    return re.sub(r"[\t\r\f\v ]+", " ", body).strip()[: settings.max_email_text_chars]


async def parse_eml_upload(upload: UploadFile) -> dict[str, str]:
    filename = (upload.filename or "").lower()
    if not filename.endswith(".eml"):
        raise HTTPException(status_code=415, detail="Upload a .eml message file.")
    raw = await upload.read(settings.max_eml_bytes + 1)
    if len(raw) > settings.max_eml_bytes:
        raise HTTPException(status_code=413, detail=f"The .eml file exceeds the {settings.max_eml_bytes // (1024 * 1024)} MB limit.")
    if not raw:
        raise HTTPException(status_code=400, detail="The uploaded .eml file is empty.")
    try:
        message = BytesParser(policy=policy.default).parsebytes(raw, headersonly=False)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="The .eml file could not be parsed.") from exc

    senders = [address for _, address in getaddresses(message.get_all("from", [])) if address]
    if not senders or "@" not in senders[0]:
        raise HTTPException(status_code=422, detail="The .eml file must contain a valid From address.")
    body = _body_from(message)
    if not body:
        raise HTTPException(status_code=422, detail="No readable text body was found in the .eml file.")
    return {"sender_email": senders[0][:320], "subject": str(message.get("subject", ""))[:998], "body": body}
