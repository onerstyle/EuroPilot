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
// Backend par défaut : https://keyvalue.immanuel.co — KV gratuit, CORS,
// sans email, bucket = appKey fyq2n3yb, clé = CODE. Le contenu est chiffré
// côté client, le serveur ne voit que du base64. Découpé en chunks 900
// (limite 1024). kvdb.io (403 email not verified) et jsonstorage.net
// (404 PUT) conservés en fallback.
// ============================================================

import { store } from './store.js';
import { toast } from './ui.js';

// ---------- Config ----------
import { FAMILY_SYNC_ENDPOINT, FAMILY_SYNC_KEY } from './family-sync-config.js';

const DEFAULT_ENDPOINT = (typeof globalThis.__EUROPILOT_FAMILY_ENDPOINT__ === 'string' && globalThis.__EUROPILOT_FAMILY_ENDPOINT__.trim()) || (typeof FAMILY_SYNC_ENDPOINT === 'string' && FAMILY_SYNC_ENDPOINT.trim()) || 'https://api.jsonstorage.net/v1/json/europilot';
const LS_ENDPOINT_KEY = 'europilot.family.endpoint';
const LS_KEY_KEY = 'europilot.family.key';
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

// ---------- Backend ----------
function getEndpoint() {
  try {
    const ls = localStorage.getItem(LS_ENDPOINT_KEY);
    if (ls && ls.trim()) return ls.trim();
  } catch {}
  const fromGlobal = typeof globalThis.__EUROPILOT_FAMILY_ENDPOINT__ === 'string' ? globalThis.__EUROPILOT_FAMILY_ENDPOINT__.trim() : '';
  if (fromGlobal) return fromGlobal;
  // Preview e2b auto : si on est sur https://8000-xxx.e2b.app et que la config est encore en REPLACE_ME,
  // on pointe automatiquement vers le Worker preview https://8787-xxx.e2b.app (mémoire volatile, pour tester immédiatement)
  try {
    const isPlaceholder = (typeof FAMILY_SYNC_ENDPOINT === 'string' && FAMILY_SYNC_ENDPOINT.includes('REPLACE_ME'));
    if (isPlaceholder && typeof location !== 'undefined' && location.hostname && location.hostname.includes('e2b.app')) {
      const workerHost = location.hostname.replace(/^8000-/, '8787-');
      if (workerHost !== location.hostname) return `https://${workerHost}`;
      // fallback si port 8000 non détecté (ex: 8000-xxx.e2b.app -> 8787-xxx.e2b.app)
      if (location.hostname.startsWith('8000-')) return `https://${location.hostname.replace('8000-','8787-')}`;
    }
  } catch {}
  if (typeof FAMILY_SYNC_ENDPOINT === 'string' && FAMILY_SYNC_ENDPOINT.trim()) return FAMILY_SYNC_ENDPOINT.trim();
  return DEFAULT_ENDPOINT;
}
function getFamilySyncKey() {
  try {
    const ls = localStorage.getItem(LS_KEY_KEY);
    if (ls && ls.trim()) return ls.trim();
  } catch {}
  if (typeof FAMILY_SYNC_KEY === 'string' && FAMILY_SYNC_KEY.trim()) return FAMILY_SYNC_KEY.trim();
  return '';
}
export function setFamilyEndpoint(url, key) {
  try {
    if (url) localStorage.setItem(LS_ENDPOINT_KEY, url.trim());
    else localStorage.removeItem(LS_ENDPOINT_KEY);
    if (key !== undefined) {
      if (key) localStorage.setItem(LS_KEY_KEY, key.trim());
      else localStorage.removeItem(LS_KEY_KEY);
    }
  } catch {}
}
export function getFamilyEndpointInfo() {
  return { endpoint: getEndpoint(), key: getFamilySyncKey(), isPlaceholder: isSupabasePlaceholder() };
}
function familyUrl(code) {
  const c = formatCode(code);
  const base = getEndpoint().replace(/\/+$/, '');
  if (!base) return null;
  if (base.includes('supabase.co')) {
    return `${base}?code=eq.${encodeURIComponent(c)}`;
  }
  if (base.includes('keyvalue.immanuel.co')) {
    // keyvalue : https://keyvalue.immanuel.co/api/KeyVal/<appKey>/<CODE>
    // Le CODE est la clé, la valeur est le base64 découpé en chunks
    // familyUrl retourne la base + appKey + code (pour GET du meta)
    const appKey = getFamilySyncKey() || 'fyq2n3yb';
    return `${base}/${encodeURIComponent(appKey)}/${encodeURIComponent(c)}`;
  }
  if (base.includes('jsonstorage.net')) {
    return `${base}/${encodeURIComponent(c)}`;
  }
  if (base.includes('kvdb.io')) {
    const bucket = getKvdbBucketSync();
    return `${base}/${encodeURIComponent(bucket)}/${encodeURIComponent(c)}`;
  }
  return `${base}/${encodeURIComponent(c)}`;
}
// kvdb : bucket fixe stocké localement, créé à la demande
const KVDB_BUCKET_KEY = 'europilot.kvdb.bucket.v1';
const KVDB_FIXED_FALLBACK = 'europilot-v1'; // fallback si création échoue (ancien comportement)
function getKvdbBucketSync() {
  try {
    const b = localStorage.getItem(KVDB_BUCKET_KEY);
    if (b) return b;
  } catch {}
  return KVDB_FIXED_FALLBACK;
}
async function ensureKvdbBucket() {
  try {
    const existing = localStorage.getItem(KVDB_BUCKET_KEY);
    if (existing) return existing;
  } catch {}
  // tente de créer un bucket kvdb (POST https://kvdb.io avec email)
  try {
    const res = await fetch('https://kvdb.io', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'email=europilot%40kvdb.io'
    });
    if (res.ok) {
      const bucketId = (await res.text()).trim();
      if (bucketId && /^[A-Za-z0-9_-]{8,}$/.test(bucketId)) {
        try { localStorage.setItem(KVDB_BUCKET_KEY, bucketId); } catch {}
        return bucketId;
      }
    }
  } catch (e) {
    console.warn('[family] création bucket kvdb échouée', e);
  }
  return KVDB_FIXED_FALLBACK;
}

async function familyFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const body = txt.slice(0, 300);
    if (res.status === 403 && /email.*not verified/i.test(body)) {
      throw new Error(`Sync famille 403 — email not verified (kvdb.io). Le backend kvdb exige une vérification d'email. Le nouveau défaut est https://keyvalue.immanuel.co (sans email) — fais un hard refresh (Ctrl+Shift+R) pour récupérer la nouvelle config, ou passe en QR/fichier. Détail: ${body.slice(0,120)}`);
    }
    if (res.status === 404 && /bucket/i.test(body)) {
      throw new Error(`Sync famille 404 — Bucket invalide. Le backend actuel (${getEndpoint()}) n'accepte pas le code comme bucket. Le nouveau défaut est https://keyvalue.immanuel.co (bucket fixe + code comme clé). Vérifie que ton app est à jour (hard refresh) ou passe en partage manuel QR/fichier. Détail: ${body.slice(0,120)}`);
    }
    throw new Error(`Sync famille ${res.status} — ${body || res.statusText}`);
  }
  return res;
}
// helpers jsonstorage
async function putJsonStorage(url, b64, updatedAt) {
  let res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: b64, updatedAt })
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    // jsonstorage renvoie 404 Item not found sur PUT quand l'item n'existe pas encore
    // On tente alors un POST (création) sur la même URL
    if (res.status === 404 && /item not found/i.test(txt)) {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: b64, updatedAt })
      });
      if (res.ok) return res;
      const txt2 = await res.text().catch(() => '');
      throw new Error(`Sync famille ${res.status} — ${txt2.slice(0,200) || res.statusText}`);
    }
    throw new Error(`Sync famille ${res.status} — ${txt.slice(0,200) || res.statusText}`);
  }
  return res;
}
async function getJsonStorage(url) {
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    // jsonstorage renvoie 404 {"error":"Item not found"} quand le salon n'existe pas encore
    // On ne veut pas afficher une erreur bloquante : c'est juste un salon vide
    if (res.status === 404 && /item not found/i.test(txt)) {
      return null;
    }
    throw new Error(`Sync famille ${res.status} — ${txt.slice(0,200) || res.statusText}`);
  }
  const j = await res.json().catch(() => null);
  if (!j || typeof j.data !== 'string') {
    if (typeof j === 'string') return j;
    // si le backend a stocké un objet vide ou autre, on considère comme vide
    if (j && j.error && /item not found/i.test(JSON.stringify(j))) return null;
    throw new Error('Données famille invalides (jsonstorage)');
  }
  return j.data;
}
// keyvalue helpers (chunks 900 pour limite 1024)
const KV_CHUNK_SIZE = 900;
async function putKeyValueChunked(code, b64) {
  const base = getEndpoint().replace(/\/+$/, '');
  const appKey = FAMILY_SYNC_KEY || 'fyq2n3yb';
  const chunks = [];
  for (let i = 0; i < b64.length; i += KV_CHUNK_SIZE) chunks.push(b64.slice(i, i + KV_CHUNK_SIZE));
  // d'abord le meta (nombre de chunks)
  const metaUrl = `${base}/UpdateValue/${encodeURIComponent(appKey)}/${encodeURIComponent(code + '-meta')}/${chunks.length}`;
  let res = await fetch(metaUrl, { method: 'POST' });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Sync famille ${res.status} — ${txt.slice(0,200) || res.statusText}`);
  }
  // puis chaque chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const url = `${base}/UpdateValue/${encodeURIComponent(appKey)}/${encodeURIComponent(code + '-' + i)}/${encodeURIComponent(chunk)}`;
    try {
      res = await fetch(url, { method: 'POST' });
    } catch (e) {
      throw new Error(`Failed to fetch ${url} — ${e.message}`);
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Sync famille ${res.status} — ${txt.slice(0,200) || res.statusText}`);
    }
  }
  // compat : stocke aussi le b64 complet si <1024 pour anciens clients
  if (b64.length <= KV_CHUNK_SIZE) {
    const singleUrl = `${base}/UpdateValue/${encodeURIComponent(appKey)}/${encodeURIComponent(code)}/${encodeURIComponent(b64)}`;
    try { await fetch(singleUrl, { method: 'POST' }); } catch {}
  }
  // nettoie les anciens chunks si le nouveau est plus court
  try {
    const oldMetaRes = await fetch(`${base}/GetValue/${encodeURIComponent(appKey)}/${encodeURIComponent(code + '-meta')}`, { method: 'GET' });
    // on ne supprime pas vraiment, on écrase juste le meta
  } catch {}
  return res;
}
async function getKeyValueChunked(code) {
  const base = getEndpoint().replace(/\/+$/, '');
  const appKey = FAMILY_SYNC_KEY || 'fyq2n3yb';
  // d'abord essaie le format chunké (meta)
  try {
    const metaRes = await fetch(`${base}/GetValue/${encodeURIComponent(appKey)}/${encodeURIComponent(code + '-meta')}`, { method: 'GET' });
    if (metaRes.ok) {
      const metaTxt = await metaRes.text().catch(() => '');
      const num = parseInt(metaTxt.trim(), 10);
      if (!isNaN(num) && num > 0 && num < 100) {
        let b64 = '';
        for (let i = 0; i < num; i++) {
          const r = await fetch(`${base}/GetValue/${encodeURIComponent(appKey)}/${encodeURIComponent(code + '-' + i)}`, { method: 'GET' });
          if (!r.ok) throw new Error(`Sync famille ${r.status} — chunk ${i} manquant`);
          const chunk = (await r.text()).trim().replace(/^"|"$/g, '');
          b64 += chunk;
        }
        if (b64) return b64;
      }
    }
  } catch (e) {
    // fallback vers single key
    console.warn('[family] chunked read failed, fallback single', e);
  }
  // fallback : single key (ancien format)
  const res = await fetch(`${base}/GetValue/${encodeURIComponent(appKey)}/${encodeURIComponent(code)}`, { method: 'GET' });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    if (res.status === 404 || /not found/i.test(txt) || txt.trim() === 'null' || txt.trim() === '') {
      return null;
    }
    throw new Error(`Sync famille ${res.status} — ${txt.slice(0,200) || res.statusText}`);
  }
  const txt = await res.text().catch(() => '');
  const cleaned = txt.trim().replace(/^"|"$/g, '');
  if (!cleaned || cleaned === 'null' || cleaned === 'undefined') return null;
  // si le contenu est déjà un base64 complet, on le retourne
  return cleaned;
}

// Supabase helpers
function isSupabasePlaceholder() {
  const ep = getEndpoint() || '';
  return ep.includes('REPLACE_ME') || (getFamilySyncKey() || '').includes('REPLACE_ME');
}
async function supabaseHeaders() {
  const key = getFamilySyncKey() || '';
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
}
async function putSupabase(code, b64, updatedAt) {
  const base = getEndpoint().replace(/\/+$/, '');
  // Upsert en 1 requête : si code existe → update, sinon insert
  const headers = await supabaseHeaders();
  headers['Prefer'] = 'return=representation,resolution=merge-duplicates';
  const res = await fetch(`${base}?onConflict=code`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ code, data: b64, updated_at: updatedAt })
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    // Si la table n'existe pas encore (PGRST205) → message clair
    if (txt.includes('PGRST205') || txt.includes('Could not find the table')) {
      throw new Error(`Table Supabase "family" manquante — exécute le SQL de SUPABASE_SETUP.md puis réessaie.`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Supabase 401/403 — vérifie Project URL / anon key dans family-sync-config.js`);
    }
    throw new Error(`Sync famille ${res.status} — ${txt.slice(0,200) || res.statusText}`);
  }
  return res;
}
async function getSupabase(code) {
  const base = getEndpoint().replace(/\/+$/, '');
  const headers = await supabaseHeaders();
  const res = await fetch(`${base}?code=eq.${encodeURIComponent(code)}&select=data,updated_at`, {
    method: 'GET',
    headers
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    if (res.status === 404) return null;
    throw new Error(`Sync famille ${res.status} — ${txt.slice(0,200) || res.statusText}`);
  }
  const j = await res.json().catch(() => null);
  if (!j || !Array.isArray(j) || j.length === 0) return null;
  return j[0].data;
}
async function showFamilySetupHelp(title, detail) {
  try {
    const { openModal } = await import('./ui.js');
    openModal({
      title,
      content: `<p><b>Supabase non configuré</b></p><p>${detail}</p><p class="muted small">Endpoint actuel : <code>${getEndpoint()}</code></p><ol class="muted small" style="text-align:left"><li>Crée un projet sur <a href="https://supabase.com/dashboard" target="_blank">supabase.com/dashboard</a></li><li>SQL Editor → crée la table <code>family</code> (voir SUPABASE_SETUP.md)</li><li>Dans la console (F12), colle :<br><code style="word-break:break-all">localStorage.setItem('europilot.family.endpoint','https://xxx.supabase.co/rest/v1/family'); localStorage.setItem('europilot.family.key','eyJ...'); location.reload();</code></li></ol><p class="muted small">En attendant, utilise le QR / fichier ci-dessous :</p>`,
      footer: `<button class="btn btn-primary" data-close>Fermer</button>`
    });
  } catch {}
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
    const endpoint = getEndpoint();
    const isSupabase = endpoint.includes('supabase.co');
    if (isSupabase && isSupabasePlaceholder()) {
      throw new Error('Supabase non configuré — remplace REPLACE_ME dans js/family-sync-config.js (voir SUPABASE_SETUP.md) puis recharge la page.');
    }
    const tryKeyValueFallback = async () => {
      // fallback direct vers keyvalue sans passer par la config cachée
      await putKeyValueChunked(code, b64);
    };
    if (isSupabase) {
      await putSupabase(code, b64, payload.updatedAt);
    } else if (endpoint.includes('keyvalue.immanuel.co')) {
      await putKeyValueChunked(code, b64);
    } else if (endpoint.includes('jsonstorage.net')) {
      try {
        await putJsonStorage(url, b64, payload.updatedAt);
      } catch (e) {
        if (String(e.message).includes('404') && String(e.message).includes('Item not found')) {
          // jsonstorage PUT sur salon vide → fallback keyvalue
          await tryKeyValueFallback();
        } else throw e;
      }
    } else if (endpoint.includes('kvdb.io')) {
      try {
        await ensureKvdbBucket();
        const kvUrl = familyUrl(code);
        await familyFetch(kvUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: b64 });
      } catch (e) {
        const msg = String(e.message);
        if (msg.includes('403') && /email.*not verified/i.test(msg)) {
          console.warn('[family] kvdb 403 → fallback keyvalue', msg);
          await tryKeyValueFallback();
        } else if (msg.includes('404') && /bucket/i.test(msg)) {
          console.warn('[family] kvdb bucket invalid → fallback keyvalue', msg);
          await tryKeyValueFallback();
        } else throw e;
      }
    } else {
      try {
        await familyFetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: b64 });
      } catch (e) {
        // dernier recours : keyvalue
        console.warn('[family] endpoint générique échoué → fallback keyvalue', e);
        await tryKeyValueFallback();
      }
    }
    saveFamilyMeta({ lastSync: new Date().toISOString() });
    saveMetaExtra({ lastUpdatedAt: payload.updatedAt });
    emitStatus();
    toast('Données famille envoyées', { type: 'success' });
  } catch (e) {
    const msg = String(e.message);
    if (msg.includes('Supabase non configuré') || msg.includes('REPLACE_ME') || msg.includes('Supabase 401') || msg.includes('Table Supabase')) {
      try {
        const { openModal } = await import('./ui.js');
        const code = getFamilyStatus().code;
        let qrBlock = '';
        try {
          const { b64 } = await exportFamilySharePayload();
          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(b64.slice(0,800))}`;
          qrBlock = `<div style="text-align:center;margin-top:12px"><img src="${qrUrl}" style="border:1px solid var(--border);border-radius:12px"><p class="muted small">QR de secours (partage manuel)</p></div>`;
        } catch {}
        openModal({
          title: 'Configuration Supabase requise',
          content: `<p>${msg}</p><p class="muted small">Vois <b>SUPABASE_SETUP.md</b> ou colle dans la console (F12) :</p><pre style="white-space:pre-wrap;word-break:break-all;font-size:11px;border:1px solid var(--border);padding:8px;border-radius:8px">localStorage.setItem('europilot.family.endpoint','https://xxx.supabase.co/rest/v1/family');
localStorage.setItem('europilot.family.key','eyJ...');
location.reload();</pre>${qrBlock}`,
          footer: `<button class="btn btn-primary" data-close>Fermer</button>`
        });
      } catch {}
      throw new Error(msg);
    }
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed') || msg.includes('fetch failed')) {
      // Propose directement le QR en fallback
      try {
        const { openModal } = await import('./ui.js');
        const { code, b64 } = await exportFamilySharePayload();
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(b64.slice(0,800))}`;
        openModal({
          title: 'Serveur indispo — partage manuel',
          content: `<p>Le serveur de synchro est injoignable (<code>${getEndpoint()}</code>). Utilise le QR / fichier en attendant :</p><div style="text-align:center"><img src="${qrUrl}" style="border:1px solid var(--border);border-radius:12px"><p class="muted small">Scanne ce QR sur l'autre appareil ou copie le fichier chiffré.</p></div><p class="muted small">Détail: ${msg.slice(0,120)}</p>`,
          footer: `<button class="btn btn-primary" data-close>Fermer</button>`
        });
      } catch {}
      throw new Error(`Envoi famille échoué : serveur injoignable (${getEndpoint()}). Utilise le partage par QR / fichier. Détail: ${msg.slice(0,100)}`);
    }
    throw new Error(`Envoi famille échoué : ${msg} — vérifie ta connexion ou utilise le partage par QR / fichier.`);
  } finally { setSyncing(false); }
}
export async function pullFromFamily({ confirmOverwrite = true } = {}) {
  const { code } = getFamilyStatus();
  if (!code) throw new Error('Aucun salon famille');
  const url = familyUrl(code);
  if (!url) throw new Error('Aucun backend configuré');
  setSyncing(true);
  try {
    const endpoint = getEndpoint();
    const isSupabasePull = endpoint.includes('supabase.co');
    if (isSupabasePull && isSupabasePlaceholder()) {
      throw new Error('Supabase non configuré — remplace REPLACE_ME dans js/family-sync-config.js (voir SUPABASE_SETUP.md)');
    }
    let b64 = '';
    const tryKeyValueRead = async () => {
      try { return await getKeyValueChunked(code); } catch (e) { console.warn('[family] fallback keyvalue read échoué', e); return null; }
    };
    if (isSupabasePull) {
      b64 = await getSupabase(code);
    } else if (endpoint.includes('keyvalue.immanuel.co')) {
      b64 = await getKeyValueChunked(code);
      if (!b64) {
        toast('Salon vide — fais « Envoyer » sur l\'appareil qui a des données, puis « Restaurer » ici', { type: 'info', duration: 6000 });
        return null;
      }
    } else if (endpoint.includes('jsonstorage.net')) {
      try {
        b64 = await getJsonStorage(url);
      } catch (e) {
        if (String(e.message).includes('Item not found') || String(e.message).includes('404')) {
          b64 = await tryKeyValueRead();
        } else throw e;
      }
      if (!b64) {
        toast('Salon vide — fais « Envoyer » sur l\'appareil qui a des données, puis « Restaurer » ici', { type: 'info', duration: 6000 });
        return null;
      }
    } else {
      try {
        const res = await familyFetch(url, { method: 'GET' });
        b64 = (await res.text()).trim();
      } catch (e) {
        const msg = String(e.message);
        if (msg.includes('403') && /email/i.test(msg)) {
          console.warn('[family] kvdb 403 read → fallback keyvalue');
          b64 = await tryKeyValueRead();
        } else if (msg.includes('404') && /bucket/i.test(msg)) {
          b64 = await tryKeyValueRead();
        } else throw e;
      }
      if (!b64) {
        // si kvdb a échoué et fallback n'a rien trouvé non plus
        if (!b64) b64 = await tryKeyValueRead();
        if (!b64) {
          toast('Salon vide — fais « Envoyer » sur l\'appareil qui a des données', { type: 'info', duration: 6000 });
          return null;
        }
      }
    }
    if (!b64) {
      toast('Salon vide — fais « Envoyer » d\'abord', { type: 'info', duration: 6000 });
      return null;
    }
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
    const msg = String(e.message);
    if (msg.includes('Supabase non configuré') || msg.includes('REPLACE_ME') || msg.includes('Supabase 401') || msg.includes('Table Supabase')) {
      await showFamilySetupHelp('Configuration Supabase requise', msg);
      throw new Error(msg);
    }
    if (msg.includes('Salon vide') || msg.includes('Item not found') || msg.includes('404')) {
      // Salon vide n'est pas une erreur bloquante : on informe l'utilisateur
      if (!msg.includes('Salon vide')) toast('Salon vide — fais « Envoyer » sur l\'appareil source', { type: 'info', duration: 6000 });
      return null;
    }
    throw e;
  } finally { setSyncing(false); }
}
export async function syncFamilyNow({ direction = 'auto' } = {}) {
  const { code } = getFamilyStatus();
  if (!code) throw new Error('Aucun salon famille');
  const url = familyUrl(code);
  if (!url) throw new Error('Aucun backend');
  const endpoint = getEndpoint();
  const isSupabaseSync = endpoint.includes('supabase.co');
  const isKeyValue = endpoint.includes('keyvalue.immanuel.co');
  const isJsonStorage = endpoint.includes('jsonstorage.net');
  const isKvdb = endpoint.includes('kvdb.io');
  setSyncing(true);
  try {
    let remote = null;
    let remoteUpdatedAt = null;
    try {
      let b64 = '';
      if (isSupabaseSync) {
        b64 = await getSupabase(code);
      } else if (isKeyValue) {
        b64 = await getKeyValueChunked(code);
      } else if (isJsonStorage) {
        b64 = await getJsonStorage(url);
      } else {
        if (isKvdb) await ensureKvdbBucket();
        const u = isKvdb ? familyUrl(code) : url;
        const res = await familyFetch(u, { method: 'GET' });
        b64 = (await res.text()).trim();
      }
      if (b64) {
        const jsonStr = await decryptFamilyPayload(b64, code);
        remote = JSON.parse(jsonStr);
        remoteUpdatedAt = remote.updatedAt || remote.exportedAt;
      }
    } catch (e) {
      const msg = String(e.message);
      if (msg.includes('Salon vide') || msg.includes('Item not found')) {
        // salon vide → on va créer le premier push
        remote = null;
      } else if (!msg.includes('404')) {
        throw e;
      }
    }
    const localUpdatedAt = store.state.updatedAt || loadMetaExtra().lastUpdatedAt;
    const doPush = async () => {
      if (isSupabaseSync && isSupabasePlaceholder()) throw new Error('Supabase non configuré — voir SUPABASE_SETUP.md');
      const payload = buildFamilyPayload();
      const b64 = await encryptFamilyPayload(JSON.stringify(payload), code);
      if (isSupabaseSync) {
        await putSupabase(code, b64, payload.updatedAt);
      } else if (isKeyValue) {
        await putKeyValueChunked(code, b64);
      } else if (isJsonStorage) {
        await putJsonStorage(url, b64, payload.updatedAt);
      } else if (isKvdb) {
        await ensureKvdbBucket();
        const u = familyUrl(code);
        await familyFetch(u, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: b64 });
      } else {
        await familyFetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: b64 });
      }
      saveFamilyMeta({ lastSync: new Date().toISOString() });
      saveMetaExtra({ lastUpdatedAt: payload.updatedAt });
      emitStatus();
      return payload;
    };
    if (!remote) {
      await doPush();
      toast('Première synchro famille créée', { type: 'success' });
      return { action: 'push' };
    }
    if (direction === 'push') {
      await doPush();
      return { action: 'push' };
    }
    if (direction === 'pull') {
      store.importAll(remote);
      saveFamilyMeta({ lastSync: new Date().toISOString() });
      saveMetaExtra({ lastUpdatedAt: remoteUpdatedAt });
      emitStatus();
      return { action: 'pull' };
    }
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
      await doPush();
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
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes('Supabase non configuré') || msg.includes('REPLACE_ME') || msg.includes('Supabase 401') || msg.includes('Table Supabase')) {
      await showFamilySetupHelp('Configuration Supabase requise', msg);
    }
    throw e;
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
