// ============================================================
// family-sync-config.js — Configuration Sync Famille
//
// Backend par défaut : https://kvdb.io (KV gratuit, sans clé, CORS OK).
// Le CODE famille sert de bucket, la donnée est chiffrée côté client
// (AES-GCM dérivée du CODE) donc le serveur ne voit que du base64.
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
