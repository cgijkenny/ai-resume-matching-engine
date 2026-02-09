# AI Resume Screening and Job Matching Engine

## Ready Modes
- Local web app with Docker Compose (`frontend + backend`).
- Public web app deployment as a single Docker service (Render-ready).

## Local Web App (Current Working Setup)
```bash
cd <project-root>
docker compose up --build
```

Open:
- `http://localhost:5173` (web app)
- `http://localhost:8000/docs` (API docs)

## Gmail OAuth (One-Time)
1. Put Google OAuth client file at:
- `backend/oauth/credentials.json`

2. Generate token:
```bash
cd backend
source .venv/bin/activate
GMAIL_CREDENTIALS_PATH=oauth/credentials.json GMAIL_TOKEN_PATH=oauth/token.json python -m app.scripts.gmail_auth
```

3. Restart backend container:
```bash
cd <project-root>
docker compose restart backend
```

## Public Web App Deployment (Render)
This repo includes:
- `Dockerfile` (single service: FastAPI serves built frontend)
- `render.yaml`

Steps:
1. Push this project to GitHub.
2. In Render: **New +** -> **Blueprint** -> select your repo.
3. Render reads `render.yaml` and creates one web service.
4. Add secret env vars in Render:
- `GMAIL_CREDENTIALS_JSON` (JSON content of OAuth credentials file)
- `GMAIL_TOKEN_JSON` (JSON content of generated token file)
5. Deploy.

After deploy, your public URL is your web app URL.

## Optional: Single-Container Local Test
```bash
cd <project-root>
docker build -t resume-webapp .
docker run --rm -p 8000:8000 resume-webapp
```

Open: `http://localhost:8000`
