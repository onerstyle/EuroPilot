# EuroPilot Famille — Worker

Worker Cloudflare pour la synchro Famille EuroPilot (`EURO-XXXX` → `base64` chiffré).

Voir [`../WORKER_SETUP.md`](../WORKER_SETUP.md) pour le guide 1-clic (dashboard) et les commandes `wrangler`.

## Fichiers

- `worker.js` — le Worker (KV/D1/mémoire)
- `wrangler.toml` — config (KV `FAMILY` ou D1 `DB` — optionnels pour tester)
- `package.json` — `npm i` + `npx wrangler deploy`

## Endpoints

- `GET /` — page d'aide (affiche la commande `localStorage` à coller)
- `GET /health` — `{ ok, mode }`
- `GET /EURO-XXXX` — retourne le `base64` (ou 404)
- `POST /EURO-XXXX` — body = `base64` (ou JSON `{data}`) → stocke
- `GET /rest/v1/family?code=eq.EURO-XXXX` — compat Supabase (retourne `[{code,data}]`)
- `POST /rest/v1/family?onConflict=code` — compat Supabase (upsert)

CORS `*` activé.

## Test local

```bash
npm i
npx wrangler dev
# http://localhost:8787/health → { ok:true, mode:"memory" }
curl http://localhost:8787/EURO-TEST -X POST -d "hello"
curl http://localhost:8787/EURO-TEST
```
