// ============================================================
// family-sync-config.js — Configuration Sync Famille
//
// Backend par défaut : https://kvdb.io (KV gratuit, CORS, bucket fixe).
// Le CODE famille sert de clé (https://kvdb.io/<bucket fixe>/<CODE>)
// et la donnée est chiffrée côté client (AES-GCM dérivée du CODE)
// donc le serveur ne voit que du base64. L'ancien code utilisait le CODE
// comme bucket (https://kvdb.io/<CODE>/...) → 404 Bucket is invalid.
// Le nouveau code utilise un bucket fixe créé à la demande.
//
// Alternative : https://api.jsonstorage.net/v1/json/europilot (nécessite
// PUT vs POST, géré en fallback) — voir js/family-sync.js
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

export const FAMILY_SYNC_ENDPOINT = "https://kvdb.io";
export const FAMILY_SYNC_KEY = "europilot-v1";
