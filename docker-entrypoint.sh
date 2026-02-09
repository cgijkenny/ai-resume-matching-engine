#!/usr/bin/env sh
set -eu

DEFAULT_CRED_PATH="${GMAIL_CREDENTIALS_PATH:-/app/oauth/credentials.json}"
DEFAULT_TOKEN_PATH="${GMAIL_TOKEN_PATH:-/app/oauth/token.json}"

if [ -n "${GMAIL_CREDENTIALS_JSON:-}" ]; then
  mkdir -p "$(dirname "$DEFAULT_CRED_PATH")"
  printf "%s" "$GMAIL_CREDENTIALS_JSON" > "$DEFAULT_CRED_PATH"
fi

if [ -n "${GMAIL_TOKEN_JSON:-}" ]; then
  mkdir -p "$(dirname "$DEFAULT_TOKEN_PATH")"
  printf "%s" "$GMAIL_TOKEN_JSON" > "$DEFAULT_TOKEN_PATH"
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
