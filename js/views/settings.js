// ============================================================
// views/settings.js — Paramètres : thème, catégories, moyens de paiement,
// import/export, sauvegarde, suppression + Synchronisation Famille
// ============================================================

import { store } from '../store.js';
import { $, $$, esc, fmtEuro } from '../utils.js';
import { openModal, closeModal, confirm, toast, toastUndo, optionList } from '../ui.js';
import { exportCSV, exportJSON, exportBackup, importCSV, importJSON, readFile, download } from '../io.js';
import { applyTheme } from '../main.js';
import {
  getFamilyStatus, onFamilyStatus, createFamilySalon, joinFamilySalon, leaveFamilySalon,
  pushToFamily, pullFromFamily, syncFamilyNow, setFamilyAutoSync, formatFamilyLastSync
} from '../family-sync.js';

export function render(root, { navigate }) {
  const { state } = store;
  const size = new Blob([JSON.stringify(state)]).size;
  const fam = getFamilyStatus();

  root.innerHTML = `
    <div class="page-head"><div><h1>Paramètres</h1><p class="muted">Personnalisation, données et confidentialité</p></div></div>

    <div class="grid-2col">
      <div class="card">
        <h2>Apparence</h2>
        <div class="seg" id="theme-seg">
          ${['auto', 'light', 'dark'].map((t) => `<button class="${state.settings.theme === t ? 'active' : ''}" data-theme="${t}">${{ auto: '🖥️ Auto', light: '☀️ Clair', dark: '🌙 Sombre' }[t]}</button>`).join('')}
        </div>
        <h2 class="mt">Valeurs par défaut</h2>
        <div class="grid-2">
          <label>Compte par défaut<select id="def-acc">${optionList(state.accounts, state.settings.defaultAccount)}</select></label>
          <label>Moyen de paiement par défaut<select id="def-pay">${optionList(state.payments, state.settings.defaultPayment)}</select></label>
        </div>
      </div>

      <div class="card">
        <h2>Sauvegarde & restauration</h2>
        <p class="muted small">Vos données (${state.transactions.length} opérations, ${(size / 1024).toFixed(1).replace('.', ',')} Ko) sont stockées <b>uniquement dans ce navigateur</b>. Pensez à exporter une sauvegarde régulièrement.</p>
        <div class="btn-row wrap">
          <button class="btn btn-primary" data-act="backup">💾 Sauvegarde complète (JSON)</button>
          <button class="btn btn-ghost" data-act="restore">📂 Restaurer une sauvegarde</button>
        </div>
        <h2 class="mt">Import / Export</h2>
        <div class="btn-row wrap">
          <button class="btn btn-ghost" data-act="csv">⬇ Export CSV</button>
          <button class="btn btn-ghost" data-act="json">⬇ Export JSON</button>
          <button class="btn btn-ghost" data-act="import-csv">⬆ Import CSV</button>
        </div>
        <p class="muted small">Format CSV : colonnes <code>Date;Type;Montant;Catégorie;Sous-catégorie;Description;Moyen de paiement;Compte;Note</code> (séparateur « ; » ou « , », dates JJ/MM/AAAA ou AAAA-MM-JJ).</p>
        <input type="file" id="file-input" hidden>
      </div>
    </div>

    <!-- Synchronisation Famille -->
    <div class="card" id="family-card">
      <div class="card-head">
        <h2>👨‍👩‍👧‍👦 Synchronisation Famille</h2>
        <span class="badge ${fam.hasCode ? 'ok' : ''}" id="family-badge">${fam.syncing ? 'Synchro…' : fam.hasCode ? fam.formattedCode : 'Non configuré'}</span>
      </div>
      <p class="muted small">
        Centralisez vos données pour les alimenter à plusieurs — <b>sans compte Google, sans Client ID</b>.<br>
        Crée un <b>salon</b> avec un code à 4 lettres (ex: <code>EURO-8K2P</code>) et partage-le à votre partenaire : vous alimentez le <b>même budget</b> en temps réel. Données <b>chiffrées côté téléphone</b> (AES-GCM, le code est la clé) — le serveur ne voit que du base64.
      </p>

      <div class="family-code-box" style="background:var(--bg-3);border:1px solid var(--border);border-radius:12px;padding:1rem;text-align:center;margin:.8rem 0">
        ${fam.hasCode ? `
          <div class="muted small">Code de ton salon</div>
          <div style="font:700 2rem var(--mono);letter-spacing:.15em;margin:.2rem 0" id="family-code">${esc(fam.formattedCode)}</div>
          <div class="btn-row wrap" style="justify-content:center">
            <button class="btn btn-ghost" id="family-copy">📋 Copier le code</button>
            <button class="btn btn-ghost" id="family-share">🔗 Partager le lien</button>
            <button class="btn btn-ghost" id="family-qr">📷 QR Code</button>
          </div>
          <p class="muted small" style="margin-top:.6rem">Donnez ce code à votre partenaire → de son côté <b>Rejoindre un salon</b> → colle le code → synchro.</p>
        ` : `
          <div class="muted small">Aucun salon</div>
          <p class="small" style="margin:.5rem 0">Crée un salon ou rejoins celui de ta famille pour centraliser les données.</p>
          <div class="btn-row wrap" style="justify-content:center">
            <button class="btn btn-primary" id="family-create">✨ Créer un salon (EURO-XXXX)</button>
          </div>
          <div style="margin:.8rem 0;border-top:1px dashed var(--border)"></div>
          <div style="display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap">
            <input id="family-join-input" placeholder="EURO-8K2P" style="max-width:160px;text-transform:uppercase;letter-spacing:.1em;text-align:center;font-family:var(--mono);font-weight:700" maxlength="9">
            <button class="btn btn-ghost" id="family-join">👋 Rejoindre un salon</button>
          </div>
        `}
      </div>

      <div class="drive-status" style="margin-top:.5rem">
        <div class="drive-status-grid">
          <div><span class="muted small">État</span><br><b id="family-status-text">${fam.hasCode ? (fam.syncing ? '🔄 Synchro…' : '🟢 Salon actif') : '⚪ Aucun salon'}</b></div>
          <div><span class="muted small">Dernière synchro</span><br><b id="family-last-sync">${esc(formatFamilyLastSync(fam.lastSync))}</b></div>
          <div><span class="muted small">Backend</span><br><code class="small">${esc(fam.endpoint.replace(/^https?:\/\//,''))}</code></div>
        </div>
      </div>

      <div class="btn-row wrap" style="margin-top:.9rem">
        <button class="btn btn-primary" id="family-sync" ${fam.hasCode ? '' : 'disabled'}>${fam.syncing ? '⏳ Synchro…' : '🔄 Synchroniser maintenant'}</button>
        <button class="btn btn-ghost" id="family-push" ${fam.hasCode ? '' : 'disabled'}>⬆ Envoyer</button>
        <button class="btn btn-ghost" id="family-pull" ${fam.hasCode ? '' : 'disabled'}>⬇ Restaurer</button>
        <button class="btn btn-ghost" id="family-leave" ${fam.hasCode ? '' : 'disabled'}>🚪 Quitter le salon</button>
      </div>

      <label class="check" style="margin-top:.9rem">
        <input type="checkbox" id="family-auto" ${fam.autoSync ? 'checked' : ''} ${fam.hasCode ? '' : 'disabled'}>
        Synchronisation automatique <small class="muted">— envoie 2s après chaque modification (si salon rejoint)</small>
      </label>

      <details class="drive-help" style="margin-top:.8rem">
        <summary class="muted small">Comment ça marche ?</summary>
        <ul class="muted small" style="margin:.5rem 0 0 1.2rem;line-height:1.6">
          <li><b>Créer</b> → génère <code>EURO-XXXX</code> → partage le code (copier / lien / QR)</li>
          <li><b>Rejoindre</b> → colle le code sur l'autre téléphone → <code>Synchroniser</code></li>
          <li>Utilisez <b>le même code sur tous les téléphones</b> qui doivent partager le budget</li>
          <li>Les données sont <b>chiffrées avec le code</b> avant envoi (AES-GCM 256, PBKDF2 120k itérations) — le serveur ne peut pas les lire</li>
          <li>Hors ligne : l'app fonctionne normalement, la sync sera retentée à la reconnexion</li>
          <li>Partage manuel de secours : <code>Sauvegarde complète → QR / Fichier</code> disponible même sans réseau</li>
        </ul>
      </details>

      <div class="btn-row wrap" style="margin-top:.8rem">
        <button class="btn btn-ghost" id="family-export-qr">📤 Exporter en QR / Lien</button>
        <button class="btn btn-ghost" id="family-export-file">💾 Exporter fichier chiffré</button>
        <label class="btn btn-ghost" style="cursor:pointer"><input type="file" id="family-import-file" hidden accept=".json,.txt">📥 Importer fichier chiffré</label>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Catégories</h2><button class="btn btn-ghost" data-add-cat>＋ Ajouter</button></div>
      <h3 class="muted">Dépenses</h3>
      <div class="chip-list">${state.categories.filter((c) => c.type === 'expense').map(chip).join('')}</div>
      <h3 class="muted mt">Revenus</h3>
      <div class="chip-list">${state.categories.filter((c) => c.type === 'income').map(chip).join('')}</div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Moyens de paiement</h2><button class="btn btn-ghost" data-add-pay>＋ Ajouter</button></div>
      <div class="chip-list">${state.payments.map((p) => `<button class="chip" data-pay="${esc(p.id)}">${p.icon} ${esc(p.name)}</button>`).join('')}</div>
    </div>

    <div class="card">
      <h2>Confidentialité</h2>
      <p class="muted small">🔒 EuroPilot reste utilisable hors ligne. La synchro Famille chiffre vos données côté téléphone avant envoi — le serveur ne voit que du base64 et ne peut pas lire vos montants sans le code.</p>
      <div class="btn-row wrap">
        <button class="btn btn-ghost" data-act="demo">🧪 Charger des données de démonstration</button>
        <button class="btn btn-ghost" data-act="demo-clear">🗑️ Supprimer les données de démonstration</button>
      </div>
    </div>

    <div class="card danger-zone">
      <h2>Zone dangereuse</h2>
      <p class="muted small">Supprime définitivement toutes les transactions, comptes, budgets, récurrences et paramètres de cet appareil. Cette action est irréversible.</p>
      <button class="btn btn-danger" data-act="wipe">🗑️ Supprimer définitivement toutes les données</button>
    </div>

    <p class="muted small center">EuroPilot · Pilotez votre argent, jour après jour. · <a href="https://github.com/onerstyle/EuroPilot" target="_blank" rel="noopener">Code source</a></p>`;

  function chip(c) { return `<button class="chip" data-cat="${esc(c.id)}" style="--c:${c.color}">${c.icon} ${esc(c.name)}${state.budgets[c.id] ? ` <small>· ${fmtEuro(state.budgets[c.id], { maximumFractionDigits: 0, minimumFractionDigits: 0 })}</small>` : ''}</button>`; }

  $$('[data-theme]', root).forEach((b) => b.onclick = () => { store.setSetting('theme', b.dataset.theme); applyTheme(); });
  $('#def-acc', root).onchange = (e) => store.setSetting('defaultAccount', e.target.value);
  $('#def-pay', root).onchange = (e) => store.setSetting('defaultPayment', e.target.value);
  $$('[data-cat]', root).forEach((b) => b.onclick = () => categoryForm(state.categories.find((c) => c.id === b.dataset.cat)));
  $('[data-add-cat]', root).onclick = () => categoryForm();
  $$('[data-pay]', root).forEach((b) => b.onclick = () => paymentForm(state.payments.find((p) => p.id === b.dataset.pay)));
  $('[data-add-pay]', root).onclick = () => paymentForm();

  const fileInput = $('#file-input', root);
  const pickFile = (accept) => new Promise((res) => { fileInput.accept = accept; fileInput.value = ''; fileInput.onchange = () => res(fileInput.files[0]); fileInput.click(); });

  $$('[data-act]', root).forEach((b) => b.onclick = async () => {
    const act = b.dataset.act;
    try {
      if (act === 'backup') exportBackup();
      else if (act === 'csv') exportCSV();
      else if (act === 'json') exportJSON();
      else if (act === 'import-csv') { const f = await pickFile('.csv,text/csv'); if (!f) return; const r = importCSV(await readFile(f)); toastUndo(`${r.imported} opération(s) importée(s)${r.skipped ? `, ${r.skipped} ignorée(s)` : ''}`); }
      else if (act === 'restore') {
        const f = await pickFile('.json,application/json'); if (!f) return;
        const text = await readFile(f);
        const isFull = !Array.isArray(JSON.parse(text));
        if (isFull && !(await confirm('Restaurer cette sauvegarde <b>remplacera toutes les données actuelles</b>. Continuer ?', { okLabel: 'Restaurer' }))) return;
        const r = importJSON(text); toastUndo(r.full ? `Sauvegarde restaurée (${r.imported} opérations)` : `${r.imported} opération(s) importée(s)`);
      }
      else if (act === 'demo') { if (await confirm('Ajouter un jeu de données fictives (18 mois d\'historique) pour découvrir l\'application ?', { okLabel: 'Charger la démo', danger: false })) { const { loadDemo } = await import('../demo.js'); loadDemo(); toastUndo('Données de démonstration chargées'); } }
      else if (act === 'demo-clear') {
        if (!(await confirm('Supprimer les données de démonstration ? Toutes les données de démonstration seront effacées de cet appareil.', { okLabel: 'Supprimer', danger: true }))) return;
        store.wipe();
        toast('Données de démonstration supprimées', { type: 'success' });
        navigate('dashboard');
      }
      else if (act === 'wipe') {
        if (!(await confirm('<b>Supprimer définitivement toutes les données ?</b><br>Toutes les transactions, comptes, budgets et paramètres seront effacés de cet appareil. Cette action est <b>irréversible</b>. Pensez à exporter une sauvegarde avant.', { okLabel: 'Tout supprimer' }))) return;
        if (!(await confirm('Dernière confirmation : êtes-vous certain ?', { okLabel: 'Oui, tout effacer' }))) return;
        store.wipe(); toast('Toutes les données ont été supprimées', { type: 'success' }); navigate('dashboard');
      }
    } catch (e) { console.error(e); toast('Erreur : ' + e.message, { type: 'error', duration: 7000 }); }
  });

  // ---------- Famille bindings ----------
  const famBadge = $('#family-badge', root);
  const famCodeEl = $('#family-code', root);
  const famStatusText = $('#family-status-text', root);
  const famLastSync = $('#family-last-sync', root);
  const famSyncBtn = $('#family-sync', root);
  const famPush = $('#family-push', root);
  const famPull = $('#family-pull', root);
  const famLeave = $('#family-leave', root);
  const famAuto = $('#family-auto', root);

  function refreshFamilyUI(s = getFamilyStatus()) {
    if (famBadge) {
      famBadge.textContent = s.syncing ? 'Synchro…' : s.hasCode ? s.formattedCode : 'Non configuré';
      famBadge.className = 'badge ' + (s.hasCode ? 'ok' : '');
    }
    if (famStatusText) famStatusText.textContent = s.syncing ? '🔄 Synchro…' : s.hasCode ? '🟢 Salon actif' : '⚪ Aucun salon';
    if (famLastSync) famLastSync.textContent = formatFamilyLastSync(s.lastSync);
    if (famSyncBtn) { famSyncBtn.disabled = !s.hasCode || s.syncing; famSyncBtn.textContent = s.syncing ? '⏳ Synchro…' : '🔄 Synchroniser maintenant'; }
    if (famPush) famPush.disabled = !s.hasCode || s.syncing;
    if (famPull) famPull.disabled = !s.hasCode || s.syncing;
    if (famLeave) famLeave.disabled = !s.hasCode;
    if (famAuto) { famAuto.checked = !!s.autoSync; famAuto.disabled = !s.hasCode; }
    if (famCodeEl) famCodeEl.textContent = s.formattedCode;
  }
  const offFam = onFamilyStatus(refreshFamilyUI);
  const prev = root._offFam;
  if (prev) prev();
  root._offFam = offFam;

  // Créer / Rejoindre
  $('#family-create', root)?.addEventListener('click', async () => {
    try { await createFamilySalon(); } catch (e) { toast(e.message, { type: 'error', duration: 7000 }); }
  });
  $('#family-join', root)?.addEventListener('click', async () => {
    const v = $('#family-join-input', root).value.trim();
    if (!v) { toast('Saisis un code (ex: EURO-8K2P)', { type: 'error' }); return; }
    try { await joinFamilySalon(v); } catch (e) { toast(e.message, { type: 'error', duration: 7000 }); }
  });
  $('#family-join-input', root)?.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#family-join', root).click(); });
  $('#family-copy', root)?.addEventListener('click', async () => {
    const c = getFamilyStatus().formattedCode;
    try { await navigator.clipboard.writeText(c); toast('Code copié : ' + c, { type: 'success' }); } catch { toast('Code : ' + c, { duration: 6000 }); }
  });
  $('#family-share', root)?.addEventListener('click', async () => {
    const c = getFamilyStatus().formattedCode;
    const url = location.origin + location.pathname + '#family=' + encodeURIComponent(c);
    if (navigator.share) { try { await navigator.share({ title: 'EuroPilot — Salon famille', text: `Rejoins mon salon EuroPilot : ${c}`, url }); return; } catch {} }
    try { await navigator.clipboard.writeText(url); toast('Lien copié', { type: 'success' }); } catch { openModal({ title: 'Lien de partage', content: `<p>Partage ce lien à ta famille :</p><code style="word-break:break-all;display:block;background:var(--bg-3);padding:.7rem;border-radius:8px">${esc(url)}</code>` }); }
  });
  $('#family-qr', root)?.addEventListener('click', async () => {
    const c = getFamilyStatus().formattedCode;
    const url = location.origin + location.pathname + '#family=' + encodeURIComponent(c);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`;
    openModal({ title: 'QR Code — Salon ' + c, content: `<div style="text-align:center"><img src="${qrUrl}" alt="QR" style="image-rendering:pixelated;border:1px solid var(--border);border-radius:12px"><p class="muted small" style="margin-top:.6rem">Scanne ce QR sur l'autre téléphone → il rejoindra le salon <b>${esc(c)}</b></p><code style="display:block;margin-top:.5rem;word-break:break-all">${esc(url)}</code></div>` });
  });
  $('#family-leave', root)?.addEventListener('click', async () => {
    if (await confirm(`Quitter le salon <b>${esc(getFamilyStatus().formattedCode)}</b> ?<br>Les données locales restent, mais tu ne seras plus synchronisé.`, { title: 'Quitter', okLabel: 'Quitter' })) leaveFamilySalon();
  });
  famSyncBtn?.addEventListener('click', async () => {
    famSyncBtn.disabled = true;
    try { await syncFamilyNow({ direction: 'auto' }); } catch (e) { toast(e.message, { type: 'error', duration: 8000 }); } finally { refreshFamilyUI(); }
  });
  famPush?.addEventListener('click', async () => {
    famPush.disabled = true;
    try { await pushToFamily(); } catch (e) { toast(e.message, { type: 'error', duration: 8000 }); } finally { refreshFamilyUI(); }
  });
  famPull?.addEventListener('click', async () => {
    famPull.disabled = true;
    try { await pullFromFamily({ confirmOverwrite: true }); } catch (e) { toast(e.message, { type: 'error', duration: 8000 }); } finally { refreshFamilyUI(); }
  });
  famAuto?.addEventListener('change', (e) => setFamilyAutoSync(e.target.checked));

  // Export / Import chiffré de secours
  $('#family-export-qr', root)?.addEventListener('click', async () => {
    try {
      const { code, b64 } = await (await import('../family-sync.js')).exportFamilySharePayload();
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(b64.slice(0, 800))}`;
      openModal({ title: 'Export chiffré — ' + code, content: `<p class="muted small">Données chiffrées avec le code <b>${esc(code)}</b>. L'autre téléphone peut importer ce fichier même hors ligne.</p><div style="text-align:center"><img src="${url}" style="max-width:100%;border:1px solid var(--border);border-radius:12px"></div><p class="muted small" style="margin-top:.6rem">Ou copie ce bloc (à envoyer par mail) :</p><textarea readonly style="width:100%;height:80px;font:12px var(--mono)">${esc(b64.slice(0, 600))}…</textarea>` });
    } catch (e) { toast(e.message, { type: 'error', duration: 7000 }); }
  });
  $('#family-export-file', root)?.addEventListener('click', async () => {
    try {
      const mod = await import('../family-sync.js');
      const { code, b64, payload } = await mod.exportFamilySharePayload();
      download(`europilot-famille-${code}-${new Date().toISOString().slice(0,10)}.txt`, b64, 'text/plain');
      toast('Fichier chiffré exporté', { type: 'success' });
    } catch (e) { toast(e.message, { type: 'error', duration: 7000 }); }
  });
  $('#family-import-file', root)?.addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const txt = await readFile(f);
      const code = getFamilyStatus().code || prompt('Code du salon (ex: EURO-8K2P) :');
      if (!code) return;
      const mod = await import('../family-sync.js');
      const data = await mod.importFamilySharePayload(txt.trim(), code.trim());
      toast(`Import famille réussi (${data.transactions.length} opérations)`, { type: 'success' });
    } catch (err) { toast('Import échoué : ' + err.message, { type: 'error', duration: 7000 }); }
    e.target.value = '';
  });
}

/** Formulaire catégorie */
function categoryForm(cat = null) {
  const c = { name: '', icon: '📦', color: '#64748b', type: 'expense', subs: [], ...(cat || {}) };
  const m = openModal({
    title: cat ? 'Modifier la catégorie' : 'Nouvelle catégorie',
    content: `<form class="tx-form" id="cform">
      <div class="grid-2">
        <label>Nom<input name="name" value="${esc(c.name)}" required></label>
        <label>Type<select name="type"><option value="expense" ${c.type === 'expense' ? 'selected' : ''}>Dépense</option><option value="income" ${c.type === 'income' ? 'selected' : ''}>Revenu</option></select></label>
        <label>Icône (emoji)<input name="icon" value="${esc(c.icon)}" maxlength="4"></label>
        <label>Couleur<input type="color" name="color" value="${esc(c.color)}"></label>
      </div>
      <label>Sous-catégories <small class="muted">(séparées par des virgules)</small><input name="subs" value="${esc((c.subs || []).join(', '))}"></label>
      <div class="form-actions">${cat && cat.id !== 'autres' ? '<button type="button" class="btn btn-danger-ghost" data-del>Supprimer</button>' : ''}<span class="spacer"></span><button type="button" class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-primary">Enregistrer</button></div>
    </form>`,
  });
  const f = $('#cform', m);
  f.onsubmit = (e) => { e.preventDefault(); store.saveCategory({ id: cat?.id, name: f.elements.name.value.trim(), type: f.elements.type.value, icon: f.elements.icon.value || '📦', color: f.elements.color.value, subs: f.elements.subs.value.split(',').map((s) => s.trim()).filter(Boolean) }); closeModal(); toastUndo('Catégorie enregistrée'); };
  const del = $('[data-del]', f);
  if (del) del.onclick = async () => { const n = store.state.transactions.filter((t) => t.categoryId === cat.id).length; if (await confirm(`Supprimer la catégorie « ${esc(cat.name)} » ? ${n ? `Les ${n} opération(s) associée(s) seront déplacées vers « Autres ».` : ''}`, { okLabel: 'Supprimer' })) { store.deleteCategory(cat.id); closeModal(); toastUndo('Catégorie supprimée'); } };
}

/** Formulaire moyen de paiement */
function paymentForm(p = null) {
  const v = { name: '', icon: '💳', ...(p || {}) };
  const m = openModal({
    title: p ? 'Modifier le moyen de paiement' : 'Nouveau moyen de paiement',
    content: `<form class="tx-form" id="pform"><div class="grid-2"><label>Nom<input name="name" value="${esc(v.name)}" required></label><label>Icône<input name="icon" value="${esc(v.icon)}" maxlength="4"></label></div>
      <div class="form-actions">${p ? '<button type="button" class="btn btn-danger-ghost" data-del>Supprimer</button>' : ''}<span class="spacer"></span><button type="button" class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-primary">Enregistrer</button></div></form>`,
  });
  const f = $('#pform', m);
  f.onsubmit = (e) => { e.preventDefault(); store.savePayment({ id: p?.id, name: f.elements.name.value.trim(), icon: f.elements.icon.value || '💳' }); closeModal(); toastUndo('Moyen de paiement enregistré'); };
  if (p) $('[data-del]', f).onclick = async () => { if (await confirm('Supprimer ce moyen de paiement ?', { okLabel: 'Supprimer' })) { store.deletePayment(p.id); closeModal(); toastUndo('Moyen de paiement supprimé'); } };
}
