from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.core.config import settings
from app.services.gmail_client import GmailAuthRequiredError, gmail_resume_client

router = APIRouter()


class GmailConnectionStatus(BaseModel):
    connected: bool


def _app_base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def _callback_url(request: Request) -> str:
    return f"{_app_base_url(request)}{settings.api_v1_prefix}/gmail/oauth/callback"


@router.get("/status", response_model=GmailConnectionStatus)
def gmail_status() -> GmailConnectionStatus:
    return GmailConnectionStatus(connected=gmail_resume_client.is_connected())


@router.get("/oauth/start")
def gmail_oauth_start(request: Request) -> RedirectResponse:
    try:
        auth_url = gmail_resume_client.start_browser_oauth(
            redirect_uri=_callback_url(request),
        )
    except GmailAuthRequiredError as exc:
        error_url = f"{_app_base_url(request)}/?gmail_auth=error&message={quote(str(exc))}"
        return RedirectResponse(url=error_url, status_code=302)

    return RedirectResponse(url=auth_url, status_code=302)


@router.get("/oauth/callback")
def gmail_oauth_callback(
    request: Request,
    state: str | None = None,
    code: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    base_url = _app_base_url(request)

    if error:
        return RedirectResponse(
            url=f"{base_url}/?gmail_auth=error&message={quote(error)}",
            status_code=302,
        )

    if not state or not code:
        return RedirectResponse(
            url=f"{base_url}/?gmail_auth=error&message={quote('Missing OAuth callback parameters.')}",
            status_code=302,
        )

    try:
        gmail_resume_client.finish_browser_oauth(
            state=state,
            code=code,
            redirect_uri=_callback_url(request),
        )
    except GmailAuthRequiredError as exc:
        return RedirectResponse(
            url=f"{base_url}/?gmail_auth=error&message={quote(str(exc))}",
            status_code=302,
        )
    except Exception:
        return RedirectResponse(
            url=f"{base_url}/?gmail_auth=error&message={quote('Unexpected OAuth error.')}",
            status_code=302,
        )

    return RedirectResponse(url=f"{base_url}/?gmail_auth=connected", status_code=302)
