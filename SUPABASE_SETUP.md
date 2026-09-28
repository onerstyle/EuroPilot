# Supabase pour EuroPilot Famille — Setup 2 min

EuroPilot chiffre tout côté téléphone (AES-GCM, clé = CODE `EURO-XXXX`) — le serveur ne voit que du base64. Supabase sert juste de casier léger avec une table 1 colonne.

## 1. Crée le projet
1. Va sur **https://supabase.com/dashboard** → **New project**
2. Nom : `europilot-family` — Database password : génère un fort (tu ne t'en serviras pas)
3. Région : **EU West (Ireland)** — **Create project** (1-2 min)

## 2. Crée la table `family`
**SQL Editor** → **New query** → colle et **Run** :

```sql
create table family (
  code text primary key,
  data text not null,
  updated_at timestamptz default now()
);
alter table family enable row level security;
create policy "Allow all" on family for all using (true) with check (true);
```

## 3. Récupère l'URL et la clé anon
**Project Settings → API** → copie :
- **Project URL** : `https://xxxxx.supabase.co`
- **anon public** : `eyJhbG...` (clé longue JWT)

## 4. Branche EuroPilot dessus — 2 options

### Option A — en 10 s depuis la console (recommandé, pas besoin de rebuild)
Ouvre l'app → `F12` → onglet **Console** → colle :

```js
localStorage.setItem('europilot.family.endpoint','https://xxxxx.supabase.co/rest/v1/family');
localStorage.setItem('europilot.family.key','eyJhbG...');
location.reload();
```

Puis **hard refresh** `Ctrl+Shift+R` → **Envoyer** dans *Synchronisation Famille* doit passer. À faire sur chaque appareil une fois (le CODE reste `EURO-XXXX`).

Pour vérifier : `localStorage.getItem('europilot.family.endpoint')`

Pour effacer : `localStorage.removeItem('europilot.family.endpoint'); localStorage.removeItem('europilot.family.key')`

### Option B — en dur dans le code (pour le build APK)
Édite `js/family-sync-config.js` :

```js
export const FAMILY_SYNC_ENDPOINT = "https://xxxxx.supabase.co/rest/v1/family";
export const FAMILY_SYNC_KEY = "eyJhbG...";
```

Puis `npm run sync:www` et rebuild.

## 5. Test
1. Sur téléphone A : *Paramètres → Synchronisation Famille* → choisis un code `EURO-XXXX` → **Créer / Envoyer**
2. Sur téléphone B : même code → **Recevoir** → les comptes/budgets apparaissent. Le conflit se règle en *last-write-wins* (payload avec `updatedAt` le plus récent gagne).

## Dépannage
- `Supabase non configuré` → tu as laissé `REPLACE_ME` — fais l'étape 4.
- `Table "family" manquante` → relance le SQL de l'étape 2.
- `401/403` → mauvaise `anon key` ou mauvais `Project URL`.
- `Failed to fetch` → hard refresh (`Ctrl+Shift+R`) pour vider le service worker `v8` → `v9`.

## Alternative sans Supabase
Si tu préfères Cloudflare : je peux fournir un **Worker** à déployer en 1 clic (`wrangler deploy`) — même table, pas de dashboard Supabase. Dis-moi et je te le génère.
