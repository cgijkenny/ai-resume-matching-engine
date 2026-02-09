from __future__ import annotations

import base64
from dataclasses import dataclass
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

from app.core.config import settings

GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

SUPPORTED_ATTACHMENTS = {
    ".txt": "text/plain",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


@dataclass
class GmailAttachment:
    message_id: str
    subject: str
    sender: str
    filename: str
    mime_type: str
    raw_bytes: bytes


class GmailAuthRequiredError(RuntimeError):
    """Raised when Gmail OAuth token is missing or invalid."""


class GmailResumeClient:
    def __init__(self) -> None:
        self._service = None

    def _credentials_path(self) -> Path:
        return Path(settings.gmail_credentials_path)

    def _token_path(self) -> Path:
        return Path(settings.gmail_token_path)

    def _load_credentials(self, allow_interactive: bool = False) -> Credentials:
        token_path = self._token_path()
        credentials: Credentials | None = None

        if token_path.exists():
            try:
                credentials = Credentials.from_authorized_user_file(
                    str(token_path),
                    GMAIL_SCOPES,
                )
            except Exception as exc:
                raise GmailAuthRequiredError(
                    "Gmail token exists but is invalid. "
                    "Delete `backend/token.json` and run `python -m app.scripts.gmail_auth`."
                ) from exc

        if credentials and credentials.expired and credentials.refresh_token:
            try:
                credentials.refresh(Request())
            except Exception as exc:
                raise GmailAuthRequiredError(
                    "Could not refresh Gmail token. "
                    "Run `python -m app.scripts.gmail_auth` to re-authorize."
                ) from exc
            token_path.write_text(credentials.to_json(), encoding="utf-8")
            return credentials

        if credentials and credentials.valid:
            return credentials

        credentials_path = self._credentials_path()
        if not credentials_path.exists():
            raise GmailAuthRequiredError(
                f"Missing Gmail OAuth client file at `{credentials_path}`. "
                "Place your downloaded Google OAuth JSON there, then run "
                "`python -m app.scripts.gmail_auth`."
            )

        if not allow_interactive:
            raise GmailAuthRequiredError(
                "Gmail is not authorized yet. "
                "Run `python -m app.scripts.gmail_auth` once, then retry import."
            )

        flow = InstalledAppFlow.from_client_secrets_file(
            str(credentials_path),
            GMAIL_SCOPES,
        )
        credentials = flow.run_local_server(port=0, open_browser=True)
        token_path.write_text(credentials.to_json(), encoding="utf-8")
        return credentials

    def _get_service(self):
        if self._service is None:
            credentials = self._load_credentials()
            self._service = build(
                "gmail",
                "v1",
                credentials=credentials,
                cache_discovery=False,
            )
        return self._service

    def authorize_interactive(self) -> None:
        self._load_credentials(allow_interactive=True)
        self._service = None

    def _build_query(self, extra_query: str | None, label: str | None) -> str:
        parts = ["has:attachment", "(filename:pdf OR filename:docx OR filename:txt)"]
        scoped_label = label if label is not None else settings.gmail_resume_label
        if scoped_label and scoped_label.strip():
            parts.append(f"label:{scoped_label.strip()}")
        if extra_query and extra_query.strip():
            parts.append(extra_query.strip())
        return " ".join(parts)

    def fetch_recent_resume_attachments(
        self,
        max_messages: int = 20,
        query: str | None = None,
        label: str | None = None,
    ) -> list[GmailAttachment]:
        service = self._get_service()
        search_query = self._build_query(extra_query=query, label=label)

        message_response = (
            service.users()
            .messages()
            .list(
                userId="me",
                q=search_query,
                maxResults=max_messages,
            )
            .execute()
        )

        messages = message_response.get("messages", [])
        attachments: list[GmailAttachment] = []

        for message in messages:
            message_id = message.get("id")
            if not message_id:
                continue

            details = (
                service.users()
                .messages()
                .get(userId="me", id=message_id, format="full")
                .execute()
            )
            payload = details.get("payload", {})
            headers = payload.get("headers", [])
            subject = self._find_header(headers, "Subject")
            sender = self._find_header(headers, "From")

            payload_attachments = self._extract_supported_attachments(
                service=service,
                message_id=message_id,
                payload=payload,
            )
            for item in payload_attachments:
                attachments.append(
                    GmailAttachment(
                        message_id=message_id,
                        subject=subject,
                        sender=sender,
                        filename=item["filename"],
                        mime_type=item["mime_type"],
                        raw_bytes=item["raw_bytes"],
                    )
                )

        return attachments

    def _extract_supported_attachments(
        self,
        service,
        message_id: str,
        payload: dict,
    ) -> list[dict]:
        attachments: list[dict] = []
        stack = [payload]

        while stack:
            part = stack.pop()
            child_parts = part.get("parts") or []
            if child_parts:
                stack.extend(child_parts)

            filename = part.get("filename") or ""
            mime_type = part.get("mimeType") or "application/octet-stream"
            if not self._is_supported_attachment(filename=filename, mime_type=mime_type):
                continue

            body = part.get("body") or {}
            data = body.get("data")
            attachment_id = body.get("attachmentId")

            if not data and attachment_id:
                attachment_payload = (
                    service.users()
                    .messages()
                    .attachments()
                    .get(
                        userId="me",
                        messageId=message_id,
                        id=attachment_id,
                    )
                    .execute()
                )
                data = attachment_payload.get("data")

            if not data:
                continue

            attachments.append(
                {
                    "filename": filename,
                    "mime_type": mime_type,
                    "raw_bytes": self._decode_base64_url(data),
                }
            )

        return attachments

    def _is_supported_attachment(self, filename: str, mime_type: str) -> bool:
        if not filename:
            return False
        lower_filename = filename.lower()
        lower_mime = mime_type.lower()
        for extension, canonical_mime in SUPPORTED_ATTACHMENTS.items():
            if lower_filename.endswith(extension):
                return True
            if lower_mime == canonical_mime and extension in lower_filename:
                return True
        return False

    def _find_header(self, headers: list[dict], key: str) -> str:
        for item in headers:
            if item.get("name", "").lower() == key.lower():
                return item.get("value", "")
        return ""

    def _decode_base64_url(self, encoded: str) -> bytes:
        padded = encoded + ("=" * (-len(encoded) % 4))
        return base64.urlsafe_b64decode(padded.encode("utf-8"))


gmail_resume_client = GmailResumeClient()
