// ============================================================
// family-sync-config.js — Configuration Sync Famille
//
// Backend par défaut : Supabase (REST gratuit, CORS, sans préflight bloquant)
// Table : family(code text PK, data text, updated_at timestamptz)
// RLS : policy "Allow all" (for all using true) — données chiffrées
//       côté client (AES-GCM dérivée du CODE) donc le serveur ne voit que du base64.
//
// Anciens backends (conservés en fallback si l'endpoint pointe encore dessus) :
// - https://keyvalue.immanuel.co (bucket fyq2n3yb/bq4rx7id) → 500/Failed to fetch instable
// - kvdb.io (bucket fixe) → 403 email not verified
// - api.jsonstorage.net → 404 Item not found au PUT sur salon vide
//
// Setup Supabase 2 min — voir SUPABASE_SETUP.md :
//  1. Crée un projet sur supabase.com/dashboard
//  2. SQL Editor → crée la table family (voir guide)
//  3. Project Settings → API → copie Project URL + anon key ici
//
// Pour utiliser votre propre backend (Worker, Firebase, etc.) :
//  - Option live (console) : localStorage.setItem('europilot.family.endpoint','https://xxx.supabase.co/rest/v1/family') + localStorage.setItem('europilot.family.key','eyJ...')
//  - Remplacez FAMILY_SYNC_ENDPOINT / FAMILY_SYNC_KEY
//  - Laissez vide ("") pour désactiver le cloud et n'utiliser que le
//    partage manuel (QR / lien / fichier) — utile en mode hors ligne.
//  - Surcharge au build possible via :
//      globalThis.__EUROPILOT_FAMILY_ENDPOINT__ = "https://xxx.workers.dev"
// ============================================================

// Remplace les deux lignes ci-dessous par tes valeurs Supabase dès le projet créé :
// ex: "https://abcdefghijk.supabase.co/rest/v1/family"
export const FAMILY_SYNC_ENDPOINT = "https://REPLACE_ME.supabase.co/rest/v1/family";
// ex: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
export const FAMILY_SYNC_KEY = "REPLACE_ME_ANON_KEY";
