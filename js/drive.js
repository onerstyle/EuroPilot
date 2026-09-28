// ============================================================
// drive.js — Synchronisation Google Drive (sauvegarde & restauration)
//
// Stocke une sauvegarde complète d'EuroPilot dans le Google Drive
// de l'utilisateur (dossier caché appDataFolder, invisible dans
// My Drive, isolé par application). Aucune donnée n'est envoyée
// ailleurs. Le Client ID OAuth2 est configuré côté utilisateur.
//
// Flux :
//  - loadGis() charge https://accounts.google.com/gsi/client
//  - signIn() ouvre le consentement Google et récupère un access_token
//  - findOrCreateFile() retrouve le fichier `europilot-backup.json`
//  - push() upload (multipart) le JSON complet
//  - pull() download et importe via store.importAll()
//  - sync() : last-write-wins avec comparaison updatedAt
//
// Auto-sync : debounce 2,5s après chaque mutation du store si activé.
// Scope : https://www.googleapis.com/auth/drive.appdata (recommandé)
//         + https://www.googleapis.com/auth/drive.file (fallback visible)
// ============================================================

import { store } from './store.js';
import { toast } from './ui.js';

const DRIVE_FILENAME = 'europilot-backup.json';
const DRIVE_MIME = 'application/json';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file';
const TOKEN_KEY = 'europilot.drive.token.v1';
const META_KEY = 'europilot.drive.meta.v1'; // { fileId, lastSync, lastUpdatedAt }

let gisReady = false;
let gisPromise = null;
let tokenClient = null;
let accessToken = null;
let expiresAt = 0;
let syncTimer = null;
let statusListeners = new Set();
let isSyncing = false;

// ---------- Persistance token & meta ----------
function loadToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return;
    const t = JSON.parse(raw);
    if (t.accessToken && t.expiresAt > Date.now() + 60_000) {
      accessToken = t.accessToken;
      expiresAt = t.expiresAt;
    }
  } catch {}
}
function saveToken(token, expiresInSec) {
  accessToken = token;
  expiresAt = Date.now() + expiresInSec * 1000;
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken, expiresAt }));
}
function clearToken() {
  accessToken = null; expiresAt = 0;
  localStorage.removeItem(TOKEN_KEY);
}
function loadMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || 'null') || {}; } catch { return {}; }
}
function saveMeta(patch) {
  const cur = loadMeta();
  const next = { ...cur, ...patch };
  localStorage.setItem(META_KEY, JSON.stringify(next));
  return next;
}
function clearMeta() { localStorage.removeItem(META_KEY); }

// ---------- Client ID ----------
export function getClientId() {
  // 1) Réglage utilisateur (prioritaire)
  const fromSettings = store.state.settings?.drive?.clientId?.trim();
  if (fromSettings) return fromSettings;
  // 2) Variable d'environnement build (si injectée)
  if (typeof globalThis.__EUROPILOT_DRIVE_CLIENT_ID__ === 'string' && globalThis.__EUROPILOT_DRIVE_CLIENT_ID__.trim()) {
    return globalThis.__EUROPILOT_DRIVE_CLIENT_ID__.trim();
  }
  // 3) Placeholder pour dev (à remplacer dans Paramètres)
  return '';
}
export function isDriveConfigured() { return !!getClientId(); }
export function isSignedIn() { return !!accessToken && expiresAt > Date.now() + 30_000; }

// ---------- GIS ----------
function loadGis() {
  if (gisReady) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${GIS_SRC}"]`)) {
      // déjà injecté, attendre que google soit prêt
      const check = setInterval(() => {
        if (globalThis.google?.accounts?.oauth2) { clearInterval(check); gisReady = true; resolve(); }
      }, 100);
      setTimeout(() => { clearInterval(check); reject(new Error('GIS timeout')); }, 10_000);
      return;
    }
    const s = document.createElement('script');
    s.src = GIS_SRC; s.async = true; s.defer = true;
    s.onload = () => { gisReady = true; resolve(); };
    s.onerror = () => reject(new Error('Impossible de charger Google Identity Services'));
    document.head.appendChild(s);
  });
  return gisPromise;
}

async function ensureTokenClient() {
  await loadGis();
  const clientId = getClientId();
  if (!clientId) throw new Error('Client ID Google Drive non configuré (voir Paramètres → Google Drive)');
  if (tokenClient && tokenClient._cid === clientId) return tokenClient;
  tokenClient = globalThis.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    prompt: '', // silent si possible
    callback: () => {},
  });
  tokenClient._cid = clientId;
  return tokenClient;
}

// ---------- Status & events ----------
export function getDriveStatus() {
  const meta = loadMeta();
  const s = store.state.settings.drive || {};
  return {
    configured: isDriveConfigured(),
    signedIn: isSignedIn(),
    syncing: isSyncing,
    autoSync: !!s.autoSync,
    lastSync: meta.lastSync || s.lastSync || null,
    lastUpdatedAt: meta.lastUpdatedAt || null,
    fileId: meta.fileId || s.fileId || null,
    clientId: getClientId(),
  };
}
function emitStatus() { statusListeners.forEach((fn) => fn(getDriveStatus())); }
export function onDriveStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); }
function setSyncing(v) { isSyncing = v; emitStatus(); }

// ---------- OAuth ----------
export async function signIn({ prompt = true } = {}) {
  const client = await ensureTokenClient();
  return new Promise((resolve, reject) => {
    let done = false;
    client.callback = (resp) => {
      if (done) return; done = true;
      if (resp.error) {
        // user closed or denied
        reject(new Error(resp.error_description || resp.error || 'Connexion annulée'));
        return;
      }
      if (!resp.access_token) { reject(new Error('Aucun access_token reçu')); return; }
      saveToken(resp.access_token, Number(resp.expires_in || 3600));
      emitStatus();
      toast('Connecté à Google Drive', { type: 'success' });
      resolve(getDriveStatus());
    };
    // prompt : '' => silent, 'consent' => force consent
    try {
      if (prompt) client.requestAccessToken({ prompt: 'consent' });
      else client.requestAccessToken({ prompt: '' });
    } catch (e) { if (!done) { done = true; reject(e); } }
    // timeout 60s
    setTimeout(() => { if (!done) { done = true; reject(new Error('Connexion expirée')); } }, 60_000);
  });
}

export async function signInSilently() {
  if (isSignedIn()) return true;
  loadToken();
  if (isSignedIn()) { emitStatus(); return true; }
  if (!isDriveConfigured()) return false;
  try {
    await signIn({ prompt: false });
    return true;
  } catch {
    return false;
  }
}

export function signOut() {
  clearToken();
  // on garde meta.fileId pour reconnexion rapide, mais on nettoie le token
  if (globalThis.google?.accounts?.oauth2) {
    try { globalThis.google.accounts.oauth2.revoke(accessToken || '', () => {}); } catch {}
  }
  emitStatus();
  toast('Déconnecté de Google Drive');
}

// ---------- Drive API helpers ----------
async function driveFetch(url, opts = {}) {
  if (!isSignedIn()) {
    // tentative silencieuse
    const ok = await signInSilently();
    if (!ok) throw new Error('Non connecté à Google Drive — veuillez vous connecter dans Paramètres');
  }
  const headers = { Authorization: `Bearer ${accessToken}`, ...(opts.headers || {}) };
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    clearToken();
    throw new Error('Session Google expirée — reconnectez-vous');
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    let msg = `Drive API ${res.status}`;
    try { const j = JSON.parse(txt); msg = j.error?.message || msg; } catch { if (txt) msg += ` — ${txt.slice(0, 200)}`; }
    throw new Error(msg);
  }
  return res;
}

// Cherche le fichier dans appDataFolder puis à la racine (compatibilité)
async function findFile() {
  const meta = loadMeta();
  if (meta.fileId) {
    // vérifie qu'il existe encore
    try {
      const r = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(meta.fileId)}?fields=id,name,parents,modifiedTime,trashed`);
      const j = await r.json();
      if (!j.trashed) return j.id;
    } catch { /* fallback search */ }
  }
  // Recherche par nom dans appDataFolder
  const qApp = `name='${DRIVE_FILENAME}' and trashed=false`;
  // appDataFolder : on interroge avec spaces=appDataFolder
  for (const spaces of ['appDataFolder', 'drive']) {
    const url = `${DRIVE_API}/files?q=${encodeURIComponent(qApp)}&spaces=${encodeURIComponent(spaces)}&fields=files(id,name,modifiedTime,parents)&pageSize=10`;
    const r = await driveFetch(url);
    const j = await r.json();
    if (j.files?.length) {
      const id = j.files[0].id;
      saveMeta({ fileId: id });
      store.setSetting('drive', { ...(store.state.settings.drive || {}), fileId: id });
      return id;
    }
  }
  return null;
}

function buildPayload() {
  const exportedAt = new Date().toISOString();
  // store.exportAll() inclut déjà version/transactions/etc + settings
  // on force updatedAt à maintenant pour la résolution de conflit
  const state = store.exportAll();
  state.updatedAt = exportedAt;
  // sauvegarde locale de updatedAt
  saveMeta({ lastUpdatedAt: exportedAt });
  return {
    app: 'EuroPilot',
    version: 1,
    exportedAt,
    updatedAt: exportedAt,
    ...state,
  };
}

// Upload multipart (metadata + content)
async function uploadFile({ fileId = null, content }) {
  const json = JSON.stringify(content, null, 2);
  const blob = new Blob([json], { type: DRIVE_MIME });
  const metadata = fileId
    ? { name: DRIVE_FILENAME, mimeType: DRIVE_MIME }
    : { name: DRIVE_FILENAME, mimeType: DRIVE_MIME, parents: ['appDataFolder'] };

  const boundary = 'europilot_boundary_' + Math.random().toString(36).slice(2);
  const delimiter = `\r\n--${boundary}\r\n`;
  const close = `\r\n--${boundary}--`;
  const body =
    delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) +
    delimiter + `Content-Type: ${DRIVE_MIME}\r\n\r\n` + json + close;

  const url = fileId
    ? `${UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,name,modifiedTime`
    : `${UPLOAD_API}/files?uploadType=multipart&fields=id,name,modifiedTime`;

  const res = await driveFetch(url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  // blob unused but kept for clarity; actual body is string
  void blob;
  const j = await res.json();
  if (j.id) {
    saveMeta({ fileId: j.id, lastSync: new Date().toISOString(), lastUpdatedAt: content.updatedAt });
    const curDrive = store.state.settings.drive || {};
    store.setSetting('drive', { ...curDrive, fileId: j.id, lastSync: new Date().toISOString() });
  }
  return j;
}

// ---------- Public sync ops ----------
export async function pushToDrive() {
  if (!isDriveConfigured()) throw new Error('Google Drive non configuré — renseignez votre Client ID dans Paramètres');
  if (!isSignedIn()) await signIn({ prompt: true });
  setSyncing(true);
  try {
    const fileId = await findFile();
    const payload = buildPayload();
    const res = await uploadFile({ fileId, content: payload });
    emitStatus();
    toast('Sauvegarde Drive enregistrée', { type: 'success' });
    return res;
  } finally { setSyncing(false); }
}

export async function pullFromDrive({ confirmOverwrite = true } = {}) {
  if (!isDriveConfigured()) throw new Error('Google Drive non configuré');
  if (!isSignedIn()) await signIn({ prompt: true });
  setSyncing(true);
  try {
    const fileId = await findFile();
    if (!fileId) throw new Error('Aucune sauvegarde EuroPilot trouvée sur ce Drive');
    const res = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Accept: DRIVE_MIME } });
    const text = await res.text();
    const data = JSON.parse(text);
    if (!data.transactions || !Array.isArray(data.transactions)) throw new Error('Fichier Drive invalide');
    if (confirmOverwrite) {
      const { confirm } = await import('./ui.js');
      const ok = await confirm(
        `Restaurer la sauvegarde Drive du <b>${new Date(data.updatedAt || data.exportedAt || 0).toLocaleString('fr-FR')}</b> ?<br>Cela <b>remplacera toutes les données locales</b> (${data.transactions.length} opérations).`,
        { title: 'Restaurer depuis Drive', okLabel: 'Restaurer' }
      );
      if (!ok) return null;
    }
    store.importAll(data);
    saveMeta({ lastSync: new Date().toISOString(), lastUpdatedAt: data.updatedAt || data.exportedAt || null, fileId });
    const curDrive = store.state.settings.drive || {};
    store.setSetting('drive', { ...curDrive, lastSync: new Date().toISOString(), fileId });
    emitStatus();
    toast(`Sauvegarde Drive restaurée (${data.transactions.length} opérations)`, { type: 'success', duration: 6000 });
    return data;
  } finally { setSyncing(false); }
}

// Sync intelligent : compare updatedAt local vs distant, last-write-wins
export async function syncNow({ direction = 'auto' } = {}) {
  if (!isDriveConfigured()) throw new Error('Google Drive non configuré');
  if (!isSignedIn()) await signIn({ prompt: true });
  setSyncing(true);
  try {
    const fileId = await findFile();
    const localUpdatedAt = store.state.updatedAt || store.state.settings?.drive?.lastUpdatedAt || null;
    if (!fileId) {
      // premier push
      const payload = buildPayload();
      const res = await uploadFile({ fileId: null, content: payload });
      toast('Première sauvegarde créée sur Drive', { type: 'success' });
      emitStatus();
      return { action: 'push', res };
    }
    // récupère les métadonnées distantes sans télécharger tout si possible
    const metaRes = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,modifiedTime,properties`);
    const meta = await metaRes.json();
    // télécharge le contenu pour comparer updatedAt
    const dl = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`);
    const text = await dl.text();
    const remote = JSON.parse(text);
    const remoteUpdatedAt = remote.updatedAt || remote.exportedAt || meta.modifiedTime;

    const localTime = localUpdatedAt ? new Date(localUpdatedAt).getTime() : 0;
    const remoteTime = remoteUpdatedAt ? new Date(remoteUpdatedAt).getTime() : 0;
    const diff = localTime - remoteTime;

    // direction forcée
    if (direction === 'push') {
      const payload = buildPayload();
      const r = await uploadFile({ fileId, content: payload });
      emitStatus(); return { action: 'push', r };
    }
    if (direction === 'pull') {
      store.importAll(remote);
      saveMeta({ lastSync: new Date().toISOString(), lastUpdatedAt: remoteUpdatedAt, fileId });
      store.setSetting('drive', { ...(store.state.settings.drive||{}), lastSync: new Date().toISOString(), fileId });
      emitStatus(); return { action: 'pull', remote };
    }

    // auto : last-write-wins avec seuil 5 sec
    if (Math.abs(diff) < 5000) {
      // quasi-simultané → on privilégie le local si plus récent ou égal
      // mais on ne fait rien si identique
      const localHash = JSON.stringify(store.exportAll().transactions).length;
      const remoteHash = JSON.stringify(remote.transactions).length;
      if (localHash === remoteHash && store.exportAll().transactions.length === remote.transactions.length) {
        saveMeta({ lastSync: new Date().toISOString() });
        store.setSetting('drive', { ...(store.state.settings.drive||{}), lastSync: new Date().toISOString() });
        emitStatus();
        toast('Déjà synchronisé', { type: 'info' });
        return { action: 'noop' };
      }
    }
    if (diff > 0) {
      // local plus récent → push
      const payload = buildPayload();
      const r = await uploadFile({ fileId, content: payload });
      toast('Modifications locales envoyées sur Drive', { type: 'success' });
      emitStatus(); return { action: 'push', r };
    } else if (diff < 0) {
      // distant plus récent → pull
      store.importAll(remote);
      saveMeta({ lastSync: new Date().toISOString(), lastUpdatedAt: remoteUpdatedAt, fileId });
      store.setSetting('drive', { ...(store.state.settings.drive||{}), lastSync: new Date().toISOString(), fileId });
      toast(`Données Drive restaurées (plus récentes du ${new Date(remoteUpdatedAt).toLocaleString('fr-FR')})`, { type: 'success', duration: 6000 });
      emitStatus(); return { action: 'pull', remote };
    } else {
      toast('Déjà synchronisé', { type: 'info' });
      return { action: 'noop' };
    }
  } finally { setSyncing(false); }
}

// ---------- Auto-sync ----------
function scheduleAutoPush() {
  const s = store.state.settings.drive || {};
  if (!s.autoSync) return;
  if (!isDriveConfigured() || !isSignedIn()) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try { await pushToDrive(); } catch (e) { console.warn('[drive] auto-push échoué', e); }
  }, 2500);
}

export function setAutoSync(enabled) {
  const cur = store.state.settings.drive || {};
  store.setSetting('drive', { ...cur, autoSync: !!enabled });
  emitStatus();
  toast(enabled ? 'Synchronisation auto activée' : 'Synchronisation auto désactivée', { type: 'info' });
}

export function setClientId(clientId) {
  const cur = store.state.settings.drive || {};
  const id = String(clientId || '').trim();
  store.setSetting('drive', { ...cur, clientId: id });
  // reset token client to force re-init with new ID
  tokenClient = null;
  if (!id) clearToken();
  emitStatus();
}

export function disconnectAndClear() {
  clearToken();
  clearMeta();
  const cur = store.state.settings.drive || {};
  store.setSetting('drive', { ...cur, fileId: null, lastSync: null, autoSync: false });
  emitStatus();
}

// ---------- Init ----------
export function initDriveSync() {
  loadToken();
  // Migration : si ancien stockage fileId dans settings, le copier vers META_KEY
  try {
    const s = store.state.settings.drive;
    if (s?.fileId && !loadMeta().fileId) saveMeta({ fileId: s.fileId, lastSync: s.lastSync || null });
  } catch {}
  emitStatus();
  // Abonnement aux mutations du store pour auto-sync
  store.subscribe(() => {
    // évite boucle si le pull vient de modifier le store et que updatedAt est déjà distant
    scheduleAutoPush();
  });
  // Tentative silencieuse au démarrage si déjà connecté et autoSync
  if (isDriveConfigured() && isSignedIn() && store.state.settings.drive?.autoSync) {
    // on ne bloque pas l'init
    setTimeout(() => { pushToDrive().catch(() => {}); }, 4000);
  }
  // Écoute online/offline pour re-tenter
  window.addEventListener('online', () => emitStatus());
  window.addEventListener('offline', () => emitStatus());
}

// Utilitaire pour UI : format lastSync
export function formatLastSync(iso) {
  if (!iso) return 'Jamais';
  try { return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return iso; }
}
