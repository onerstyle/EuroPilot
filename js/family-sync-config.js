// ============================================================
// family-sync-config.js — Configuration Sync Famille
//
// Backend par défaut : https://api.jsonstorage.net (JSON gratuit, CORS, sans clé,
// bucket = europilot, clé = CODE famille). Le CODE sert de clé
// et la donnée est chiffrée côté client (AES-GCM dérivée du CODE)
// donc le serveur ne voit que du base64.
//
// Ancien défaut kvdb.io (KV gratuit) est conservé en fallback mais
// nécessite un bucket fixe — le code était utilisé comme bucket et
// provoquait « Bucket is invalid » (404). Le nouveau défaut corrige ça.
//
// Pour utiliser votre propre backend (Supabase, Firebase, Worker...) :
//  - Remplacez FAMILY_SYNC_ENDPOINT par l'URL de votre endpoint
//  - Adaptez éventuellement FAMILY_SYNC_KEY si votre API l'exige
//
// Laissez vide ("") pour désactiver le cloud et n'utiliser que le
// partage manuel (QR / lien / fichier) — utile en mode hors ligne.
//
// Vous pouvez aussi surcharger au build via :
//   globalThis.__EUROPILOT_FAMILY_ENDPOINT__ = "https://votre-worker.workers.dev"
// ============================================================

export const FAMILY_SYNC_ENDPOINT = "https://api.jsonstorage.net/v1/json/europilot";
export const FAMILY_SYNC_KEY = "europilot-v1";
