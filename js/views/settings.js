// ============================================================
// views/settings.js — Paramètres : thème, catégories, moyens de paiement,
// import/export, sauvegarde, suppression des données
// ============================================================

import { store } from '../store.js';
import { $, $$, esc, fmtEuro } from '../utils.js';
import { openModal, closeModal, confirm, toast, toastUndo, optionList } from '../ui.js';
import { exportCSV, exportJSON, exportBackup, importCSV, importJSON, readFile } from '../io.js';
import { applyTheme } from '../main.js';

export function render(root, { navigate }) {
  const { state } = store;
  const size = new Blob([JSON.stringify(state)]).size;

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
        <p class="muted small">Vos données (${state.transactions.length} opérations, ${(size / 1024).toFixed(1).replace('.', ',')} Ko) sont stockées <b>uniquement dans ce navigateur</b>. Pensez à exporter une sauvegarde régulièrement, notamment avant de changer d'appareil ou de vider le cache.</p>
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
        <p class="muted small">Format CSV attendu : colonnes <code>Date;Type;Montant;Catégorie;Sous-catégorie;Description;Moyen de paiement;Compte;Note</code> (séparateur « ; » ou « , », dates JJ/MM/AAAA ou AAAA-MM-JJ). Un montant négatif est traité comme une dépense.</p>
        <input type="file" id="file-input" hidden>
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
      <p class="muted small">🔒 EuroPilot fonctionne entièrement hors ligne. Aucune donnée financière n'est envoyée à un serveur, aucun compte n'est requis, aucun traceur n'est utilisé. Le code source est ouvert (licence MIT).</p>
      <button class="btn btn-ghost" data-act="demo">🧪 Charger des données de démonstration</button>
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
      else if (act === 'wipe') {
        if (!(await confirm('<b>Supprimer définitivement toutes les données ?</b><br>Toutes les transactions, comptes, budgets et paramètres seront effacés de cet appareil. Cette action est <b>irréversible</b>. Pensez à exporter une sauvegarde avant.', { okLabel: 'Tout supprimer' }))) return;
        if (!(await confirm('Dernière confirmation : êtes-vous certain ?', { okLabel: 'Oui, tout effacer' }))) return;
        store.wipe(); toast('Toutes les données ont été supprimées', { type: 'success' }); navigate('dashboard');
      }
    } catch (e) { console.error(e); toast('Erreur : ' + e.message, { type: 'error', duration: 7000 }); }
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
