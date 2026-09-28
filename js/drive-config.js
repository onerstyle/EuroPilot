// ============================================================
// drive-config.js — Configuration Drive (mode simplifié)
//
// Ce fichier permet d'activer le "mode simplifié" : un seul Client ID
// OAuth préconfiguré, partagé pour tous les appareils. L'utilisateur
// n'a alors qu'à cliquer sur "Se connecter avec Google" et choisir le
// compte Gmail partagé (ex: famille@gmail.com) — plus besoin de créer
// son propre Client ID.
//
// Comment l'activer :
//  1) Crée UNE SEULE FOIS un projet Google Cloud (même démarche que
//     décrite dans Paramètres → Drive) : type Application Web.
//  2) Dans ce fichier, remplacez la chaîne vide ci-dessous par votre
//     Client ID : "1234567890-xxxx.apps.googleusercontent.com"
//  3) Déployez (push sur main). Dès lors, tous les appareils verront
//     le bouton "Connexion simplifiée" et n'auront plus à saisir de
//     Client ID. Vous pouvez aussi le surcharger au build via :
//     globalThis.__EUROPILOT_DRIVE_CLIENT_ID__ = "...";
//
// Laissez vide ("") pour désactiver le mode simplifié et forcer le
// mode avancé (chaque utilisateur saisit son propre Client ID).
// ============================================================

export const BUILTIN_CLIENT_ID = "";
// Exemple : export const BUILTIN_CLIENT_ID = "1234567890-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com";
