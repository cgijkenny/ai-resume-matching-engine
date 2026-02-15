# One Stop Resume Engine

Web app to screen resumes and rank candidates against a job using NLP and semantic similarity.

## Features
- Create and manage job descriptions with required skills.
- Import resumes from Gmail attachments (`.pdf`, `.docx`, `.txt`).
- Connect Gmail directly from the web app via OAuth.
- Connect LinkedIn directly from the web app via OAuth.
- One-click connect flow for Gmail then LinkedIn.
- Combined import endpoint for Gmail + LinkedIn in one action.
- Import LinkedIn profile basics as a resume snapshot.
- Upload resume files manually from the UI.
- Run matching and get ranked candidates with:
  - final score
  - semantic score
  - skill score
  - missing skills

## Tech Stack
- Backend: FastAPI (Python)
- Frontend: React + Vite
- NLP:
  - SentenceTransformer embeddings when model is available
  - TF-IDF fallback when embeddings are unavailable
- Deployment: Docker, Docker Compose, Render Blueprint

## Project Structure
```text
backend/
  app/
    core/            # settings/config
    routers/         # API endpoints
    services/        # matcher, resume parser, gmail client
    scripts/         # one-time setup scripts (gmail auth)
frontend/
  src/               # React app
Dockerfile           # single-service deploy image (Render)
docker-compose.yml   # local multi-service stack
render.yaml          # Render blueprint
```

## Quick Start (Local with Docker)
```bash
cd <project-root>
docker compose up --build
```

Open:
- Web UI: `http://localhost:5173`
- API docs: `http://localhost:8000/docs`

## Gmail OAuth Setup (Non-Technical User Flow)
1. In Google Cloud Console create OAuth client type `Web application`.
2. Add authorized redirect URI:
- `https://<your-domain>/api/v1/gmail/oauth/callback`
3. Set deployment secrets:
- `GMAIL_CREDENTIALS_JSON` (full OAuth client JSON)
- `GMAIL_CREDENTIALS_PATH=/app/oauth/credentials.json`
- `GMAIL_TOKEN_PATH=/app/oauth/token.json`
4. End users click `Connect Gmail` in UI and authorize from browser.

## LinkedIn OAuth Setup (Non-Technical User Flow)
1. Open [LinkedIn Developers](https://www.linkedin.com/developers/apps), create/select your app.
2. Add the `Sign In with LinkedIn using OpenID Connect` product.
3. In your app auth settings add redirect URL:
- `https://<your-domain>/api/v1/linkedin/oauth/callback`
4. In deployment environment set:
- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `LINKEDIN_TOKEN_PATH=/app/oauth/linkedin_token.json`
- `LINKEDIN_SCOPES=openid profile email`
5. End users click `Connect LinkedIn` in UI and authorize from browser.

## How to Use
1. Open the web app.
2. Create a job.
3. Click `Connect Gmail` once, then click `Import Resumes`.
4. Click `Connect LinkedIn` once, then click `Import LinkedIn Profile`.
5. Or click `Connect Both Accounts` then `Import Gmail + LinkedIn`.
6. Or upload resumes manually.
7. Select the job and click `Run Matching`.

## Non-Technical User Flow
1. Open the app URL.
2. Use `Sign in with Gmail` or `Sign in with LinkedIn` in the UI.
3. Click import button to fetch profile/resumes.
4. Run matching from the same page.

Note: only the admin/deployer does OAuth app setup once in Google/LinkedIn and Render.

## Main API Endpoints
- `GET /api/v1/health`
- `GET /api/v1/gmail/status`
- `GET /api/v1/gmail/oauth/start`
- `GET /api/v1/gmail/oauth/callback`
- `GET /api/v1/linkedin/status`
- `GET /api/v1/linkedin/oauth/start`
- `GET /api/v1/linkedin/oauth/callback`
- `POST /api/v1/jobs`
- `GET /api/v1/jobs`
- `POST /api/v1/resumes/upload`
- `POST /api/v1/resumes/import/gmail`
- `POST /api/v1/resumes/import/linkedin`
- `POST /api/v1/resumes/import/combined`
- `POST /api/v1/resumes/match/{job_id}`

## LinkedIn Data Scope Note
For standard LinkedIn OAuth apps, LinkedIn exposes user profile info through OpenID Connect.
LinkedIn job-application resume retrieval is restricted to partner programs/APIs and is not available in standard public app access.

## Deploy as Public Web App (Render)
1. Push project to GitHub.
2. In Render, create a Blueprint from this repository.
3. Render uses `render.yaml` and builds the service.
4. Add these environment variables in Render:
- `GMAIL_CREDENTIALS_JSON` = full JSON content of OAuth credentials file
- `GMAIL_CREDENTIALS_PATH` = `/app/oauth/credentials.json`
- `GMAIL_TOKEN_PATH` = `/app/oauth/token.json`
- `LINKEDIN_CLIENT_ID` = LinkedIn app client ID
- `LINKEDIN_CLIENT_SECRET` = LinkedIn app client secret
- `LINKEDIN_TOKEN_PATH` = `/app/oauth/linkedin_token.json`
- `LINKEDIN_SCOPES` = `openid profile email`
5. Deploy latest commit.

## Environment Variables
See `.env.example` for all variables.

## Notes
- Keep Gmail credentials/token private.
- Keep LinkedIn client secret/token private.
- Do not commit secret files.
