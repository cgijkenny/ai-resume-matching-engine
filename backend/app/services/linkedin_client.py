from __future__ import annotations

import json
import secrets
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.core.config import settings

LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo"


@dataclass
class PendingLinkedInState:
    state: str
    redirect_uri: str
    created_at: float


class LinkedInAuthRequiredError(RuntimeError):
    """Raised when LinkedIn OAuth is not configured or connected."""


class LinkedInResumeClient:
    def __init__(self) -> None:
        self._pending_states: dict[str, PendingLinkedInState] = {}
        self._oauth_state_ttl_seconds = 900

    def _token_path(self) -> Path:
        return Path(settings.linkedin_token_path)

    def _cleanup_expired_states(self) -> None:
        now = time.time()
        expired = [
            state_key
            for state_key, payload in self._pending_states.items()
            if (now - payload.created_at) > self._oauth_state_ttl_seconds
        ]
        for state_key in expired:
            self._pending_states.pop(state_key, None)

    def _scopes(self) -> str:
        scope_value = settings.linkedin_scopes.strip()
        if not scope_value:
            return "openid profile email"
        return scope_value

    def _validate_client_config(self) -> None:
        if not settings.linkedin_client_id.strip() or not settings.linkedin_client_secret.strip():
            raise LinkedInAuthRequiredError(
                "LinkedIn OAuth client is not configured. "
                "Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET."
            )

    def _load_token(self) -> dict:
        token_path = self._token_path()
        if not token_path.exists():
            raise LinkedInAuthRequiredError(
                "LinkedIn is not connected yet. Click `Connect LinkedIn` in the app."
            )
        try:
            return json.loads(token_path.read_text(encoding="utf-8"))
        except Exception as exc:
            raise LinkedInAuthRequiredError(
                f"Invalid LinkedIn token file at `{token_path}`. Reconnect LinkedIn."
            ) from exc

    def _access_token(self) -> str:
        token = self._load_token()
        expires_at = token.get("expires_at")
        if isinstance(expires_at, (int, float)) and time.time() >= float(expires_at):
            raise LinkedInAuthRequiredError(
                "LinkedIn token expired. Click `Connect LinkedIn` again."
            )
        access_token = token.get("access_token")
        if not isinstance(access_token, str) or not access_token.strip():
            raise LinkedInAuthRequiredError("LinkedIn token is missing access token.")
        return access_token

    def is_connected(self) -> bool:
        try:
            _ = self._access_token()
            return True
        except LinkedInAuthRequiredError:
            return False

    def start_browser_oauth(self, redirect_uri: str) -> str:
        self._validate_client_config()
        self._cleanup_expired_states()

        state = secrets.token_urlsafe(24)
        self._pending_states[state] = PendingLinkedInState(
            state=state,
            redirect_uri=redirect_uri,
            created_at=time.time(),
        )
        query = urlencode(
            {
                "response_type": "code",
                "client_id": settings.linkedin_client_id.strip(),
                "redirect_uri": redirect_uri,
                "state": state,
                "scope": self._scopes(),
            }
        )
        return f"{LINKEDIN_AUTH_URL}?{query}"

    def finish_browser_oauth(self, state: str, code: str, redirect_uri: str) -> None:
        self._validate_client_config()
        self._cleanup_expired_states()

        pending = self._pending_states.get(state)
        if pending is None:
            raise LinkedInAuthRequiredError("LinkedIn OAuth session expired. Try connecting again.")
        if pending.redirect_uri != redirect_uri:
            self._pending_states.pop(state, None)
            raise LinkedInAuthRequiredError("LinkedIn OAuth redirect mismatch.")

        payload = urlencode(
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": settings.linkedin_client_id.strip(),
                "client_secret": settings.linkedin_client_secret.strip(),
            }
        ).encode("utf-8")
        request = Request(
            LINKEDIN_TOKEN_URL,
            data=payload,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )

        try:
            with urlopen(request, timeout=20) as response:
                body = response.read().decode("utf-8")
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            self._pending_states.pop(state, None)
            raise LinkedInAuthRequiredError(
                f"LinkedIn token exchange failed ({exc.code}): {detail or exc.reason}"
            ) from exc
        except URLError as exc:
            self._pending_states.pop(state, None)
            raise LinkedInAuthRequiredError("LinkedIn token exchange failed due to network issue.") from exc

        token_data = json.loads(body)
        access_token = token_data.get("access_token")
        expires_in = token_data.get("expires_in")
        if not isinstance(access_token, str) or not access_token:
            self._pending_states.pop(state, None)
            raise LinkedInAuthRequiredError("LinkedIn token response did not include access token.")

        now = time.time()
        expires_seconds = int(expires_in) if isinstance(expires_in, (int, float, str)) else 3600
        token_payload = {
            **token_data,
            "created_at": now,
            "expires_at": now + max(60, expires_seconds - 60),
        }

        token_path = self._token_path()
        token_path.parent.mkdir(parents=True, exist_ok=True)
        token_path.write_text(json.dumps(token_payload), encoding="utf-8")
        self._pending_states.pop(state, None)

    def fetch_profile_resume(self) -> dict:
        access_token = self._access_token()
        request = Request(
            LINKEDIN_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            method="GET",
        )

        try:
            with urlopen(request, timeout=20) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise LinkedInAuthRequiredError(
                f"LinkedIn profile request failed ({exc.code}): {detail or exc.reason}"
            ) from exc
        except URLError as exc:
            raise LinkedInAuthRequiredError("Could not reach LinkedIn profile endpoint.") from exc

        full_name = str(payload.get("name") or "").strip()
        if not full_name:
            given_name = str(payload.get("given_name") or "").strip()
            family_name = str(payload.get("family_name") or "").strip()
            full_name = " ".join(part for part in [given_name, family_name] if part) or "LinkedIn Candidate"

        profile_lines = ["LinkedIn Profile Snapshot", f"Name: {full_name}"]
        email = str(payload.get("email") or "").strip()
        if email:
            profile_lines.append(f"Email: {email}")
        locale = payload.get("locale")
        if locale:
            profile_lines.append(f"Locale: {locale}")
        subject_id = payload.get("sub")
        if subject_id:
            profile_lines.append(f"LinkedIn ID: {subject_id}")

        return {
            "candidate_name": full_name,
            "text": "\n".join(profile_lines),
            "skills": [],
        }


linkedin_resume_client = LinkedInResumeClient()
