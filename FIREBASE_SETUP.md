# EuroPilot Famille — Firebase (nouvelle stratégie par défaut)

Nouveau backend **Firebase Realtime Database** — gratuit, persistant, CORS `*`, pas de vérif email, compatible 100% EuroPilot (données chiffrées côté téléphone, le serveur ne voit que du `base64`).

> Worker Cloudflare (`WORKER_SETUP.md`) et Supabase (`SUPABASE_SETUP.md`) restent disponibles en alternatives. Firebase est juste la nouvelle **stratégie par défaut** demandée.

---

## 1. Crée le projet (2 min)

1. Va sur **https://console.firebase.google.com** → **Add project** → nom `europilot-family` → **Continue** (désactive Google Analytics si tu veux, pas besoin).
2. Une fois créé : **Build → Realtime Database** → **Create Database** → choisis **Europe (`europe-west1`)** → **Start in test mode** (règles `read: true, write: true` — les données sont chiffrées côté client, donc pas grave) → **Enable**.

## 2. Récupère l'URL

Dans **Realtime Database → Data** → copie l'URL en haut, du type :

```
https://europilot-family-default-rtdb.europe-west1.firebasedatabase.app
```

L'endpoint EuroPilot sera :

```
https://europilot-family-default-rtdb.europe-west1.firebasedatabase.app/family
```

## 3. Règles (test mode déjà OK)

Vérifie dans **Realtime Database → Rules** :

```json
{
  "rules": {
    "family": {
      ".read": true,
      ".write": true
    }
  }
}
```

Si tu vois `"auth != null"`, remplace par `true` puis **Publish**.

## 4. Branche EuroPilot dessus — 2 options

### Option A — en 10 s depuis la console (recommandé, sans rebuild)

Ouvre l'app → `F12` → **Console** → colle :

```js
localStorage.setItem('europilot.family.endpoint','https://europilot-family-default-rtdb.europe-west1.firebasedatabase.app/family');
localStorage.removeItem('europilot.family.key');
location.reload();
```

Puis **hard refresh** `Ctrl+Shift+R` → **Paramètres → Synchronisation Famille** → code `EURO-XXXX` → **Envoyer** → sur 2e appareil même code → **Recevoir**.

### Option B — en dur dans le build APK

Édite `js/family-sync-config.js` :

```js
export const FAMILY_SYNC_ENDPOINT = "https://europilot-family-default-rtdb.europe-west1.firebasedatabase.app/family";
export const FAMILY_SYNC_KEY = "";
```

Puis `npm run sync:www` et rebuild.

## 5. Vérifier

- Dans Firebase **Realtime Database → Data** → tu dois voir `family / EURO-XXXX : "eyJpdiI6..."` (base64 chiffré, illisible sans le code).
- Règle de sécurité : même avec `read: true`, sans le code personne ne peut déchiffrer.

## Dépannage

- `Firebase non configuré` → tu as laissé `REPLACE_ME` — fais l'étape 4.
- `Permission denied` → règles pas en `true` — corrige l'étape 3 puis **Publish**.
- `Failed to fetch` → hard refresh `Ctrl+Shift+R` pour purger le SW `v11` → `v12`.

## Alternative locale

Le **Worker preview** (`https://8787-xxx.e2b.app`) tourne toujours pour tester sans compte : `localStorage.setItem('europilot.family.endpoint','https://8787-xxx.e2b.app')`.
