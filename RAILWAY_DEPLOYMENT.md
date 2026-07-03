# Railway Deployment

This project deploys to Railway as **two services** from the same GitHub repo:

- `preferredpdr-api` — Express API + Twilio webhooks, from repo root
- `preferredpdr-web` — Next.js dashboard, from `frontend/`

The frontend proxies `/api/*` to the API service. This keeps dashboard auth cookies and protected photo URLs on the frontend domain while the backend still stores/streams photos from private S3.

## 1. Push latest code to GitHub

Railway auto-deploys from GitHub. Make sure your latest code is pushed to `main`.

```bash
git status
git add -A
git commit -m "Prepare Railway deployment"
git push origin main
```

Only commit source/config examples. Do **not** commit `.env` or `frontend/.env.local`.

## 2. Create Railway project

1. Go to [Railway](https://railway.app)
2. Click **New Project**
3. Choose **Deploy from GitHub repo**
4. Select `bilal-zencloud/twilio_nodejs`
5. Create the first service as the backend/API service

## 3. Backend service: `preferredpdr-api`

In the Railway service settings:

- **Service name:** `preferredpdr-api`
- **Root Directory:** leave blank / repo root
- **Build:** Nixpacks
- **Start command:** `npm start`
- **Branch:** `main`
- **Automatic deploys:** enabled

Railway should pick up `railway.json` at repo root.

### Add a volume for SQLite

This app currently uses SQLite, so the backend needs persistent disk:

1. Open `preferredpdr-api`
2. Go to **Volumes**
3. Add a volume
4. Mount path: `/data`
5. Keep API replicas at **1** while using SQLite

Set:

```env
DATABASE_PATH=/data/leads.db
```

## 4. Backend environment variables

In `preferredpdr-api` → **Variables**, add these. Copy the secret values from your local `.env`.

Do not set `PORT`; Railway provides it.

```env
NODE_ENV=production

# URLs
APP_URL=https://<your-api-service-domain>
FRONTEND_URL=https://<your-web-service-domain>

# SQLite volume
DATABASE_PATH=/data/leads.db

# Tenant
DEFAULT_ACCOUNT_ID=demo-account-1

# Twilio
TWILIO_ACCOUNT_SID=<copy from local .env>
TWILIO_AUTH_TOKEN=<copy from local .env>
TWILIO_PHONE_NUMBER=<copy from local .env>
TWILIO_VALIDATE_SIGNATURE=true
# Optional if using Messaging Service / A2P:
# TWILIO_MESSAGING_SERVICE_SID=<MG...>

# Anthropic
ANTHROPIC_API_KEY=<copy from local .env>
ANTHROPIC_MODEL=claude-sonnet-4-6

# S3 private photo storage
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=<copy from local .env>
AWS_SECRET_ACCESS_KEY=<copy from local .env>
S3_BUCKET=preferredpdr-photos

# Admin auth
JWT_SECRET=<generate a strong random secret>
JWT_EXPIRY=7d
SESSION_INACTIVITY_MINUTES=15
ADMIN_EMAIL=<initial admin email>
ADMIN_PASSWORD=<initial admin password>
```

Generate `JWT_SECRET` locally:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`ADMIN_EMAIL` / `ADMIN_PASSWORD` are only used when the first admin is seeded. After first login, change the password from the dashboard.

## 5. Generate backend public domain

1. Open `preferredpdr-api`
2. Go to **Settings** → **Networking**
3. Generate a Railway domain
4. Copy it
5. Set backend `APP_URL` to that exact URL

Example:

```env
APP_URL=https://preferredpdr-api-production.up.railway.app
```

Redeploy the API after changing `APP_URL`.

## 6. Frontend service: `preferredpdr-web`

Create a second service in the same Railway project:

1. Click **New Service**
2. Choose **GitHub Repo**
3. Select the same repo: `bilal-zencloud/twilio_nodejs`
4. Set **Root Directory** to:

```text
frontend
```

Service settings:

- **Service name:** `preferredpdr-web`
- **Root Directory:** `frontend`
- **Build command:** `npm run build`
- **Start command:** `npm start`
- **Branch:** `main`
- **Automatic deploys:** enabled

Railway should pick up `frontend/railway.json`.

## 7. Frontend environment variables

In `preferredpdr-web` → **Variables**:

```env
NODE_ENV=production
API_PROXY_TARGET=https://<your-api-service-domain>
API_SERVER_URL=https://<your-api-service-domain>
NEXT_PUBLIC_SESSION_INACTIVITY_MINUTES=15
```

Do **not** set `NEXT_PUBLIC_API_URL` in production. Leaving it unset makes browser requests use same-origin `/api/*`, which lets the frontend proxy calls to the backend while keeping auth cookies on the dashboard domain.

## 8. Generate frontend public domain

1. Open `preferredpdr-web`
2. Go to **Settings** → **Networking**
3. Generate a Railway domain
4. Copy it
5. Set backend `FRONTEND_URL` to that URL

Example:

```env
FRONTEND_URL=https://preferredpdr-web-production.up.railway.app
```

Redeploy both services after setting final URLs.

## 9. Update Twilio webhooks

Once the API domain is final, configure Twilio to call the API service:

```text
Voice webhook:
POST https://<your-api-service-domain>/webhooks/voice/incoming

SMS webhook:
POST https://<your-api-service-domain>/webhooks/sms/inbound
```

You can do this manually in Twilio Console, or run locally with `APP_URL` temporarily set to the Railway API URL:

```bash
APP_URL=https://<your-api-service-domain> npm run setup:twilio
```

Because production should use `TWILIO_VALIDATE_SIGNATURE=true`, `APP_URL` must exactly match the public API URL Twilio calls.

## 10. Verify deployment

Backend:

```text
https://<your-api-service-domain>/health
```

Expected:

```json
{"status":"ok"}
```

Frontend:

```text
https://<your-web-service-domain>
```

Expected:

- Redirects to `/login`
- Login works with the seeded admin credentials
- Change password works
- Dashboard loads

Photo security:

- Dashboard images should use URLs like:

```text
https://<your-web-service-domain>/api/leads/1/photos/1
```

- Open that URL in incognito: should not work without login
- Plain S3 object URLs should return `403 AccessDenied`

## 11. Automatic deploys

Railway auto-deploys each service when `main` receives a new push.

For future changes:

```bash
git add -A
git commit -m "Your change"
git push origin main
```

Railway will deploy:

- `preferredpdr-api` for backend/root changes
- `preferredpdr-web` for frontend changes

If you want safer releases later, use a staging branch and configure Railway to deploy from that branch first.

## 12. Production notes

- Keep S3 Block Public Access ON.
- Keep SQLite backend replicas at 1 while using a Railway volume.
- Do not expose or commit `.env`.
- Consider rotating AWS/Twilio/Anthropic keys if they have been shared outside Railway/local `.env`.
- For higher scale later, move from SQLite to Postgres.
