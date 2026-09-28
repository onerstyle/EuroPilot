/**
 * EuroPilot Famille — Cloudflare Worker (1-clic)
 * Stockage léger: code -> base64 chiffré (AES-GCM côté client)
 * Compatible avec js/family-sync.js (generic endpoint: POST/GET /EURO-XXXX)
 * + compat Supabase REST (POST /rest/v1/family?onConflict=code, GET ?code=eq.XXX)
 *
 * Persistence (ordre de priorité):
 *  1) KV  — binding `FAMILY` (recommandé, gratuit): [[kv_namespaces]]
 *  2) D1  — binding `DB`   : [[d1_databases]]
 *  3) Mémoire volatile (fallback demo sans binding — OK pour tester, mais non persistant entre redémarrages)
 *
 * Déploie: voir ../WORKER_SETUP.md
 */

// Fallback mémoire (volatile) — utilisé seulement si ni KV ni D1 n'est lié
const MEM = new Map();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization, Prefer, X-Client-Info',
  'Access-Control-Max-Age': '86400',
};

function corsHeaders(extra = {}) {
  return { ...CORS, ...extra };
}
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(extra) },
  });
}
function text(body, status = 200, extra = {}) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeaders(extra) },
  });
}

function getPathCode(urlStr) {
  const u = (urlStr instanceof URL) ? urlStr : new URL(urlStr, 'http://localhost');
  let p = u.pathname.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.json$/, '');
  if (!p || p === 'health' || p.startsWith('rest/')) return null;
  if (p.startsWith('family/')) {
    const seg = p.slice(7).replace(/\.json$/, '');
    return decodeURIComponent(seg).toUpperCase();
  }
  if (/^EURO-[A-Z0-9]{4}$/i.test(p)) return p.toUpperCase();
  const seg = p.split('/').pop().replace(/\.json$/, '');
  if (/^EURO-[A-Z0-9]{4}$/i.test(seg)) return seg.toUpperCase();
  return decodeURIComponent(seg).toUpperCase();
}

async function kvGet(env, code) {
  if (env.FAMILY) {
    return await env.FAMILY.get(code);
  }
  if (env.DB) {
    try {
      // D1: crée la table à la volée si besoin
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS family (code TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT)`);
      const row = await env.DB.prepare('SELECT data FROM family WHERE code = ?').bind(code).first();
      return row ? row.data : null;
    } catch (e) {
      console.warn('D1 get failed', e);
    }
  }
  return MEM.get(code) || null;
}

async function kvPut(env, code, data, updatedAt) {
  const val = data; // b64 string
  if (env.FAMILY) {
    await env.FAMILY.put(code, val);
    // on stocke aussi updatedAt séparément si besoin (optionnel)
    if (updatedAt) await env.FAMILY.put(`${code}:updatedAt`, updatedAt);
    return;
  }
  if (env.DB) {
    try {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS family (code TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT)`);
      await env.DB.prepare(
        'INSERT INTO family (code, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at'
      ).bind(code, val, updatedAt || new Date().toISOString()).run();
      return;
    } catch (e) {
      console.warn('D1 put failed', e);
    }
  }
  MEM.set(code, val);
  if (updatedAt) MEM.set(`${code}:updatedAt`, updatedAt);
}

// Extrait code + data depuis la requête (supporte body texte brut OU JSON)
async function extractPayload(request, urlObj) {
  const url = urlObj || new URL(request.url);
  // Supabase-style: ?code=eq.EURO-XXXX
  const eq = url.searchParams.get('code');
  let codeFromQuery = null;
  if (eq && eq.startsWith('eq.')) codeFromQuery = decodeURIComponent(eq.slice(3)).toUpperCase();

  const ct = request.headers.get('content-type') || '';
  let bodyText = '';
  try { bodyText = await request.text(); } catch {}
  let bodyJson = null;
  if (bodyText && ct.includes('json')) {
    try { bodyJson = JSON.parse(bodyText); } catch {}
  } else if (bodyText && (bodyText.trim().startsWith('{') || bodyText.trim().startsWith('['))) {
    try { bodyJson = JSON.parse(bodyText); } catch {}
  }

  // Priorité 1: JSON { code, data, updated_at } (Supabase upsert)
  if (bodyJson && typeof bodyJson === 'object' && !Array.isArray(bodyJson) && bodyJson.code && bodyJson.data) {
    return { code: String(bodyJson.code).toUpperCase(), data: String(bodyJson.data), updatedAt: bodyJson.updated_at || bodyJson.updatedAt || null };
  }
  // Priorité 2: code dans query + body = b64
  if (codeFromQuery && bodyText) {
    // si body est JSON { data: "b64" }
    if (bodyJson && bodyJson.data) return { code: codeFromQuery, data: String(bodyJson.data), updatedAt: bodyJson.updated_at || null };
    return { code: codeFromQuery, data: bodyText.trim(), updatedAt: url.searchParams.get('updated_at') || null };
  }
  // Priorité 3: path /EURO-XXXX + body
  const pathCode = getPathCode(request.url);
  if (pathCode && bodyText) {
    if (bodyJson && bodyJson.data) return { code: pathCode, data: String(bodyJson.data), updatedAt: bodyJson.updated_at || null };
    return { code: pathCode, data: bodyText.trim(), updatedAt: null };
  }
  // Priorité 4: code seul dans query (GET)
  if (codeFromQuery && !bodyText) {
    return { code: codeFromQuery, data: null, updatedAt: null };
  }
  if (pathCode && !bodyText) {
    return { code: pathCode, data: null, updatedAt: null };
  }
  return { code: codeFromQuery || pathCode, data: bodyText ? bodyText.trim() : null, updatedAt: null };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Health & info
    if (url.pathname === '/health' || url.pathname === '/health/') {
      const hasKV = !!env.FAMILY;
      const hasD1 = !!env.DB;
      const mode = hasKV ? 'kv' : hasD1 ? 'd1' : 'memory (volatile)';
      return json({ ok: true, mode, time: new Date().toISOString() });
    }
    if (url.pathname === '/' || url.pathname === '') {
      const hasKV = !!env.FAMILY;
      const hasD1 = !!env.DB;
      const mode = hasKV ? 'KV' : hasD1 ? 'D1' : 'mémoire volatile (crée un KV/D1 pour persister)';
      const origin = url.origin;
      const html = `<!doctype html><meta charset="utf-8"><title>EuroPilot Famille Worker</title>
<style>body{font-family:system-ui, sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.6}code{background:#f3f4f6;padding:2px 6px;border-radius:6px}pre{background:#f3f4f6;padding:12px;border-radius:12px;overflow:auto}</style>
<h1>EuroPilot Famille — Worker OK</h1>
<p>Mode stockage : <b>${mode}</b></p>
<p>Endpoint à coller dans EuroPilot (F12 console) :</p>
<pre>localStorage.setItem('europilot.family.endpoint','${origin}');
localStorage.removeItem('europilot.family.key');
location.reload();</pre>
<p>Puis <i>Paramètres → Synchronisation Famille</i> → code <code>EURO-XXXX</code> → <b>Envoyer</b>.</p>
<p>Test santé : <a href="/health">/health</a></p>
<p>Docs : <code>WORKER_SETUP.md</code> dans le repo.</p>
<hr><p style="color:#6b7280;font-size:13px">Données chiffrées côté client (AES-GCM, clé = CODE). Le Worker ne voit que du base64.</p>`;
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders() } });
    }

    // Compat Supabase REST: /rest/v1/family
    const isSupabasePath = url.pathname.startsWith('/rest/v1/family');

    if (isSupabasePath) {
      if (request.method === 'GET') {
        const { code } = await extractPayload(request, url);
        if (!code) return json({ error: 'code manquant (ex: ?code=eq.EURO-XXXX)' }, 400);
        const data = await kvGet(env, code);
        if (!data) return json([], 200); // Supabase renvoie [] si vide
        // Récupère updatedAt si dispo
        let updatedAt = null;
        try {
          if (env.FAMILY) updatedAt = await env.FAMILY.get(`${code}:updatedAt`);
          else if (env.DB) {
            const row = await env.DB.prepare('SELECT updated_at FROM family WHERE code = ?').bind(code).first();
            updatedAt = row ? row.updated_at : null;
          } else updatedAt = MEM.get(`${code}:updatedAt`) || null;
        } catch {}
        return json([{ code, data, updated_at: updatedAt, updatedAt }], 200);
      }
      if (request.method === 'POST' || request.method === 'PATCH' || request.method === 'PUT') {
        const { code, data, updatedAt } = await extractPayload(request, url);
        if (!code || !data) return json({ error: 'code et data requis' }, 400);
        if (!/^EURO-[A-Z0-9]{4}$/i.test(code)) return json({ error: 'code invalide (EURO-XXXX)' }, 400);
        await kvPut(env, code.toUpperCase(), data, updatedAt);
        let updatedAtStored = updatedAt;
        // Renvoie comme Supabase (array)
        return json([{ code: code.toUpperCase(), data, updated_at: updatedAtStored }], 200, { Prefer: 'return=representation' });
      }
      return json({ error: 'méthode non supportée' }, 405);
    }

    // Routes génériques EuroPilot: /EURO-XXXX
    const code = getPathCode(request.url) || (await extractPayload(request, url)).code;

    if (request.method === 'GET') {
      if (!code) return json({ error: 'code manquant dans URL (ex: /EURO-AB12)' }, 400);
      const data = await kvGet(env, code.toUpperCase());
      if (!data) return text('', 404, { 'X-Empty': '1' });
      return text(data, 200);
    }

    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
      const payload = await extractPayload(request, url);
      const finalCode = (payload.code || code || '').toUpperCase();
      const finalData = payload.data;
      if (!finalCode || !finalData) return json({ error: 'code et body (base64) requis' }, 400);
      if (!/^EURO-[A-Z0-9]{4}$/i.test(finalCode)) return json({ error: 'code invalide' }, 400);
      await kvPut(env, finalCode, finalData, payload.updatedAt);
      return json({ ok: true, code: finalCode }, 200);
    }

    if (request.method === 'DELETE') {
      if (!code) return json({ error: 'code manquant' }, 400);
      if (env.FAMILY) {
        await env.FAMILY.delete(code.toUpperCase());
        await env.FAMILY.delete(`${code.toUpperCase()}:updatedAt`);
      } else if (env.DB) {
        await env.DB.prepare('DELETE FROM family WHERE code = ?').bind(code.toUpperCase()).run();
      } else {
        MEM.delete(code.toUpperCase());
      }
      return json({ ok: true }, 200);
    }

    return json({ error: 'not found', hint: 'GET /EURO-XXXX ou POST /EURO-XXXX avec body base64' }, 404);
  },
};
