# PhishGuard — Phishing Email Classifier

A single full-stack email-security service: React/Vite frontend, FastAPI API, one shared calibrated scikit-learn classifier, and MySQL storage. Individual accounts are managed by Clerk; analysis history and analytics are private to each signed-in user.

> **Important:** This is a screening aid, not a safety guarantee. The bundled labeled corpus is a small curated demonstration dataset. Replace it with reviewed, representative, permissioned data and validate independently before production use. The displayed holdout score is a measured training snapshot, not a performance promise.

## Features

- Dashboard analytics and trends computed only from saved MySQL analysis records.
- Email analysis by sender, subject, and body; or safe `.eml` upload (2 MB limit). Attachments are never executed or inspected, and links are never opened.
- One classifier for pasted and uploaded email: calibrated TF-IDF + Logistic Regression, predicting Legitimate, Spam, or Phishing. Separate transparent rules flag link patterns, sender/link domain differences, brand mismatches, urgency, and sensitive-data requests.
- Clerk-backed individual sign-in/sign-up. The API verifies short-lived bearer session tokens against Clerk JWKS; no shared API key is distributed to users.
- Searchable/filterable/paginated history, record details, and deletion scoped to the signed-in user's Clerk ID. Email bodies, subjects, and sender addresses are not stored; only the sender domain and analysis metadata are retained.
- Public health endpoint reports dependency status without secrets. All model, analysis, history, analytics, and account-check API routes require a verified session.

## Project layout

- `frontend/` — React, Vite, JavaScript, Tailwind CSS v4, Recharts, Axios.
- `backend/` — FastAPI, SQLAlchemy, PyMySQL, validation, safe RFC 822 parsing, API.
- `ml/data/emails.csv` — labeled demonstration emails used for training.
- `ml/train_model.py` — stratified evaluation, probability calibration, artifact generation.
- `ml/artifacts/` — generated local model artifact; ignored by git.

## GitHub and hosting

Pushing this repository to GitHub stores the source code and runs the build/test workflow; GitHub does not automatically host this full-stack application or provide its MySQL database. The application needs a separately hosted FastAPI backend, a MySQL database, and Clerk authentication configuration. Set the environment values from `.env.example` in the chosen hosting services' secret/configuration settings, and use the deployed API HTTPS URL for `VITE_API_BASE_URL` when building the frontend. Never commit `.env`, Clerk secret keys, database passwords, model artifacts, or user data. The GitHub Actions workflow verifies backend tests and a frontend build on pushes and pull requests.

## Windows setup

Run the following in **PowerShell** from the repository root. Python 3.11+ and Node.js 20+ are recommended. Install and start MySQL Server 8.x separately if it is not installed. The Python service does not provision MySQL.

### 1. Create the MySQL database and application account

Connect as a MySQL administrator (for example, with MySQL Workbench or `mysql -u root -p`), then execute:

```sql
CREATE DATABASE phishguard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'phishguard'@'127.0.0.1' IDENTIFIED BY 'replace-with-a-strong-local-password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, ALTER ON phishguard.* TO 'phishguard'@'127.0.0.1';
FLUSH PRIVILEGES;
```

Use `localhost` or `127.0.0.1` consistently with the corresponding MySQL account host. Never use the example password in a shared or production system.

### 2. Configure Clerk authentication

Create a Clerk application in the Clerk Dashboard. Enable the sign-in methods you want and configure the allowed application origins. Add the local origin `http://localhost:5173` for development and your exact HTTPS frontend origin for production. In Clerk, copy the **Publishable key** and note the Frontend API domain / issuer. Configure your JWT verification settings from that same Clerk instance; the expected JWKS URL is `https://<frontend-api-domain>/.well-known/jwks.json`, and `CLERK_ISSUER` must exactly match the token's `iss` claim (the Frontend API domain, without the JWKS path).

### 3. Configure environment variables

```powershell
Copy-Item .env.example .env
notepad .env
```

Set `DATABASE_URL` to your MySQL credentials. Set the Clerk variables from the **same** Clerk instance:

- `VITE_CLERK_PUBLISHABLE_KEY` — the Clerk publishable key; it is public and is used by the browser SDK.
- `CLERK_JWKS_URL` — `https://<frontend-api-domain>/.well-known/jwks.json`.
- `CLERK_ISSUER` — exact issuer/Frontend API domain, e.g. `https://example.clerk.accounts.dev`.
- `CLERK_AUDIENCE` — leave empty unless you configure an audience claim in Clerk; if set, tokens must contain that audience.
- `CORS_ORIGINS` — comma-separated exact frontend origins, e.g. `http://localhost:5173` locally and `https://app.example.com` in production.
- `ALLOWED_HOSTS` — comma-separated hostnames (without scheme/port) accepted by the API, including the production API hostname and any trusted proxy hostname used in the `Host` header.

Keep `.env` private; it is ignored by git. Never place database credentials, Clerk secret keys, or other server secrets in `VITE_*` variables. The Clerk publishable key is intentionally browser-visible. `VITE_API_BASE_URL` points to the API's public HTTPS base URL in production.

### 4. Install backend dependencies, train the classifier, and start FastAPI

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
python ml\train_model.py
python -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

Keep this terminal open. On first startup, SQLAlchemy creates the schema after a successful database connection. `/api/health` reports an explicit degraded status and database/model details if MySQL or the generated model is unavailable. Analysis APIs return a clear service error until dependencies are ready. Re-train the artifact after replacing/updating the labeled CSV, then restart the backend; the model is loaded once at API startup.

### 5. Install and start the frontend

In a **second PowerShell terminal**, from the repository root:

```powershell
Set-Location frontend
npm install
npm run dev
```

Vite reads the shared root `.env` from its configured environment directory. Open the URL displayed in that terminal (normally `http://localhost:5173`) and create an account or sign in using the Clerk-hosted identity configuration.

To verify a production frontend build:

```powershell
npm run build
```

### Backend checks

With `.venv` active and the repository root as the working directory:

```powershell
$env:PYTHONPATH = "backend"
python -m unittest app.tests -v
```

## API overview

Except for `GET /api/health`, routes require `Authorization: Bearer <Clerk session token>`. The frontend obtains the token from the signed-in Clerk session; clients must not use a shared API key.

- `GET /api/health` — public dependency/model health status.
- `GET /api/auth/check` — validates the signed-in Clerk session.
- `POST /api/analyze` — JSON `{ "sender_email": "...", "subject": "...", "body": "..." }`.
- `POST /api/analyze/file` — multipart upload with field `file`; only `.eml`, maximum configured size.
- `GET /api/history` — only the current user's records; supports `page`, `page_size`, `q`, `classification`, `risk_level`, `from_date`, `to_date` filters.
- `GET /api/history/{id}` and `DELETE /api/history/{id}` — detail and deletion.
- `GET /api/analytics` — current-user counts, distribution, daily trend and recent records, optionally `from_date` / `to_date`.
- `GET /api/model` — model artifact metadata and measured holdout snapshot.

Probability values are calibrated by cross-validation on the training corpus. Calibration does not mean well-calibrated on production traffic, especially with the bundled small corpus. Rule-based indicators do not alter the model label or probability; they contribute to the separately displayed combined risk level. Low confidence raises a visible uncertainty notice and never means guaranteed safe.

## Security and deployment notes

- Create a production Clerk instance/domain and validate sign-in, sign-out, token expiry, and origin allowlists before launch. Do not use development Clerk keys in production.
- Set `CORS_ORIGINS` and `ALLOWED_HOSTS` to exact production origins/hosts; never use wildcard CORS/hosts. Terminate TLS at a trusted ingress and serve frontend/API only over HTTPS. Keep MySQL private, use TLS to MySQL where supported, store server secrets in a secret manager, and use a least-privilege DB account.
- Apply network/edge rate limits and request timeouts to authentication-adjacent and analysis endpoints. Use a managed WAF/reverse proxy, centralized logs/alerts, backups, retention controls, and a deployment health check. Do not rely on per-process in-memory limits if scaling to multiple API replicas.
- The startup compatibility migration adds a nullable `owner_id` to pre-existing analysis rows. Legacy rows with no verified owner are intentionally excluded from all user views; review and remove or securely archive them before launch. Back up production data and use a proper migration job for multi-replica/zero-downtime deployments.
- The local `.env` included during development is not a production secret store. Rotate any credentials or tokens that were shared, exposed, or reused; inject fresh values into the hosting provider's secret/environment settings.
- File uploads are bounded, parsed with Python's standard email parser, and never execute attachments. Email headers and body have size/shape validation. HTML email body text is extracted without rendering it in the frontend.
- Model artifacts are trusted local joblib files. Do not load artifacts from untrusted sources.
- Stored rows intentionally omit full email content, subject, sender local part, and message identifiers. URL/indicator metadata may still be sensitive; use access controls and retention policies appropriate to your environment.
- Obtain independent security review and validate the model against representative, permissioned data before relying on it for production decisions.
