# Missed Call Capture

When a call goes unanswered (or is forwarded to the AI Receptionist), Twilio plays a text-to-speech disclosure and voicemail prompt, texts the caller **one** A2P opt-in SMS, and waits for **YES** before any AI qualifying conversation. After consent, the existing SMS estimate / scheduling / photo / dashboard flow continues unchanged.

---

## Table of contents

1. [Prerequisites](#prerequisites)
2. [Environment setup (.env)](#environment-setup-env)
3. [Running the app locally](#running-the-app-locally)
4. [Admin authentication](#admin-authentication)
5. [AWS S3 photo storage](#aws-s3-photo-storage)
6. [ngrok setup (required for local development)](#ngrok-setup-required-for-local-development)
7. [Twilio webhook configuration](#twilio-webhook-configuration)
8. [Business name (dynamic, editable)](#business-name-dynamic-editable)
9. [AI prompts (editable per tenant)](#ai-prompts-editable-per-tenant)
10. [A2P SMS consent (double opt-in)](#a2p-sms-consent-double-opt-in)
11. [Wave 2 — Scheduling, photos, and confirmation](#wave-2--scheduling-photos-and-confirmation)
12. [Viewing the database](#viewing-the-database)
13. [Testing the full flow](#testing-the-full-flow)
14. [Useful npm scripts](#useful-npm-scripts)
15. [Troubleshooting](#troubleshooting)
16. [Railway deployment](#railway-deployment)
17. [Architecture overview](#architecture-overview)

---

## Prerequisites

- **Node.js** 18+ ([nodejs.org](https://nodejs.org))
- **Twilio account** with a phone number ([twilio.com](https://www.twilio.com))
- **Anthropic API key** ([console.anthropic.com](https://console.anthropic.com))
- **ngrok account** (free tier works) — [ngrok.com](https://ngrok.com)
- **macOS / Linux / Windows** terminal

---

## Environment setup (.env)

### Step 1 — Copy the example file

```bash
cp .env.example .env
```

### Step 2 — Fill in your values

Open `.env` in the project root and set each variable:

| Variable | Required | Description | Example |
|---|---|---|---|
| `PORT` | No | Port the app runs on | `3000` |
| `APP_URL` | **Yes** | Public URL Twilio uses to reach your app. See [ngrok section](#ngrok-setup-required-for-local-development). | `https://abc123.ngrok-free.dev` |
| `DATABASE_PATH` | No | SQLite database file location | `./data/leads.db` |
| `DEFAULT_ACCOUNT_ID` | No | Tenant ID for the demo business | `demo-account-1` |
| `FRONTEND_URL` | No | Next.js dashboard URL (CORS) | `http://localhost:3001` |
| `TWILIO_ACCOUNT_SID` | **Yes** | From Twilio Console → Account Info | `ACxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | **Yes** | From Twilio Console → Account Info | `your_auth_token` |
| `TWILIO_PHONE_NUMBER` | **Yes** | Your Twilio number in E.164 format | `+19032807223` |
| `OWNER_PHONE_NUMBER` | Recommended | Shop/mobile to ring before voicemail | `+19035551212` |
| `OWNER_RING_TIMEOUT_SECONDS` | No | Seconds to ring owner (default 25) | `25` |
| `TWILIO_VALIDATE_SIGNATURE` | No | Set `false` for local dev; set `true` in production | `false` |
| `TWILIO_MESSAGING_SERVICE_SID` | No | Optional — use after A2P 10DLC registration | `MGxxxxxxxx` |
| `ANTHROPIC_API_KEY` | **Yes** | From Anthropic Console | `sk-ant-...` |
| `ANTHROPIC_MODEL` | No | Claude model ID | `claude-sonnet-4-6` |
| `AWS_REGION` | **Yes** | S3 region | `us-east-2` |
| `AWS_ACCESS_KEY_ID` | **Yes** | S3 IAM access key | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | **Yes** | S3 IAM secret | `...` |
| `S3_BUCKET` | **Yes** | Private S3 bucket for MMS photos | `preferredpdr-photos` |
| `JWT_SECRET` | **Yes** | Session token signing secret (64+ chars) | random hex |
| `JWT_EXPIRY` | No | Absolute token lifetime | `7d` |
| `SESSION_INACTIVITY_MINUTES` | No | Logout after this many idle minutes | `15` |
| `ADMIN_EMAIL` | **Yes**† | Initial admin email (seeded on first run) | `admin@example.com` |
| `ADMIN_PASSWORD` | **Yes**† | Initial admin password (change from dashboard) | `changeme` |

† `ADMIN_EMAIL` / `ADMIN_PASSWORD` are only used to seed the first admin. Change the password from the dashboard after logging in — future restarts do NOT overwrite the stored password.

### Where the URL goes in the code

The app reads `APP_URL` from `.env` via `config/env.js`. It is used for:

- **Twilio webhook signature validation** (`src/middleware/twilioValidator.js`)
- **Auto-configuring Twilio webhooks** (`npm run setup:twilio`)

You do **not** hardcode the ngrok URL anywhere in source code — only in `.env`:

```env
APP_URL=https://your-subdomain.ngrok-free.dev
```

After changing `APP_URL`, restart the server:

```bash
npm run dev
```

Generate a strong `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Running the app locally

```bash
# 1. Install backend dependencies (first time only)
npm install

# 2. Install frontend dependencies (first time only)
npm install --prefix frontend

# 3. Copy frontend env (first time only)
cp frontend/.env.local.example frontend/.env.local

# 4. Start both API (port 3000) and Next.js dashboard (port 3001)
npm run dev
```

You should see:

```
Missed Call Capture running on http://localhost:3000 (pid XXXXX)
Dashboard:  http://localhost:3001
API:        http://localhost:3000/api
Health:     http://localhost:3000/health
```

Open the dashboard: [http://localhost:3001](http://localhost:3001)

Run API or frontend separately if needed:

```bash
npm run dev:api        # Express API + webhooks only (port 3000)
npm run dev:frontend   # Next.js dashboard only (port 3001)
```

Keep this terminal running. You need **two terminals** for local development (app + ngrok).

---

## Admin authentication

The dashboard is protected by an email + password login. All `/api/leads/*` endpoints require a valid session; Twilio webhooks (`/webhooks/*`) remain public so Twilio can reach them.

### First-time sign-in

1. Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `JWT_SECRET` in `.env`
2. Start the app — the console shows `[db] Seeded default admin: <email>`
3. Open [http://localhost:3001](http://localhost:3001) — you'll be redirected to `/login`
4. Sign in with those credentials
5. Open the user menu (top right) → **Change password** — set a strong password and remove `ADMIN_PASSWORD` from `.env`

### Change password

Open the user menu in the dashboard header → **Change password**. Requires the current password, and the new password must be at least 8 characters.

### Sessions

- JWT stored in an **httpOnly cookie** (`mcc_session`) — not accessible to JavaScript
- Admins are logged out after 15 minutes of inactivity by default (`SESSION_INACTIVITY_MINUTES`)
- The inactivity window is sliding: authenticated API activity renews the cookie and token activity timestamp
- `JWT_EXPIRY` is the absolute token lifetime, not the idle timeout
- `secure` flag is set automatically in production (`NODE_ENV=production`)

### Multi-tenant design (per-business logins later)

The `admins` table has a nullable `account_id`:

- `NULL` → global admin (sees all tenants; currently defaults to `DEFAULT_ACCOUNT_ID`)
- `<account_id>` → per-tenant admin (future work: each shop only sees its own data)

`req.accountId` is derived from the authenticated admin — clients cannot bypass tenant scoping via query params.

### Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Sets `mcc_session` cookie |
| POST | `/api/auth/logout` | Public | Clears session cookie |
| GET  | `/api/auth/me` | Required | Returns current admin |
| POST | `/api/auth/change-password` | Required | Updates own password |

---

## AWS S3 photo storage

Inbound MMS photos are stored in a **private** S3 bucket. The dashboard never exposes S3 object URLs. Instead, image URLs point to the authenticated API (`/api/leads/:id/photos/:photoId`), which checks the admin session + tenant scope and streams the object from S3.

### IAM policy

The IAM user needs `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` on the bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET/*"
    }
  ]
}
```

Keep the bucket private — do NOT enable public access. Viewing is handled through the authenticated API proxy.

### Required bucket privacy settings

In AWS S3 → `preferredpdr-photos` → **Permissions**:

1. **Block public access**: turn ON all four settings
2. **Bucket policy**: remove any statement that allows `Principal: "*"` with `s3:GetObject`
3. **Object Ownership**: prefer **Bucket owner enforced** so ACLs are disabled
4. Existing objects: make sure none have public-read ACLs

After this, a direct S3 object URL should return `403 AccessDenied`. Photos should only load through `/api/leads/:id/photos/:photoId` after admin login.

### Storage layout

```
s3://<bucket>/
  accounts/
    <account_id>/
      leads/
        <lead_id>/
          <timestamp>-<rand>.<ext>
```

Storage backend is tracked per photo (`lead_photos.storage`) so future migrations (e.g. to another provider) can coexist with existing rows.

### Why not direct S3 or presigned URLs?

Direct S3 object URLs require public access, which is not acceptable for customer photos. Presigned URLs avoid public bucket access, but they are still bearer URLs — anyone who gets the URL can view the object until it expires. The current dashboard uses authenticated API URLs instead, so a copied image URL only works for someone with a valid admin session.

---

## ngrok setup (required for local development)

### Why ngrok?

Your app runs on `http://localhost:3000`. Twilio's servers are on the internet and **cannot reach localhost**. ngrok creates a temporary public HTTPS URL that forwards traffic to your local port 3000.

```
Caller → Twilio → https://your-ngrok-url/webhooks/... → ngrok → localhost:3000
```

When you deploy to production (Railway, Render, AWS, etc.), replace ngrok with your real domain in `APP_URL`.

### Step 1 — Install ngrok

**macOS (Homebrew):**

```bash
brew install ngrok
```

**Or download:** [https://ngrok.com/download](https://ngrok.com/download)

### Step 2 — Create a free account and add your authtoken

1. Sign up at [ngrok.com](https://ngrok.com)
2. Copy your authtoken from [dashboard.ngrok.com/get-started/your-authtoken](https://dashboard.ngrok.com/get-started/your-authtoken)
3. Run once:

```bash
ngrok config add-authtoken YOUR_AUTHTOKEN_HERE
```

This saves the token to ngrok's config file — **not** in `.env`.

### Step 3 — Start ngrok (second terminal)

With the app already running on port 3000:

```bash
ngrok http 3000
```

You'll see output like:

```
Forwarding   https://sprint-tavern-underwire.ngrok-free.dev -> http://localhost:3000
```

Copy the `https://...` URL.

### Step 4 — Add the URL to `.env`

```env
APP_URL=https://sprint-tavern-underwire.ngrok-free.dev
```

Restart `npm run dev`, then configure Twilio webhooks (next section).

### Important ngrok notes

- **Free plan:** the URL changes every time you restart ngrok. Update `APP_URL` in `.env` and re-run `npm run setup:twilio` each time.
- **Keep both running:** Terminal 1 = `npm run dev`, Terminal 2 = `ngrok http 3000`
- **Inspect requests:** open [http://127.0.0.1:4040](http://127.0.0.1:4040) while ngrok is running to see incoming webhook traffic

---

## Twilio webhook configuration

Twilio must know where to send call and SMS events. Webhook URLs are built from `APP_URL` in your `.env`.

### Option A — Automatic (recommended)

With the app and ngrok running, and `APP_URL` set in `.env`:

```bash
npm run setup:twilio
```

This sets on your Twilio phone number:

| Event | URL |
|---|---|
| Voice → A call comes in | `{APP_URL}/webhooks/voice/incoming` |
| Messaging → A message comes in | `{APP_URL}/webhooks/sms/inbound` |

Re-run this command whenever your ngrok URL changes.

### Option B — Twilio Console (manual)

Go to [Twilio Console → Phone Numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/incoming), click your number, and set:

| Setting | Method | URL |
|---|---|---|
| **A call comes in** | HTTP POST | `https://YOUR-NGROK-URL/webhooks/voice/incoming` |
| **A message comes in** | HTTP POST | `https://YOUR-NGROK-URL/webhooks/sms/inbound` |

Ensure `TWILIO_PHONE_NUMBER` in `.env` matches the number you configure.

### Verify caller IDs (trial / testing)

On trial accounts, only **verified** phone numbers can call your Twilio number and receive SMS.

Twilio Console → **Phone Numbers → Verified Caller IDs → Add a new Caller ID** (use SMS verification).

List verified numbers:

```bash
npm run verify:caller
```

---

## Business name (dynamic, editable)

The business name appears in AI-generated SMS messages (e.g. *"Hi, this is **Acme Services**..."*).

### Where it is stored

| Location | Purpose |
|---|---|
| `config/business.json` | Seed file — loaded into the database on startup |
| `accounts.name` in SQLite | **Runtime source of truth** — what the AI actually uses |

### Option 1 — Edit the seed file (requires restart)

Edit `config/business.json`:

```json
{
  "name": "Acme Services"
}
```

Restart the server. On startup, the name is synced to the `accounts` table.

### Option 2 — Update the database directly (no restart)

```bash
sqlite3 data/leads.db "UPDATE accounts SET name = 'My Business Name' WHERE id = 'demo-account-1';"
```

Changes apply on the **next webhook** — no server restart needed.

### Verify the current name

```bash
sqlite3 data/leads.db "SELECT id, name FROM accounts;"
```

---

## AI prompts (editable per tenant)

AI behavior (greeting tone, qualifying questions, field extraction) is stored in the **`prompt_configs`** database table, keyed by `account_id` + `prompt_type`.

| `prompt_type` | Used when |
|---|---|
| `greeting` | First **AI** SMS after the caller replies YES (consent gate already sent) |
| `qualify` | Processing further SMS replies — captures name, need, preferred time, location |
| `confirmation` | Owner confirms from dashboard — sends appointment confirmation SMS |

Consent / HELP / clarification SMS copy is **not** AI-generated. It lives in `config/consent.js` so A2P disclosure wording stays fixed and auditable.

The qualify prompt uses **mobile-service wording** (we come to the customer). It returns JSON with `extracted_preferred_time`, `extracted_location`, and `scheduling_complete` when both time and location are captured.

### View current prompts

```bash
sqlite3 data/leads.db "SELECT prompt_type, substr(system_prompt,1,80) FROM prompt_configs WHERE account_id='demo-account-1';"
```

### Edit a prompt (no restart needed)

```bash
sqlite3 data/leads.db "
UPDATE prompt_configs
SET system_prompt = 'Your new system prompt here with {{business_name}}',
    user_prompt = 'Your new user prompt here',
    updated_at = datetime('now')
WHERE account_id = 'demo-account-1' AND prompt_type = 'greeting';
"
```

### Available placeholders

| Placeholder | Replaced with |
|---|---|
| `{{business_name}}` | Value from `accounts.name` |
| `{{conversation_history}}` | Previous SMS thread (qualify prompt only) |
| `{{caller_message}}` | Latest inbound SMS (qualify prompt only) |
| `{{photo_count}}` | Number of damage photos received (qualify prompt only) |
| `{{appointment_type}}` | `inspection` or `repair` (confirmation prompt only) |
| `{{customer_name}}` | Lead name (confirmation prompt only) |
| `{{need_summary}}` | Damage/need description (confirmation prompt only) |
| `{{location}}` | Where the vehicle will be (confirmation prompt only) |
| `{{preferred_time}}` | Customer's preferred day/time (confirmation prompt only) |

### Default seed

On first run, prompts are seeded from `config/prompts.json`. After that, edit the database — the JSON file is only used for initial seeding. On startup, `greeting`, `qualify`, and `confirmation` prompts are upserted for all accounts so existing installs pick up consent + scheduling templates.

---

## A2P SMS consent (double opt-in)

Carrier / Twilio A2P campaigns require an explicit opt-in before conversational SMS. This app gates the AI Receptionist as follows:

```
Customer calls Twilio number
        ↓
OWNER_PHONE_NUMBER rings (owner can pick up)
        ↓
No answer / busy / failed
        ↓
Twilio TTS disclosure + voicemail (Record → hang up, no loop)
        ↓
ONE fixed opt-in SMS
        ↓
Lead status: awaiting_consent  (no AI messages)
        ↓
Caller replies YES / Y        → sms_opted_in_at set, AI greeting, then qualify flow
Caller replies STOP           → opted_out (no further automated texts)
Caller replies HELP           → fixed HELP SMS, stay awaiting_consent
Anything else                 → one clarification SMS, stay awaiting_consent
```

### Ring the owner first

Set these on the **API** service (local `.env` and Railway):

| Variable | Purpose |
|---|---|
| `OWNER_PHONE_NUMBER` | Your shop/mobile number in E.164 (e.g. `+19035551212`) — Twilio dials this first |
| `OWNER_RING_TIMEOUT_SECONDS` | How long to ring before voicemail (default `25`) |

If `OWNER_PHONE_NUMBER` is set, the greeting/opt-in SMS **only** run when you do not pick up. If left blank, Twilio assumes the call was already carrier-forwarded after no-answer and goes straight to voicemail (the previous “forwarded missed call” setup).

**Important:** Do not set your carrier to “forward all calls immediately” to Twilio if you use `OWNER_PHONE_NUMBER` — that double-routes and skips ringing you. Either:

1. Customers dial the **Twilio** number + `OWNER_PHONE_NUMBER` is set (app rings you first), or
2. Customers dial your **business** number + carrier forwards **only on unanswered** to Twilio, and leave `OWNER_PHONE_NUMBER` blank.

### Voice greeting (Twilio Say + Record)

Configured in `src/controllers/webhook.controller.js` using copy from `config/consent.js`. After the tone, callers can leave a voicemail (or stay silent). Recording completion is handled by `/webhooks/voice/voicemail-complete` so the disclosure does **not** repeat.

### Fixed SMS copy

| Trigger | Source |
|---|---|
| Opt-in (post-call) | `config/consent.js` → `OPT_IN_SMS` |
| HELP | `HELP_SMS` |
| Unrecognized reply while waiting | `CLARIFICATION_SMS` |

### Consent logging

Retained without a separate report UI:

- inbound **YES** in `messages` (conversation history)
- `leads.sms_opted_in_at` timestamp
- phone number on the lead

### Lead status flow (with consent)

```
new → awaiting_consent → qualifying → pending_confirmation → confirmed
              ↓                 ↑
           opted_out     (after YES / Y)
```

---

## Wave 2 — Scheduling, photos, and confirmation

After name and need are captured, the SMS conversation continues to collect:

1. **Preferred day/time** — mobile wording (e.g. *"When works best for us to come out to you?"*)
2. **Location** — address or area where the vehicle will be
3. **Damage photos** — customer texts MMS images; stored and shown on the lead detail page

When **time + location + name + need** are all captured, the lead moves to **`pending_confirmation`**.

### Lead fields (Wave 2)

| Field | Description |
|---|---|
| `preferred_time` | Caller's preferred day/time (free text, their own words) |
| `location` | Address or area where the vehicle will be |
| `appointment_type` | `inspection` or `repair` — set by owner on confirm |
| `confirmed_time` | Final scheduled time (may differ from preferred_time if owner adjusts) |

Photos are stored in **AWS S3** (`accounts/{account_id}/leads/{lead_id}/…`), tracked in the `lead_photos` table, and viewed through an authenticated API proxy. See [AWS S3 photo storage](#aws-s3-photo-storage).

### Lead status flow

```
new → awaiting_consent → qualifying → pending_confirmation → confirmed
              ↓
           opted_out
```

(After YES, the existing Wave 2 path continues: capture time + location + name + need → **pending confirmation**.)

The owner reviews **pending confirmation** leads on the dashboard (highlighted at the top of the list), views photos, chooses **inspection** or **repair**, optionally adjusts the time, and clicks **Confirm & send SMS**. That sends an AI-generated confirmation message (from the `confirmation` prompt) and moves the lead to **`confirmed`**.

### MMS photo capture

- Inbound MMS images are downloaded from Twilio and saved per lead (account-scoped).
- Photos appear in a gallery on the lead detail page.
- No AI analysis of photos in this milestone — receive, store, and display only.

### Confirm from dashboard

1. Open [http://localhost:3001](http://localhost:3001)
2. Click a **pending confirmation** lead
3. Review time, location, conversation, and photos
4. Choose **Repair** or **Inspection**, adjust time if needed, click **Confirm & send SMS**

Confirmation SMS examples (generated from editable config, not hardcoded):

- **Repair:** *"You're all set — we'll come out to [location] on [time] to take care of your [need]. See you then!"*
- **Inspection:** *"You're all set — we'll come out to [location] on [time] to take a look at the damage. See you then!"*

---

## Viewing the database

Database file: `./data/leads.db` (path set by `DATABASE_PATH` in `.env`)

### Terminal

```bash
sqlite3 data/leads.db
```

```sql
.tables
SELECT * FROM accounts;
SELECT id, caller_phone, status, name, need_summary FROM leads;
SELECT lead_id, direction, body, created_at FROM messages;
SELECT prompt_type FROM prompt_configs;
.quit
```

### GUI options

- **Cursor / VS Code:** install a "SQLite Viewer" extension and open `data/leads.db`
- **DB Browser for SQLite:** [sqlitebrowser.org](https://sqlitebrowser.org)

### Tables

| Table | Contents |
|---|---|
| `accounts` | Tenant/business info and Twilio number |
| `leads` | Captured callers, status, `sms_opted_in_at` |
| `messages` | Full SMS conversation history (includes YES opt-in) |
| `lead_photos` | MMS images (S3 keys) |
| `prompt_configs` | AI prompts per account |

---

## Testing the full flow

You need **three things running**:

| Terminal | Command |
|---|---|
| 1 | `npm run dev` |
| 2 | `ngrok http 3000` |
| 3 | (optional) watch logs / dashboard |

### End-to-end test

1. Ensure your test phone is in **Verified Caller IDs** (Twilio Console)
2. Call your Twilio number from that verified phone
3. Listen for the TTS disclosure, then leave a short voicemail after the tone
4. Watch Terminal 1 for:
   ```
   [webhook] POST /webhooks/voice/incoming
   [missed-call] Lead #1 created for +1...
   [missed-call] Opt-in SMS sent to +1...
   ```
5. Open [http://localhost:3001](http://localhost:3001) — lead should show **awaiting consent**
6. Text **YES** from the same phone — you should get the first AI qualifying question
7. Continue the SMS exchange (name, need, time, location, photos)
8. Dashboard should move the lead to `pending_confirmation` when time + location + name + need are captured

### Simulate inbound SMS without a real phone

```bash
# Opt-in YES (after a lead exists in awaiting_consent)
curl -X POST "http://localhost:3000/webhooks/sms/inbound" \
  -d "From=%2B15551234567" \
  -d "To=%2B19032807223" \
  -d "Body=YES"
```

Set `TWILIO_VALIDATE_SIGNATURE=false` locally if you are curling without a Twilio signature.

### Test SMS delivery to a specific number

```bash
TEST_PHONE=+19032808190 npm run check:sms
```

### Simulate an unrecognized reply while waiting (clarification)

```bash
curl -X POST "http://localhost:3000/webhooks/sms/inbound" \
  -d "From=%2B15551234567" \
  -d "To=%2B19032807223" \
  -d "Body=Hi+what+is+this"
```

Expect the fixed clarification SMS and status remaining `awaiting_consent` (no AI qualify yet).

---

## Useful npm scripts

| Command | Description |
|---|---|
| `npm run dev` | Start server with auto-reload (nodemon) |
| `npm start` | Start server (production) |
| `npm run setup:twilio` | Configure Twilio webhooks from `.env` |
| `npm run verify:caller` | List verified caller IDs on your Twilio account |
| `npm run check:sms` | Test SMS delivery to a number (`TEST_PHONE=+1...`) |

---

## Troubleshooting

### Nothing appears on dashboard after calling

- Is ngrok running? Check [http://127.0.0.1:4040](http://127.0.0.1:4040) for incoming requests
- Is `APP_URL` in `.env` matching your current ngrok URL?
- Did you run `npm run setup:twilio` after updating `APP_URL`?
- Is the caller's number in **Verified Caller IDs**? (trial accounts)

### Three duplicate SMS messages

Fixed in code — VoIP carriers can fire multiple webhooks per call. The app deduplicates with an in-flight lock and 5-minute cooldown. Restart the server to pick up the latest code.

### Error 21264 — caller not verified

Trial accounts reject calls from unverified numbers. Add the caller in Twilio Console → Verified Caller IDs.

### Error 21612 — US number cannot SMS UK

Your US Twilio number cannot send business SMS to UK mobiles. Use a US test number, or register a UK-compliant sender in Twilio.

### Error 30034 — A2P 10DLC

US SMS delivery requires A2P 10DLC registration. Twilio Console → Messaging → Regulatory Compliance → A2P 10DLC. Or upgrade your Twilio account.

### Error 21608 — unverified recipient (trial)

SMS can only be sent to verified numbers on trial accounts. Add the recipient in Verified Caller IDs.

### `[nodemon] clean exit` / port already in use

Another node process may be holding port 3000:

```bash
lsof -i :3000
kill <PID>
npm run dev
```

### Numero / virtual numbers

Numero can **receive** SMS but often **cannot send replies back** to Twilio. For testing SMS replies, use a real verified mobile phone.

---

## Architecture overview

```
index.js                  → API entry point (Express)
src/
  app.js                  → Express setup (webhooks + JSON API)
  routes/                 → URL routing
  controllers/            → webhook + API handlers
  repositories/           → tenant-scoped data access (account_id enforced)
  services/               → AI, SMS, missed-call, consent gate
  middleware/             → Twilio signature validation, CORS, logging
frontend/                 → Next.js dashboard (React + Tailwind)
  app/                    → pages (lead list, lead detail)
  components/             → interactive UI components
  lib/                    → API client + types
config/
  env.js                  → reads .env
  database.js             → schema, migrations, seed
  business.json           → seed business name
  prompts.json            → seed AI prompts
data/
  leads.db                → SQLite database (created on first run)
scripts/
  setup-twilio-webhooks.js
  verify-caller.js
  check-sms-delivery.js
```

### Multi-tenant design

Every tenant-scoped table has an `account_id` foreign key (indexed):

- `leads` — one lead per phone number per account (includes scheduling fields)
- `messages` — SMS log
- `lead_photos` — MMS images tied to leads (S3 storage keys)
- `prompt_configs` — editable AI prompts (`account_id` + `prompt_type`)
- `admins` — dashboard login accounts (nullable `account_id` → global or per-tenant)

All data access goes through `forAccount(accountId)` — no query runs without an explicit tenant scope. The demo uses one account (`demo-account-1`); adding tenants requires no schema changes.

### Lead status flow

```
new → awaiting_consent → qualifying → pending_confirmation → confirmed
              ↓
           opted_out
```

See [A2P SMS consent (double opt-in)](#a2p-sms-consent-double-opt-in) and [Wave 2 — Scheduling, photos, and confirmation](#wave-2--scheduling-photos-and-confirmation).

### API routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | Public | Health check |
| POST | `/api/auth/login` | Public | Set session cookie |
| POST | `/api/auth/logout` | Public | Clear session cookie |
| GET  | `/api/auth/me` | Required | Current admin |
| POST | `/api/auth/change-password` | Required | Change password |
| GET | `/api/leads` | Required | Lead list + stats (JSON) |
| GET | `/api/leads/:id` | Required | Lead detail with authenticated photo URLs |
| GET | `/api/leads/:id/photos/:photoId` | Required | Streams private S3 photo after auth + tenant checks |
| POST | `/api/leads/:id/confirm` | Required | Owner confirms — sends confirmation SMS |
| POST | `/webhooks/voice/incoming` | Public | Dial owner (or voicemail if no owner configured) |
| POST | `/webhooks/voice/dial-result` | Public | After Dial — voicemail + opt-in only if unanswered |
| POST | `/webhooks/voice/voicemail-complete` | Public | After Record — thank caller and hang up (stops greeting loop) |
| POST | `/webhooks/voice/status` | Public | Call status callback (backup missed-call path) |
| POST | `/webhooks/sms/inbound` | Public | Consent gate + AI qualify after YES / MMS to S3 |

The Next.js dashboard at `http://localhost:3001` consumes the `/api/*` endpoints.

---

## Production deployment

When deploying to a hosted server:

1. Set `APP_URL` to your production domain (e.g. `https://yourapp.com`)
2. Set `TWILIO_VALIDATE_SIGNATURE=true`
3. Run `npm run setup:twilio` to update webhook URLs
4. Complete Twilio **A2P 10DLC** registration for US SMS
5. Replace SQLite with Postgres if needed for scale

No ngrok required in production.

## Railway deployment

Use `RAILWAY_DEPLOYMENT.md` for the full step-by-step Railway setup, including:

- Two Railway services (`preferredpdr-api` and `preferredpdr-web`)
- GitHub automatic deploys from `main`
- Railway variables to copy from `.env`
- Persistent SQLite volume setup
- Frontend `/api/*` proxy so auth cookies and protected image URLs stay on the dashboard domain
- Twilio webhook URLs for production
