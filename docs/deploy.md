# Deploying Hissa

## Split: Vercel frontend, container API

- **Frontend (`apps/web`)** is a static Vite build, so it fits Vercel: https://hissa-peach.vercel.app
- **API (`apps/server/src/api.ts`)** does not fit serverless. It needs:
  - a long-lived process (the HTTP server stays up between requests),
  - an on-disk Arkiv journal and lock (`evidence/private/arkiv-writer`),
  - in-memory insight jobs that outlive the request that started them,
  - self-calls to its own x402 routes,
  - 0G calls that can take up to ~60 s.

  Run it on a container host (Railway, Render, Fly) or locally behind a tunnel.

## Run the API container

```sh
docker build -f Dockerfile.api -t hissa-api .
docker run --env-file .env -e HOST=0.0.0.0 -p 4021:4021 \
  -v $(pwd)/evidence:/app/evidence hissa-api
```

`.env` is never baked into the image (see `.dockerignore`); pass it at run time.
`/app/evidence` must be a persistent volume (Arkiv journal and lock).

## Required env vars (see `.env.example`)

- Arkiv: `ARKIV_WRITER_PRIVATE_KEY`, `ARKIV_ACCESS_KEY` (optional), `ARKIV_MAX_TX_COST_WEI`, `SERVICE_PRIVATE_KEY`
- Hedera: `HEDERA_TREASURY_ID`, `HEDERA_TREASURY_KEY`, `AGENT_HEDERA_ACCOUNT_ID`, `AGENT_HEDERA_PRIVATE_KEY`, `HEDERA_PAYMENT_TOPIC_ID`, `SELLER_HEDERA_ACCOUNT_ID`
- Agent caps: `AGENT_INITIAL_HBAR`, `AGENT_BUDGET_HBAR`, `AGENT_MAX_PER_PURCHASE_HBAR`, `AGENT_DAILY_CAP_HBAR`
- 0G: `ZG_API_KEY`
- CORS: `ALLOWED_ORIGINS=https://hissa-peach.vercel.app`
- Optional: `PORT` (4021), `HOST`, `API_URL`, `X402_FACILITATOR_URL`

## Railway / Render

1. New service from this repo; set the Dockerfile path to `Dockerfile.api`.
2. Set the env vars above.
3. Add a volume mounted at `/app/evidence`.
4. Open `https://hissa-peach.vercel.app/?api=https://<api host>`.

## Quick option: local API behind a tunnel

```sh
npm run demo:api
cloudflared tunnel --url http://localhost:4021
```

Then open `https://hissa-peach.vercel.app/?api=https://<tunnel host>` (and make sure `ALLOWED_ORIGINS` includes the Vercel origin).

## Warning

A public API spends testnet HBAR and 0G credits for anyone who hits it. Keep the `AGENT_*` caps low and set a credit limit on the 0G key.


## Current deployment (7 November 2026)

- Frontend: Vercel project `hissa`, served at https://hissa.tech and https://hissa-peach.vercel.app. Built from `apps/web` with `VITE_SERVICE_PUBLIC_KEY` and `VITE_API_URL` as build env.
- API: Fly.io app `hissa-mumbai-api`, region `sin` (Fly has no Mumbai region), one always-on machine, 1 GB volume `hissa_evidence` at `/app/evidence` for the Arkiv journal. Secrets were imported with `fly secrets import`; `ALLOWED_ORIGINS` lists the Vercel and hissa.tech origins.
- Redeploy the API: `fly deploy --app hissa-mumbai-api --remote-only --ha=false`. Never run a second API with the same `ARKIV_WRITER_PRIVATE_KEY` at the same time (local and Fly would race on nonces and the journal).
- Custom domain `api.hissa.tech`: certificate requested on Fly (`fly certs add`). In Cloudflare DNS add `A api 66.241.125.36` and `AAAA api 2a09:8280:1::1ed:3fd9:0` (DNS only, grey cloud), then `fly certs check api.hissa.tech`, then rebuild the frontend with `VITE_API_URL=https://api.hissa.tech`.
