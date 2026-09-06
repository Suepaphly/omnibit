# Omnibit Index Forge — Web (MVP)

Next.js App Router console for **Base Sepolia (84532)** live testing.

## Site map

- `/` — Marketing home (value prop, accretion, fees, CTAs)
- `/app` — Product console overview + address status
- `/app/launch` … `/app/redeem` — Nested console flows
- `/docs` — Markdown docs

## Vercel

- **Root Directory:** `apps/web`
- Framework: Next.js
- Build uses the `build` script (`prebuild` copies docs into `content/`)
- Env: copy `.env.example` to Project Environment Variables

## Local

```bash
cd apps/web
cp .env.example .env.local
# install deps, then run the dev script
```

Docs load from `content/*.md` (synced via `scripts/copy-docs.js` on prebuild).
