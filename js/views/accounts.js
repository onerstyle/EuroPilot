// ============================================================
// views/accounts.js — Gestion des comptes (solde et historique)
// ============================================================

import { store } from '../store.js';
import { $, $$, esc, fmtEuro, parseAmount, todayISO, round2, MONTHS_SHORT, prevMonth } from '../utils.js';
import { openModal, closeModal, confirm, toast, toastUndo, txRow, bindTxRows, emptyState } from '../ui.js';
import { lineChart } from '../charts.js';

let selectedId = null;

export function render(root, { navigate }) {
  const { state } = store;
  if (!state.accounts.some((a) => a.id === selectedId)) selectedId = state.accounts[0]?.id || null;
  const total = store.totalBalance();

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Comptes</h1><p class="muted">Patrimoine total : <b class="${total >= 0 ? 'pos' : 'neg'}">${fmtEuro(total)}</b></p></div>
      <button class="btn btn-primary" data-add>＋ Nouveau compte</button>
    </div>
    <div class="account-grid">${state.accounts.map((a) => { const b = store.accountBalance(a.id); return `
      <div class="card account-card ${a.id === selectedId ? 'selected' : ''}" data-acc="${esc(a.id)}" style="--c:${esc(a.color)}">
        <div class="account-head"><span class="tx-icon" style="--c:${esc(a.color)}">${a.icon}</span><b>${esc(a.name)}</b><button class="icon-btn small" data-edit="${esc(a.id)}" title="Modifier">✎</button></div>
        <div class="account-balance ${b >= 0 ? '' : 'neg'}">${fmtEuro(b)}</div>
        <div class="muted small">${state.transactions.filter((t) => t.accountId === a.id).length} opérations</div>
      </div>`; }).join('')}
    </div>
    <div id="acc-detail"></div>`;

  $('[data-add]', root).onclick = () => accountForm();
  $$('[data-edit]', root).forEach((b) => b.onclick = (e) => { e.stopPropagation(); accountForm(state.accounts.find((a) => a.id === b.dataset.edit)); });
  $$('[data-acc]', root).forEach((c) => c.onclick = () => { selectedId = c.dataset.acc; render(root, { navigate }); });

  if (!selectedId) { $('#acc-detail', root).innerHTML = `<div class="card">${emptyState('🏦', 'Aucun compte', 'Créez un compte pour commencer.')}</div>`; return; }
  const acc = store.account(selectedId);
  const list = store.sortedTransactions().filter((t) => t.accountId === selectedId);
  const month = todayISO().slice(0, 7);
  const tm = store.totals(list.filter((t) => t.date.startsWith(month)));

  // Évolution du solde sur 12 mois
  const months = []; let k = month; for (let i = 0; i < 12; i++) { months.unshift(k); k = prevMonth(k); }
  const series = months.map((mm) => round2((acc.initialBalance || 0) + store.totals(list.filter((t) => t.date <= mm + '-31')).balance));

  $('#acc-detail', root).innerHTML = `
    <div class="grid-2col">
      <div class="card"><h2>${acc.icon} ${esc(acc.name)} — évolution du solde</h2><div id="acc-chart" class="chart-box"></div></div>
      <div class="card"><h2>Ce mois-ci</h2>
        <div class="day-totals"><div><span class="muted">Revenus</span><b class="pos">${fmtEuro(tm.income)}</b></div><div><span class="muted">Dépenses</span><b class="neg">${fmtEuro(tm.expense)}</b></div><div><span class="muted">Variation</span><b class="${tm.balance >= 0 ? 'pos' : 'neg'}">${fmtEuro(tm.balance)}</b></div></div>
        <p class="muted small">Solde initial : ${fmtEuro(acc.initialBalance || 0)} · Solde actuel : <b>${fmtEuro(store.accountBalance(acc.id))}</b>${store.accountBalance(acc.id, true) !== store.accountBalance(acc.id) ? ` · Solde prévisionnel (opérations futures incluses) : ${fmtEuro(store.accountBalance(acc.id, true))}` : ''}</p>
        <button class="btn btn-ghost full" data-all>Voir toutes les opérations du compte →</button>
      </div>
    </div>
    <div class="card"><h2>Historique récent</h2><div class="tx-list" id="acc-list">${list.length ? list.slice(0, 30).map((t) => txRow(t, { showAccount: false })).join('') : emptyState('📭', 'Aucune opération sur ce compte')}</div></div>`;
  lineChart($('#acc-chart', root), { labels: months.map((mm) => MONTHS_SHORT[Number(mm.slice(5)) - 1]), series: [{ name: 'Solde', color: acc.color, data: series }], zeroLine: true });
  bindTxRows(root);
  $('[data-all]', root).onclick = () => navigate('transactions', { account: acc.id, period: 'all' });
}

/** Formulaire compte */
function accountForm(acc = null) {
  const a = { name: '', icon: '🏦', color: '#2563eb', initialBalance: 0, ...(acc || {}) };
  const m = openModal({
    title: acc ? 'Modifier le compte' : 'Nouveau compte',
    content: `<form class="tx-form" id="aform">
      <div class="grid-2">
        <label>Nom<input name="name" value="${esc(a.name)}" placeholder="Ex : Compte courant" required></label>
        <label>Icône<input name="icon" value="${esc(a.icon)}" maxlength="4"></label>
        <label>Couleur<input type="color" name="color" value="${esc(a.color)}"></label>
        <label>Solde initial (€)<input name="initialBalance" inputmode="decimal" value="${String(a.initialBalance).replace('.', ',')}"><small class="muted">Solde avant la première opération enregistrée</small></label>
      </div>
      <div class="form-actions">${acc ? '<button type="button" class="btn btn-danger-ghost" data-del>Supprimer</button>' : ''}<span class="spacer"></span><button type="button" class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-primary">Enregistrer</button></div>
    </form>`,
  });
  const f = $('#aform', m);
  f.onsubmit = (e) => { e.preventDefault(); store.saveAccount({ id: acc?.id, name: f.elements.name.value.trim(), icon: f.elements.icon.value || '🏦', color: f.elements.color.value, initialBalance: parseAmount(f.elements.initialBalance.value) }); closeModal(); toastUndo('Compte enregistré'); };
  if (acc) $('[data-del]', f).onclick = async () => {
    const n = store.state.transactions.filter((t) => t.accountId === acc.id).length;
    if (await confirm(`Supprimer le compte « ${esc(acc.name)} » ?<br><b>${n} opération(s)</b> associée(s) seront également supprimées.`, { okLabel: 'Supprimer' })) { store.deleteAccount(acc.id); closeModal(); toastUndo('Compte supprimé'); }
  };
}
