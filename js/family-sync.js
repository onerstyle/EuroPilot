// ============================================================
// family-sync.js — Synchronisation Famille par code partagé
//
// Remplace la synchro Drive (trop complexe) par un système ultra simple :
// un CODE à 6 caractères (ex: EURO-8K2P) que tu partages à ta femme.
// Tous les appareils qui rejoignent le même CODE partagent le même budget.
//
// Principe :
//  - Le CODE sert à la fois d'identifiant de salon et de clé de
//    chiffrement (dérivée via PBKDF2 + AES-GCM). Les données chiffrées
//    sont stockées sur un petit backend gratuit (kvdb.io par défaut,
//    surchargeable via js/family-sync-config.js ou
//    globalThis.__EUROPILOT_FAMILY_ENDPOINT__).
//  - Si le backend est vide/non configuré ou hors ligne, le panneau
//    propose un partage manuel par QR / lien / fichier JSON (même code).
//  - Résolution de conflit : last-write-wins via updatedAt (ISO).
//  - Auto-sync : debounce 2s après chaque mutation si activé et salon rejoint.
//
// Backend par défaut : https://kvdb.io — KV gratuit sans clé, CORS OK,
// bucket = CODE, clé = europilot-v1. Le contenu est chiffré côté client,
// le serveur ne voit que du base64. Surchargeable pour Supabase/Firebase.
// ============================================================

import { store } from './store.js';
import { toast } from './ui.js';

// ---------- Config ----------
import { FAMILY_SYNC_ENDPOINT, FAMILY_SYNC_KEY } from './family-sync-config.js';

const DEFAULT_ENDPOINT = (typeof globalThis.__EUROPILOT_FAMILY_ENDPOINT__ === 'string' && globalThis.__EUROPILOT_FAMILY_ENDPOINT__.trim()) || (typeof FAMILY_SYNC_ENDPOINT === 'string' && FAMILY_SYNC_ENDPOINT.trim()) || 'https://kvdb.io';
const STORAGE_KEY = 'europilot.family.v1'; // { code, lastSync, autoSync }
const META_KEY = 'europilot.family.meta.v1'; // { lastUpdatedAt }

let syncTimer = null;
let statusListeners = new Set();
let isSyncing = false;

// ---------- Persistance locale (code + meta) ----------
function loadFamilyMeta() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {}; } catch { return {}; }
}
function saveFamilyMeta(patch) {
  const cur = loadFamilyMeta();
  const next = { ...cur, ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  // miroir dans store.settings.family pour persistance via store
  const curStore = store.state.settings.family || {};
  store.state.settings.family = { ...curStore, ...patch };
  try { localStorage.setItem('europilot.data.v1', JSON.stringify(store.state)); } catch {}
  return next;
}
function loadMetaExtra() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || 'null') || {}; } catch { return {}; }
}
function saveMetaExtra(patch) {
  const cur = loadMetaExtra();
  const next = { ...cur, ...patch };
  localStorage.setItem(META_KEY, JSON.stringify(next));
  return next;
}

// ---------- Code & chiffrement ----------
export function generateFamilyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I/O/0/1
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `EURO-${s}`;
}
export function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^EURO/, '').slice(0, 6).padEnd(4, 'X').slice(0, 4);
  // on reconstruit EURO-XXXX
}
export function formatCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (c.startsWith('EURO-')) return c;
  const n = normalizeCode(c);
  return `EURO-${n}`;
}
export function isValidCode(code) {
  return /^EURO-[A-Z0-9]{4,6}$/.test(String(code || '').trim().toUpperCase());
}

// Dérive une clé AES-GCM 256 depuis le code (PBKDF2)
async function deriveKey(code, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(code), { name: 'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
export async function encryptFamilyPayload(jsonStr, code) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(code, salt);
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(jsonStr));
  // concat salt|iv|ct -> base64
  const combined = new Uint8Array(salt.byteLength + iv.byteLength + ct.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.byteLength);
  combined.set(new Uint8Array(ct), salt.byteLength + iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}
export async function decryptFamilyPayload(b64, code) {
  const combined = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const ct = combined.slice(28);
  const key = await deriveKey(code, salt);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// ---------- Status ----------
export function getFamilyStatus() {
  const meta = loadFamilyMeta();
  const extra = loadMetaExtra();
  const s = store.state.settings.family || {};
  const code = meta.code || s.code || '';
  return {
    hasCode: !!code,
    code,
    formattedCode: code ? formatCode(code) : '',
    isValid: isValidCode(code),
    signedIn: !!code && isValidCode(code), // pas d'OAuth, le code suffit
    syncing: isSyncing,
    autoSync: !!(meta.autoSync ?? s.autoSync),
    lastSync: meta.lastSync || s.lastSync || extra.lastSync || null,
    lastUpdatedAt: extra.lastUpdatedAt || store.state.updatedAt || null,
    endpoint: getEndpoint(),
  };
}
function emitStatus() { statusListeners.forEach(fn => fn(getFamilyStatus())); }
export function onFamilyStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); }
function setSyncing(v) { isSyncing = v; emitStatus(); }

// ---------- Backend (kvdb.io par défaut) ----------
function getEndpoint() {
  const fromGlobal = typeof globalThis.__EUROPILOT_FAMILY_ENDPOINT__ === 'string' ? globalThis.__EUROPILOT_FAMILY_ENDPOINT__.trim() : '';
  if (fromGlobal) return fromGlobal;
  if (typeof FAMILY_SYNC_ENDPOINT === 'string' && FAMILY_SYNC_ENDPOINT.trim()) return FAMILY_SYNC_ENDPOINT.trim();
  return DEFAULT_ENDPOINT;
}
function familyUrl(code) {
  const c = formatCode(code);
  // kvdb.io : https://kvdb.io/<bucket>/<key>
  // on utilise le code comme bucket, clé = FAMILY_SYNC_KEY
  const base = getEndpoint().replace(/\/+$/, '');
  // si endpoint contient déjà un bucket (ex: https://kvdb.io), on ajoute code
  // si endpoint est vide (mode hors ligne), on retourne null
  if (!base) return null;
  // Pour kvdb.io, le bucket est la 1re partie après le domaine
  // Pour un endpoint custom (Supabase), on ajoute ?code=...
  if (base.includes('kvdb.io')) {
    return `${base}/${encodeURIComponent(c)}/${encodeURIComponent(FAMILY_SYNC_KEY)}`;
  }
  // générique : ?code=xxx
  return `${base}/${encodeURIComponent(c)}`;
}

async function familyFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Sync famille ${res.status} — ${txt.slice(0, 200) || res.statusText}`);
  }
  return res;
}

// ---------- Payload ----------
function buildFamilyPayload() {
  const exportedAt = new Date().toISOString();
  const state = store.exportAll();
  state.updatedAt = exportedAt;
  saveMetaExtra({ lastUpdatedAt: exportedAt });
  return {
    app: 'EuroPilot',
    version: 1,
    exportedAt,
    updatedAt: exportedAt,
    ...state,
  };
}

// ---------- Ops ----------
export async function createFamilySalon() {
  const code = generateFamilyCode();
  saveFamilyMeta({ code, lastSync: null });
  emitStatus();
  toast(`Salon famille créé : ${code} — partage ce code à ta femme`, { type: 'success', duration: 6000 });
  // push initial vide/chiffré
  try { await pushToFamily(); } catch (e) { console.warn('[family] push initial échoué', e); }
  return code;
}
export async function joinFamilySalon(rawCode) {
  const code = formatCode(rawCode);
  if (!isValidCode(code)) throw new Error('Code invalide — format attendu : EURO-XXXX (ex: EURO-8K2P)');
  saveFamilyMeta({ code, lastSync: null });
  emitStatus();
  toast(`Salon rejoint : ${code}`, { type: 'success' });
  // tentative de pull immédiat
  try { await pullFromFamily({ confirmOverwrite: false }); } catch (e) { /* pas grave si vide */ console.warn(e); }
  return code;
}
export function leaveFamilySalon() {
  const prev = loadFamilyMeta().code;
  saveFamilyMeta({ code: '', lastSync: null, autoSync: false });
  emitStatus();
  toast(prev ? `Salon ${prev} quitté` : 'Salon quitté', { type: 'info' });
}
export function setFamilyAutoSync(enabled) {
  saveFamilyMeta({ autoSync: !!enabled });
  emitStatus();
  toast(enabled ? 'Sync auto famille activée' : 'Sync auto désactivée', { type: 'info' });
}
export function setFamilyCode(raw) {
  const code = raw ? formatCode(raw) : '';
  if (code && !isValidCode(code)) throw new Error('Code invalide');
  saveFamilyMeta({ code });
  emitStatus();
}

// Push chiffré
export async function pushToFamily() {
  const { code } = getFamilyStatus();
  if (!code) throw new Error('Aucun salon famille — crée ou rejoins un salon d’abord');
  const url = familyUrl(code);
  if (!url) throw new Error('Aucun backend configuré — utilise le partage par QR / fichier');
  setSyncing(true);
  try {
    const payload = buildFamilyPayload();
    const jsonStr = JSON.stringify(payload);
    const b64 = await encryptFamilyPayload(jsonStr, code);
    // kvdb.io attend du texte brut
    await familyFetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: b64 });
    saveFamilyMeta({ lastSync: new Date().toISOString() });
    saveMetaExtra({ lastUpdatedAt: payload.updatedAt });
    emitStatus();
    toast('Données famille envoyées', { type: 'success' });
  } catch (e) {
    // fallback : propose le partage manuel
    throw new Error(`Envoi famille échoué : ${e.message} — vérifie ta connexion ou utilise le partage par QR / fichier.`);
  } finally { setSyncing(false); }
}
export async function pullFromFamily({ confirmOverwrite = true } = {}) {
  const { code } = getFamilyStatus();
  if (!code) throw new Error('Aucun salon famille');
  const url = familyUrl(code);
  if (!url) throw new Error('Aucun backend configuré');
  setSyncing(true);
  try {
    const res = await familyFetch(url, { method: 'GET' });
    const b64 = (await res.text()).trim();
    if (!b64) throw new Error('Salon vide — fais d’abord « Envoyer » sur un appareil qui a des données');
    const jsonStr = await decryptFamilyPayload(b64, code);
    const data = JSON.parse(jsonStr);
    if (!data.transactions || !Array.isArray(data.transactions)) throw new Error('Données famille invalides');
    if (confirmOverwrite) {
      const { confirm } = await import('./ui.js');
      const ok = await confirm(
        `Restaurer les données du salon <b>${code}</b> du <b>${new Date(data.updatedAt || data.exportedAt || 0).toLocaleString('fr-FR')}</b> ?<br>Cela <b>remplacera les données locales</b> (${data.transactions.length} opérations).`,
        { title: 'Restaurer depuis famille', okLabel: 'Restaurer' }
      );
      if (!ok) return null;
    }
    // import sans doublon si c'est la même version ?
    store.importAll(data);
    saveFamilyMeta({ lastSync: new Date().toISOString() });
    saveMetaExtra({ lastUpdatedAt: data.updatedAt || data.exportedAt });
    emitStatus();
    toast(`Données famille restaurées (${data.transactions.length} opérations)`, { type: 'success', duration: 6000 });
    return data;
  } catch (e) {
    if (String(e.message).includes('404') || String(e.message).includes('404')) {
      throw new Error('Salon vide ou code incorrect — vérifie le code ou fais « Envoyer » d’abord');
    }
    throw e;
  } finally { setSyncing(false); }
}
export async function syncFamilyNow({ direction = 'auto' } = {}) {
  const { code } = getFamilyStatus();
  if (!code) throw new Error('Aucun salon famille');
  const url = familyUrl(code);
  if (!url) throw new Error('Aucun backend');
  setSyncing(true);
  try {
    // récupère distant
    let remote = null;
    let remoteUpdatedAt = null;
    try {
      const res = await familyFetch(url, { method: 'GET' });
      const b64 = (await res.text()).trim();
      if (b64) {
        const jsonStr = await decryptFamilyPayload(b64, code);
        remote = JSON.parse(jsonStr);
        remoteUpdatedAt = remote.updatedAt || remote.exportedAt;
      }
    } catch (e) {
      if (!String(e.message).includes('404')) throw e;
      // pas de distant → on push
    }
    const localUpdatedAt = store.state.updatedAt || loadMetaExtra().lastUpdatedAt;
    if (!remote) {
      const payload = buildFamilyPayload();
      const b64 = await encryptFamilyPayload(JSON.stringify(payload), code);
      await familyFetch(url, { method: 'POST', body: b64 });
      saveFamilyMeta({ lastSync: new Date().toISOString() });
      saveMetaExtra({ lastUpdatedAt: payload.updatedAt });
      emitStatus();
      toast('Première synchro famille créée', { type: 'success' });
      return { action: 'push' };
    }
    if (direction === 'push') {
      const payload = buildFamilyPayload();
      const b64 = await encryptFamilyPayload(JSON.stringify(payload), code);
      await familyFetch(url, { method: 'POST', body: b64 });
      saveFamilyMeta({ lastSync: new Date().toISOString() });
      saveMetaExtra({ lastUpdatedAt: payload.updatedAt });
      emitStatus();
      return { action: 'push' };
    }
    if (direction === 'pull') {
      store.importAll(remote);
      saveFamilyMeta({ lastSync: new Date().toISOString() });
      saveMetaExtra({ lastUpdatedAt: remoteUpdatedAt });
      emitStatus();
      return { action: 'pull' };
    }
    // auto last-write-wins
    const localTime = localUpdatedAt ? new Date(localUpdatedAt).getTime() : 0;
    const remoteTime = remoteUpdatedAt ? new Date(remoteUpdatedAt).getTime() : 0;
    if (Math.abs(localTime - remoteTime) < 5000) {
      const localLen = JSON.stringify(store.exportAll().transactions).length;
      const remoteLen = JSON.stringify(remote.transactions).length;
      if (localLen === remoteLen) {
        saveFamilyMeta({ lastSync: new Date().toISOString() });
        emitStatus();
        toast('Déjà synchronisé', { type: 'info' });
        return { action: 'noop' };
      }
    }
    if (localTime > remoteTime) {
      const payload = buildFamilyPayload();
      const b64 = await encryptFamilyPayload(JSON.stringify(payload), code);
      await familyFetch(url, { method: 'POST', body: b64 });
      saveFamilyMeta({ lastSync: new Date().toISOString() });
      saveMetaExtra({ lastUpdatedAt: payload.updatedAt });
      toast('Modifications envoyées', { type: 'success' });
      emitStatus();
      return { action: 'push' };
    } else if (remoteTime > localTime) {
      store.importAll(remote);
      saveFamilyMeta({ lastSync: new Date().toISOString() });
      saveMetaExtra({ lastUpdatedAt: remoteUpdatedAt });
      toast(`Données plus récentes restaurées du ${new Date(remoteUpdatedAt).toLocaleString('fr-FR')}`, { type: 'success' });
      emitStatus();
      return { action: 'pull' };
    } else {
      toast('Déjà synchronisé', { type: 'info' });
      return { action: 'noop' };
    }
  } finally { setSyncing(false); }
}

// ---------- Partage manuel (QR / lien / fichier) ----------
export async function exportFamilySharePayload() {
  const payload = buildFamilyPayload();
  const jsonStr = JSON.stringify(payload);
  const { code } = getFamilyStatus();
  if (!code) throw new Error('Aucun salon');
  const b64 = await encryptFamilyPayload(jsonStr, code);
  // lien partageable : #family=CODE&data=B64 (tronqué pour QR)
  const link = `${location.origin}${location.pathname}#family=${encodeURIComponent(code)}&data=${encodeURIComponent(b64.slice(0, 4000))}`;
  return { code, b64, link, payload };
}
export async function importFamilySharePayload(b64, code) {
  const jsonStr = await decryptFamilyPayload(b64, code);
  const data = JSON.parse(jsonStr);
  store.importAll(data);
  saveFamilyMeta({ lastSync: new Date().toISOString() });
  saveMetaExtra({ lastUpdatedAt: data.updatedAt });
  emitStatus();
  return data;
}

// ---------- Auto-sync ----------
function scheduleAutoPush() {
  const { autoSync, code } = getFamilyStatus();
  if (!autoSync || !code) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try { await pushToFamily(); } catch (e) { console.warn('[family] auto-push échoué', e); }
  }, 2000);
}
export function initFamilySync() {
  // migration depuis ancien Drive si présent
  try {
    const raw = localStorage.getItem('europilot.data.v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.settings?.drive && !parsed.settings?.family) {
        parsed.settings.family = { code: '', lastSync: null, autoSync: false };
      }
    }
  } catch {}
  // charge meta depuis store
  const s = store.state.settings.family || {};
  const meta = loadFamilyMeta();
  if (s.code && !meta.code) saveFamilyMeta({ code: s.code });
  emitStatus();
  store.subscribe(() => scheduleAutoPush());
  // si code présent + autoSync, push initial silencieux
  const st = getFamilyStatus();
  if (st.code && st.autoSync) setTimeout(() => pushToFamily().catch(() => {}), 3000);
  window.addEventListener('online', () => emitStatus());
  window.addEventListener('offline', () => emitStatus());
  // support du hash #family=CODE&data=... pour import direct par lien
  try {
    const h = location.hash || '';
    if (h.includes('family=')) {
      const params = new URLSearchParams(h.slice(1));
      const c = params.get('family');
      const d = params.get('data');
      if (c && d) {
        // ne pas auto-importer sans confirmation, juste proposer
        console.log('[family] lien de partage détecté', c);
      }
    }
  } catch {}
}
export function formatFamilyLastSync(iso) {
  if (!iso) return 'Jamais';
  try { return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return iso; }
}
