from app.services.gmail_client import GmailAuthRequiredError, gmail_resume_client


def main() -> None:
    print("Starting Gmail OAuth authorization...")
    print("A browser window will open. Sign in and grant access.")
    try:
        gmail_resume_client.authorize_interactive()
    except GmailAuthRequiredError as exc:
        print(f"Authorization setup error: {exc}")
        raise SystemExit(1) from exc
    except Exception as exc:  # pragma: no cover
        print(f"Authorization failed: {exc}")
        raise SystemExit(1) from exc

    print("Authorization complete.")
    print("Token saved to backend/token.json")


if __name__ == "__main__":
    main()
