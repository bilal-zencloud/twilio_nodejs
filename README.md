# Missed Call Capture

When a call goes unanswered, this module texts the caller back with an AI-generated message, runs a short SMS exchange to capture their info, and saves the lead to a dashboard.

---

## Table of contents

1. [Prerequisites](#prerequisites)
2. [Environment setup (.env)](#environment-setup-env)
3. [Running the app locally](#running-the-app-locally)
4. [ngrok setup (required for local development)](#ngrok-setup-required-for-local-development)
5. [Twilio webhook configuration](#twilio-webhook-configuration)
6. [Business name (dynamic, editable)](#business-name-dynamic-editable)
7. [AI prompts (editable per tenant)](#ai-prompts-editable-per-tenant)
8. [Viewing the database](#viewing-the-database)
9. [Testing the full flow](#testing-the-full-flow)
10. [Useful npm scripts](#useful-npm-scripts)
11. [Troubleshooting](#troubleshooting)
12. [Architecture overview](#architecture-overview)

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
| `TWILIO_ACCOUNT_SID` | **Yes** | From Twilio Console → Account Info | `ACxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | **Yes** | From Twilio Console → Account Info | `your_auth_token` |
| `TWILIO_PHONE_NUMBER` | **Yes** | Your Twilio number in E.164 format | `+19032807223` |
| `TWILIO_VALIDATE_SIGNATURE` | No | Set `false` for local dev; set `true` in production | `false` |
| `TWILIO_MESSAGING_SERVICE_SID` | No | Optional — use after A2P 10DLC registration | `MGxxxxxxxx` |
| `ANTHROPIC_API_KEY` | **Yes** | From Anthropic Console | `sk-ant-...` |
| `ANTHROPIC_MODEL` | No | Claude model ID | `claude-sonnet-4-6` |

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

---

## Running the app locally

```bash
# 1. Install dependencies (first time only)
npm install

# 2. Start the development server
npm run dev
```

You should see:

```
Missed Call Capture running on http://localhost:3000 (pid XXXXX)
Dashboard:  http://localhost:3000/dashboard
Health:     http://localhost:3000/health
```

Open the dashboard: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)

Keep this terminal running. You need **two terminals** for local development (app + ngrok).

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
| `greeting` | First SMS after a missed call |
| `qualify` | Processing the caller's SMS reply |

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

### Default seed

On first run, prompts are seeded from `config/prompts.json`. After that, edit the database — the JSON file is only used for initial seeding.

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
| `leads` | Captured callers and their status |
| `messages` | Full SMS conversation history |
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
2. Call your Twilio number from that verified phone — **do not answer**
3. Watch Terminal 1 for:
   ```
   [webhook] POST /webhooks/voice/incoming
   [missed-call] Lead #1 created for +1...
   [missed-call] Greeting SMS sent to +1...
   ```
4. Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard) — lead should appear
5. Reply to the SMS from the **same phone** that received it
6. Dashboard should update with name/need and status `captured`

### Test SMS delivery to a specific number

```bash
TEST_PHONE=+19032808190 npm run check:sms
```

### Simulate an SMS reply (no phone needed)

```bash
curl -X POST "http://localhost:3000/webhooks/sms/inbound" \
  -d "From=%2B12513855121" \
  -d "To=%2B19032807223" \
  -d "Body=Hi+my+name+is+John+and+I+need+plumbing+help"
```

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
index.js                  → entry point
src/
  app.js                  → Express setup
  routes/                 → URL routing
  controllers/            → webhook + dashboard handlers
  repositories/           → tenant-scoped data access (account_id enforced)
  services/               → AI, SMS, missed-call logic
  middleware/             → Twilio signature validation, logging
  views/                    → EJS dashboard
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

- `leads` — one lead per phone number per account
- `messages` — SMS log
- `prompt_configs` — editable AI prompts (`account_id` + `prompt_type`)

All data access goes through `forAccount(accountId)` — no query runs without an explicit tenant scope. The demo uses one account (`demo-account-1`); adding tenants requires no schema changes.

### Lead status flow

```
new → contacted → qualifying → captured
```

### API routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/dashboard` | Lead list |
| GET | `/dashboard/leads/:id` | Lead detail + messages |
| POST | `/webhooks/voice/incoming` | Incoming call → reject + greeting SMS |
| POST | `/webhooks/voice/status` | Call status callback (backup) |
| POST | `/webhooks/sms/inbound` | Inbound SMS → AI capture |

---

## Production deployment

When deploying to a hosted server:

1. Set `APP_URL` to your production domain (e.g. `https://yourapp.com`)
2. Set `TWILIO_VALIDATE_SIGNATURE=true`
3. Run `npm run setup:twilio` to update webhook URLs
4. Complete Twilio **A2P 10DLC** registration for US SMS
5. Replace SQLite with Postgres if needed for scale

No ngrok required in production.
