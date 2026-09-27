// ============================================================
// ui.js — Composants d'interface réutilisables : modales, toasts,
// confirmations, formulaire de transaction, sélecteurs.
// ============================================================

import { store } from './store.js';
import { $, $$, esc, html, todayISO, parseAmount, fmtEuro } from './utils.js';

// ---------- Toasts (notifications) ----------
export function toast(message, { type = 'info', action, actionLabel = 'Annuler', duration = 4500 } = {}) {
  const box = $('#toasts');
  const el = html(`<div class="toast toast-${type}"><span>${esc(message)}</span>${action ? `<button class="btn-link">${esc(actionLabel)}</button>` : ''}</div>`);
  if (action) $('button', el).onclick = () => { action(); el.remove(); };
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, duration);
}

/** Toast avec bouton "Annuler" branché sur la pile d'annulation du store */
export function toastUndo(message) {
  toast(message, { type: 'success', action: () => { const l = store.undo(); if (l) toast(`Annulé : ${l}`); } });
}

// ---------- Modales ----------
export function openModal({ title, content, footer = '', size = '' , onClose } = {}) {
  closeModal();
  const m = html(`
    <div class="modal-backdrop" role="dialog" aria-modal="true">
      <div class="modal ${size}">
        <header class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Fermer">✕</button></header>
        <div class="modal-body"></div>
        ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
      </div>
    </div>`);
  const body = $('.modal-body', m);
  if (typeof content === 'string') body.innerHTML = content; else body.appendChild(content);
  m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) closeModal(); });
  m._onClose = onClose;
  document.body.appendChild(m);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => m.classList.add('show'));
  const first = $('input:not([type=hidden]), select, textarea, button', body);
  if (first && window.innerWidth > 700) setTimeout(() => first.focus(), 50);
  return m;
}
export function closeModal() {
  const m = $('.modal-backdrop');
  if (m) { m._onClose?.(); m.remove(); }
  document.body.classList.remove('modal-open');
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

/** Boîte de confirmation (Promise<boolean>) */
export function confirm(message, { title = 'Confirmation', okLabel = 'Confirmer', danger = true } = {}) {
  return new Promise((resolve) => {
    const m = openModal({
      title, size: 'small',
      content: `<p class="confirm-text">${message}</p>`,
      footer: `<button class="btn btn-ghost" data-close>Annuler</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okLabel)}</button>`,
      onClose: () => resolve(false),
    });
    $('[data-ok]', m).onclick = () => { m._onClose = null; closeModal(); resolve(true); };
  });
}

// ---------- Helpers de formulaire ----------
export const optionList = (list, selected, labelFn = (x) => `${x.icon || ''} ${x.name}`.trim()) =>
  list.map((x) => `<option value="${esc(x.id)}" ${x.id === selected ? 'selected' : ''}>${esc(labelFn(x))}</option>`).join('');

export const yearOptions = (selected) => store.years().map((y) => `<option value="${y}" ${y === Number(selected) ? 'selected' : ''}>${y}</option>`).join('');

/** Barre de progression colorée selon le ratio */
export function progressBar(ratio) {
  const pct = Math.min(100, Math.max(0, ratio * 100));
  const cls = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok';
  return `<div class="progress ${cls}"><div style="width:${pct}%"></div></div>`;
}

// ---------- Formulaire de transaction (ajout / modification) ----------
/**
 * Ouvre la modale d'ajout ou de modification d'une transaction.
 * @param {object|null} tx transaction existante ou null
 * @param {object} presets valeurs par défaut (ex : { date })
 */
export function transactionForm(tx = null, presets = {}) {
  const { state } = store;
  const t = {
    date: todayISO(), amount: '', type: 'expense', categoryId: '', sub: '', description: '',
    paymentId: state.settings.defaultPayment, accountId: state.settings.defaultAccount, note: '', recurring: false,
    ...presets, ...(tx || {}),
  };
  const cats = (type) => state.categories.filter((c) => c.type === type);
  if (!t.categoryId) t.categoryId = cats(t.type)[0]?.id || '';

  const form = html(`
    <form class="tx-form" autocomplete="off">
      <div class="type-toggle" role="radiogroup">
        <label class="${t.type === 'expense' ? 'active' : ''}"><input type="radio" name="type" value="expense" ${t.type === 'expense' ? 'checked' : ''}> Dépense</label>
        <label class="${t.type === 'income' ? 'active' : ''}"><input type="radio" name="type" value="income" ${t.type === 'income' ? 'checked' : ''}> Revenu</label>
      </div>
      <div class="amount-field">
        <input name="amount" inputmode="decimal" placeholder="0,00" value="${esc(t.amount || '')}" required autofocus>
        <span>€</span>
      </div>
      <div class="grid-2">
        <label>Date<input type="date" name="date" value="${esc(t.date)}" required></label>
        <label>Catégorie<select name="categoryId"></select></label>
        <label>Sous-catégorie<input name="sub" list="sub-list" value="${esc(t.sub)}" placeholder="Facultatif"><datalist id="sub-list"></datalist></label>
        <label>Description<input name="description" value="${esc(t.description)}" placeholder="Ex : Courses Carrefour"></label>
        <label>Moyen de paiement<select name="paymentId">${optionList(state.payments, t.paymentId)}</select></label>
        <label>Compte<select name="accountId">${optionList(state.accounts, t.accountId)}</select></label>
      </div>
      <label>Note<textarea name="note" rows="2" placeholder="Facultatif">${esc(t.note)}</textarea></label>
      ${!tx ? `<label class="check"><input type="checkbox" name="recurring"> Rendre cette opération récurrente (mensuelle)</label>` : ''}
      <div class="form-actions">
        ${tx ? '<button type="button" class="btn btn-danger-ghost" data-del>Supprimer</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn btn-ghost" data-close>Annuler</button>
        <button type="submit" class="btn btn-primary">${tx ? 'Enregistrer' : 'Ajouter'}</button>
      </div>
    </form>`);

  const catSel = $('[name=categoryId]', form);
  const subList = $('#sub-list', form);
  const fillCats = (type) => {
    const list = cats(type);
    const cur = list.some((c) => c.id === t.categoryId) ? t.categoryId : list[0]?.id;
    catSel.innerHTML = optionList(list, cur);
    fillSubs();
  };
  const fillSubs = () => { subList.innerHTML = (store.category(catSel.value).subs || []).map((s) => `<option value="${esc(s)}">`).join(''); };
  catSel.onchange = fillSubs;
  fillCats(t.type);
  $$('.type-toggle input', form).forEach((r) => r.onchange = () => {
    $$('.type-toggle label', form).forEach((l) => l.classList.toggle('active', $('input', l).checked));
    fillCats(r.value);
  });

  form.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const amount = parseAmount(fd.get('amount'));
    if (!amount || amount <= 0) { $('[name=amount]', form).focus(); toast('Veuillez saisir un montant valide', { type: 'error' }); return; }
    const data = {
      date: fd.get('date'), amount, type: fd.get('type'), categoryId: fd.get('categoryId'), sub: fd.get('sub').trim(),
      description: fd.get('description').trim(), paymentId: fd.get('paymentId'), accountId: fd.get('accountId'), note: fd.get('note').trim(),
    };
    if (tx) { store.updateTransaction(tx.id, data); toastUndo('Transaction modifiée'); }
    else {
      if (fd.get('recurring')) {
        const rec = { label: data.description || store.category(data.categoryId).name, amount, type: data.type, categoryId: data.categoryId, sub: data.sub, paymentId: data.paymentId, accountId: data.accountId, frequency: 'monthly', interval: 1, startDate: data.date, nextDate: data.date, active: true };
        store.saveRecurring(rec);
        toast('Récurrence mensuelle créée — les échéances seront générées automatiquement', { type: 'success', duration: 6000 });
        // La première occurrence est générée immédiatement si la date est passée
        import('./recurring.js').then((m) => m.processRecurring());
      } else {
        store.addTransaction(data);
        toastUndo(`${data.type === 'income' ? 'Revenu' : 'Dépense'} de ${fmtEuro(amount)} ajouté${data.type === 'income' ? '' : 'e'}`);
      }
    }
    closeModal();
  };
  if (tx) $('[data-del]', form).onclick = async () => {
    if (await confirm('Supprimer définitivement cette transaction ?', { okLabel: 'Supprimer' })) {
      store.deleteTransaction(tx.id); closeModal(); toastUndo('Transaction supprimée');
    }
  };

  openModal({ title: tx ? 'Modifier la transaction' : 'Nouvelle transaction', content: form });
  const amt = $('[name=amount]', form);
  setTimeout(() => amt.focus(), 80);
}

/** Ligne de transaction (liste) */
export function txRow(t, { showAccount = true } = {}) {
  const c = store.category(t.categoryId);
  const a = store.account(t.accountId);
  return `
    <div class="tx-row" data-id="${esc(t.id)}" role="button" tabindex="0">
      <span class="tx-icon" style="--c:${esc(c.color)}">${c.icon}</span>
      <span class="tx-main">
        <span class="tx-title">${esc(t.description || c.name)}${t.recurringId ? ' <span class="tag" title="Récurrent">↻</span>' : ''}</span>
        <span class="tx-meta">${esc(c.name)}${t.sub ? ' › ' + esc(t.sub) : ''}${showAccount ? ' · ' + esc(a.name) : ''}${t.paymentId ? ' · ' + esc(store.payment(t.paymentId).name) : ''}</span>
      </span>
      <span class="tx-amount ${t.type}">${t.type === 'income' ? '+' : '−'}${fmtEuro(t.amount)}</span>
    </div>`;
}

/** Branche le clic sur les lignes de transaction -> ouverture du formulaire */
export function bindTxRows(root) {
  $$('.tx-row', root).forEach((row) => {
    const open = () => { const t = store.state.transactions.find((x) => x.id === row.dataset.id); if (t) transactionForm(t); };
    row.onclick = open;
    row.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
  });
}

/** État vide illustré */
export const emptyState = (icon, title, text = '') => `<div class="empty"><div class="empty-icon">${icon}</div><h3>${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}</div>`;
