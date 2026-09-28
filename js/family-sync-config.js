// ============================================================
// family-sync-config.js — Configuration Sync Famille
//
// Backend par défaut : Firebase Realtime Database (gratuit, CORS,
// persistant, europe-west1). Node : /family/EURO-XXXX.json → base64
// chiffré AES-GCM côté client (clé = CODE), le serveur ne voit que du base64.
//
// Anciens backends (conservés en fallback si l'endpoint pointe encore dessus) :
// - Worker Cloudflare (worker/worker.js, voir WORKER_SETUP.md) — 1-clic, KV/D1
// - Supabase (voir SUPABASE_SETUP.md) — table family(code PK, data)
// - https://keyvalue.immanuel.co (fyq2n3yb) → 500/Failed to fetch
// - kvdb.io → 403 email not verified
// - api.jsonstorage.net → 404 Item not found
//
// Setup Firebase 2 min — voir FIREBASE_SETUP.md :
//  1. console.firebase.google.com → Create project → Realtime Database (europe-west1, test mode)
//  2. Copie l'URL : https://<xxx>-default-rtdb.europe-west1.firebasedatabase.app/family
//  3. Règles : family { ".read": true, ".write": true } → Publish
//
// Pour utiliser votre propre backend :
//  - Firebase live (console) : localStorage.setItem('europilot.family.endpoint','https://<xxx>.firebasedatabase.app/family'); localStorage.removeItem('europilot.family.key'); location.reload()
//  - Worker 1-clic : WORKER_SETUP.md → https://xxx.workers.dev → même commande
//  - Supabase : localStorage.setItem('europilot.family.endpoint','https://xxx.supabase.co/rest/v1/family') + key
//  - Remplacez FAMILY_SYNC_ENDPOINT / FAMILY_SYNC_KEY ci-dessous
//  - Laissez vide ("") pour désactiver le cloud (QR/fichier uniquement)
//  - Surcharge build : globalThis.__EUROPILOT_FAMILY_ENDPOINT__ = "https://..."
// ============================================================

// Remplace par ton URL Firebase dès le projet créé :
// ex: "https://europilot-family-default-rtdb.europe-west1.firebasedatabase.app/family"
export const FAMILY_SYNC_ENDPOINT = "https://REPLACE_ME-default-rtdb.europe-west1.firebasedatabase.app/family";
export const FAMILY_SYNC_KEY = "";
