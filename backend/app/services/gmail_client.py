from __future__ import annotations

import base64
import json
import time
from dataclasses import dataclass
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
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


@dataclass
class PendingOAuthState:
    state: str
    redirect_uri: str
    created_at: float


class GmailAuthRequiredError(RuntimeError):
    """Raised when Gmail OAuth token is missing or invalid."""


class GmailResumeClient:
    def __init__(self) -> None:
        self._service = None
        self._pending_states: dict[str, PendingOAuthState] = {}
        self._oauth_state_ttl_seconds = 900

    def _credentials_path(self) -> Path:
        return Path(settings.gmail_credentials_path)

    def _token_path(self) -> Path:
        return Path(settings.gmail_token_path)

    def _client_config(self) -> dict:
        credentials_path = self._credentials_path()
        if not credentials_path.exists():
            raise GmailAuthRequiredError(
                f"Missing Gmail OAuth client file at `{credentials_path}`."
            )
        try:
            return json.loads(credentials_path.read_text(encoding="utf-8"))
        except Exception as exc:
            raise GmailAuthRequiredError(
                f"Invalid Gmail OAuth client JSON at `{credentials_path}`."
            ) from exc

    def _is_web_oauth_client(self) -> bool:
        config = self._client_config()
        return "web" in config

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
                    "Reconnect Gmail from the app."
                ) from exc

        if credentials and credentials.expired and credentials.refresh_token:
            try:
                credentials.refresh(Request())
            except Exception as exc:
                raise GmailAuthRequiredError(
                    "Could not refresh Gmail token. "
                    "Reconnect Gmail from the app."
                ) from exc
            token_path.write_text(credentials.to_json(), encoding="utf-8")
            return credentials

        if credentials and credentials.valid:
            return credentials

        credentials_path = self._credentials_path()
        if not credentials_path.exists():
            raise GmailAuthRequiredError(
                f"Missing Gmail OAuth client file at `{credentials_path}`. "
                "Upload it in deployment settings."
            )

        if not allow_interactive:
            raise GmailAuthRequiredError(
                "Gmail is not connected yet. Click `Connect Gmail` in the app."
            )

        flow = InstalledAppFlow.from_client_secrets_file(
            str(credentials_path),
            GMAIL_SCOPES,
        )
        credentials = flow.run_local_server(port=0, open_browser=True)
        token_path.write_text(credentials.to_json(), encoding="utf-8")
        return credentials

    def is_connected(self) -> bool:
        try:
            credentials = self._load_credentials(allow_interactive=False)
            return bool(credentials and credentials.valid)
        except GmailAuthRequiredError:
            return False

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

    def _cleanup_expired_states(self) -> None:
        now = time.time()
        expired = [
            state_key
            for state_key, payload in self._pending_states.items()
            if (now - payload.created_at) > self._oauth_state_ttl_seconds
        ]
        for state_key in expired:
            self._pending_states.pop(state_key, None)

    def start_browser_oauth(self, redirect_uri: str) -> str:
        if not self._is_web_oauth_client():
            raise GmailAuthRequiredError(
                "OAuth client is not configured as `Web application`. "
                "Create a web OAuth client in Google Cloud and update credentials."
            )

        self._cleanup_expired_states()
        flow = Flow.from_client_config(
            self._client_config(),
            scopes=GMAIL_SCOPES,
            redirect_uri=redirect_uri,
        )
        auth_url, state = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
        )
        self._pending_states[state] = PendingOAuthState(
            state=state,
            redirect_uri=redirect_uri,
            created_at=time.time(),
        )
        return auth_url

    def finish_browser_oauth(self, state: str, code: str, redirect_uri: str) -> None:
        self._cleanup_expired_states()
        pending = self._pending_states.get(state)
        if pending is None:
            raise GmailAuthRequiredError("OAuth session expired. Click `Connect Gmail` again.")
        if pending.redirect_uri != redirect_uri:
            self._pending_states.pop(state, None)
            raise GmailAuthRequiredError("OAuth redirect mismatch. Start Gmail connection again.")

        flow = Flow.from_client_config(
            self._client_config(),
            scopes=GMAIL_SCOPES,
            state=state,
            redirect_uri=redirect_uri,
        )
        try:
            flow.fetch_token(code=code)
        except Exception as exc:
            raise GmailAuthRequiredError("Could not complete Gmail authorization.") from exc

        token_path = self._token_path()
        token_path.parent.mkdir(parents=True, exist_ok=True)
        token_path.write_text(flow.credentials.to_json(), encoding="utf-8")
        self._pending_states.pop(state, None)
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
