# wildrow-frontend

Mobile-first investor web client for the Wildrow Crowdsourced Micro-Investment
Platform. Vite + React + TypeScript, talking to `wildrow-backend`'s REST API.

## Screens

Phone + OTP login → Tier 1 KYC (NRC + MNO match) → Dashboard (wallet balance,
active T-Bill pool) → Top-up (MNO STK push flow with live status polling) →
Withdraw → Transaction history → Profile.

## Local development

```bash
cp .env.example .env   # point VITE_API_BASE_URL at your local backend
npm ci
npm run dev             # http://localhost:5173
```

Run `wildrow-backend` alongside it (`docker compose up` in that repo) so the
app has something to talk to. In non-production, `POST /v1/auth/otp/request`
returns `devCode` in the response body so you can log in without a real SMS
gateway.

## Build

```bash
npm run build      # outputs to dist/, VITE_API_BASE_URL baked in at build time
npm run preview
```

## Deploying

Static SPA served by nginx in a small container — see `Dockerfile`,
`nginx.conf`, and `cloudbuild.yaml`. Because the API base URL is baked in at
build time, **staging and production are built as separate images**, unlike
the backend where the same image is promoted across environments. See
`CI_CD_GUIDE.md` in `wildrow-infra` for the full pipeline.
