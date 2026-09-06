# Omnibit Index Forge — Web (MVP)

Next.js App Router console for **Base Sepolia (84532)** live testing.

## Vercel

- **Root Directory:** `apps/web`
- Framework: Next.js
- Build uses the `build` script (`prebuild` copies docs into `content/`)
- Env: copy `.env.example` → Project Environment Variables

## Local

```bash
cd apps/web
# install dependencies with your preferred package manager
cp .env.example .env.local   # fill addresses + WalletConnect project id
# then run the "dev" script
```

Docs are loaded from `content/*.md` (synced from repo `docs/` + root README via `scripts/copy-docs.js` on prebuild).
