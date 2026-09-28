// ============================================================
// family-sync-config.js — Configuration Sync Famille
//
// Backend par défaut : https://keyvalue.immanuel.co (KV gratuit, CORS,
// sans email, bucket = appKey fyq2n3yb). Le CODE sert de clé
// (https://keyvalue.immanuel.co/api/KeyVal/<appKey>/<CODE>)
// et la donnée est chiffrée côté client (AES-GCM dérivée du CODE)
// donc le serveur ne voit que du base64. Données découpées en chunks
// de 900 chars (limite 1024 de l'API) pour les gros budgets.
//
// Anciens défauts :
// - kvdb.io (bucket fixe) → 403 email not verified (nécessite activation)
// - api.jsonstorage.net → 404 Item not found au PUT sur salon vide
// Tous conservés en fallback.
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

export const FAMILY_SYNC_ENDPOINT = "https://keyvalue.immanuel.co/api/KeyVal";
export const FAMILY_SYNC_KEY = "fyq2n3yb";
