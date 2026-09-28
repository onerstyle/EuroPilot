# EuroPilot Famille — Worker Cloudflare (alternative 1-clic à Supabase)

Stockage léger `code EURO-XXXX → base64 chiffré` (le Worker ne voit que du base64, chiffrement AES-GCM côté téléphone). Gratuit, CORS `*`, pas de vérif email, compatible `js/family-sync.js` en endpoint générique.

> Tu as déjà Supabase ? Garde-le. Le Worker est juste **l'alternative 1-clic** demandée.

---

## Option 1 — Depuis le navigateur (le plus rapide, 60 s, sans `wrangler`)

1. Va sur **https://dash.cloudflare.com** → **Workers & Pages** → **Create** → **Create Worker** → nom `europilot-family` → **Deploy**.
2. **Edit code** → efface tout → colle le contenu de [`worker/worker.js`](worker/worker.js) → **Save and deploy**.
3. Copie l'URL du Worker : `https://europilot-family.<ton-subdomaine>.workers.dev` (bouton **Visit**).
4. Dans EuroPilot, ouvre `F12` → **Console** → colle :
```js
localStorage.setItem('europilot.family.endpoint','https://europilot-family.TON_SUBDOMAINE.workers.dev');
localStorage.removeItem('europilot.family.key');
location.reload();
```
5. **Hard refresh** `Ctrl+Shift+R` → *Paramètres → Synchronisation Famille* → code `EURO-XXXX` → **Envoyer** → sur un 2e appareil même code → **Recevoir**.

*Note : sans KV/D1 lié, le Worker tourne en **mémoire volatile** (OK pour tester 1-2 h). Pour persister définitivement, fais l'option 2 ci-dessous (30 s).*

---

## Option 2 — Avec persistance KV (recommandé, 1 commande)

```bash
cd worker
npm i
# 1) crée le KV
npx wrangler kv namespace create FAMILY
# → copie l'id affiché
# 2) édite worker/wrangler.toml : décommente les 4 lignes [[kv_namespaces]] et remplace REPLACE_WITH_KV_ID + preview_id
npx wrangler deploy
# → URL affichée : https://europilot-family.<sub>.workers.dev
```

Puis même `localStorage.setItem(...)` que ci-dessus avec cette URL.

**Alternative D1** (SQLite) :
```bash
npx wrangler d1 create europilot-family
# copie l'id → décommente [[d1_databases]] dans wrangler.toml → npx wrangler deploy
```

---

## Option 3 — Bouton Deploy (si repo public)

Ajoute ce bouton dans ton README (remplace `onerstyle/EuroPilot`) :

```md
[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/onerstyle/EuroPilot)
```

Et configure le Worker : **Settings → Variables → KV namespace bindings** → `FAMILY` → ton KV.

---

## Vérifier que ça marche

- `https://xxx.workers.dev/health` → `{ ok: true, mode: "kv"|"d1"|"memory" }`
- `https://xxx.workers.dev/` → page d'aide avec la commande `localStorage` pré-remplie.
- Compatible Supabase REST aussi : `GET /rest/v1/family?code=eq.EURO-XXXX&select=data` et `POST /rest/v1/family?onConflict=code`.

## Dépannage

- `Failed to fetch` → vérifie CORS (le Worker renvoie `Access-Control-Allow-Origin: *`) et fais un hard refresh pour purger le SW `v9`.
- `Salon vide` → fais **Envoyer** sur l'appareil source d'abord, puis **Recevoir** sur l'autre.
- Données perdues en mode mémoire → crée un KV ou D1 (option 2).

## Pour mettre l'endpoint en dur dans le build APK

Édite `js/family-sync-config.js` :
```js
export const FAMILY_SYNC_ENDPOINT = "https://europilot-family.TON_SUBDOMAINE.workers.dev";
export const FAMILY_SYNC_KEY = "";
```
Puis `npm run sync:www` et rebuild.
