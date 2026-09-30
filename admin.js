// ══════════════════════════════════════════════════════════════
//  Tarawih Schema — Adminläge
//  Laddas bara efter tre snabba tryck på rubriken (index.html).
//
//  SÄKERHET: all behörighet avgörs av Firebase Auth + Firestore-
//  reglerna (firestore.rules). Inget i den här filen är hemligt;
//  firebaseConfig är publik per design. ADMIN_UIDS nedan används
//  bara för att visa ett begripligt felmeddelande — skyddet ligger
//  i reglerna.
// ══════════════════════════════════════════════════════════════

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, onSnapshot, setDoc, deleteField, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

// Webbappens config (Project settings → Your apps → SverigesImamer).
// Publik per design — skyddet ligger i firestore.rules.
const firebaseConfig = {
  apiKey:            'AIzaSyA1YkZi9MPCHetCCG6XDyg2TA7AbadmT6k',
  authDomain:        'sverigesimamer.firebaseapp.com',
  projectId:         'sverigesimamer',
  appId:             '1:860592398067:web:3ae1c407c498eee39e6186',
  messagingSenderId: '860592398067',
};

const ADMIN_UIDS = ['3KJixZp9j8eI7f2KvqSUjBWf76F3', 'EBvjfRtz3sOnlfqtfahtLChMWPz2'];
const FLAG_KEY   = 'tarawih-admin';
const DEFAULT_START = '2027-02-07';
const PALETTE    = ['#e8630a', '#d4a800', '#2980b9', '#219150', '#7d3aac', '#7b3f00',
                    '#2d6a4f', '#1a3a6b', '#c0392b', '#16a085', '#8e44ad', '#4a4a4a'];

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const ref  = doc(db, 'tarawih', '1448');

let user = null;
let data = { imams: {}, assignments: {}, nights: {}, startDate: null, eidDate: null };
let unsubscribe = null;

const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cleanName = s => String(s || '').replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
const setFlag = on => { try { on ? localStorage.setItem(FLAG_KEY, '1') : localStorage.removeItem(FLAG_KEY); } catch (e) {} };

// ── Stil (följer sidans tokens: --surface, --text, --primary, --gold) ──
function injectStyles() {
  if ($('#adm-style')) return;
  const st = document.createElement('style');
  st.id = 'adm-style';
  st.textContent = `
    .adm-backdrop { position: fixed; inset: 0; z-index: 100000; background: rgba(8,14,12,.55);
      backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
      display: flex; align-items: flex-end; justify-content: center; animation: admFade .2s ease; }
    @media (min-width: 640px) { .adm-backdrop { align-items: center; } }
    @keyframes admFade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes admUp { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }
    .adm-modal { width: 100%; max-width: 420px; max-height: 88vh; overflow: auto; background: var(--surface, #fff);
      color: var(--text, #1a1a1a); border-radius: 22px 22px 0 0; padding: 26px 22px calc(22px + env(safe-area-inset-bottom));
      box-shadow: 0 -8px 40px rgba(0,0,0,.25); animation: admUp .25s cubic-bezier(.22,1,.36,1); font-family: 'DM Sans', system-ui, sans-serif; }
    @media (min-width: 640px) { .adm-modal { border-radius: 22px; padding-bottom: 22px; } }
    .adm-orn { display: flex; justify-content: center; align-items: center; gap: 8px; margin-bottom: 10px; }
    .adm-orn i { display: block; height: 1px; width: 36px; background: var(--gold, #c9a84c); opacity: .6; }
    .adm-orn b { display: block; width: 6px; height: 6px; background: var(--gold, #c9a84c); transform: rotate(45deg); }
    .adm-title { font-family: 'Cormorant Garamond', serif; font-size: 1.7rem; font-weight: 700; text-align: center; margin: 0 0 18px; }
    .adm-field { display: block; margin-bottom: 12px; }
    .adm-field span { display: block; font-size: .72rem; letter-spacing: .06em; text-transform: uppercase; color: var(--muted, #6b7280); margin-bottom: 5px; }
    .adm-input { width: 100%; box-sizing: border-box; font: inherit; font-size: 16px; padding: 12px 14px; border-radius: 12px;
      border: 1px solid var(--border, rgba(36,100,93,.15)); background: var(--surface-2, #f0ece4); color: var(--text, #1a1a1a); outline: none; }
    .adm-input:focus { border-color: var(--primary, #24645d); box-shadow: 0 0 0 3px rgba(36,100,93,.15); }
    .adm-btn { font: inherit; font-weight: 600; font-size: .92rem; border: 0; border-radius: 12px; padding: 12px 16px; cursor: pointer;
      background: var(--primary, #24645d); color: #fff; }
    .adm-btn:disabled { opacity: .6; cursor: default; }
    .adm-btn.ghost { background: transparent; color: var(--muted, #6b7280); }
    .adm-btn.danger { background: transparent; color: #c0392b; padding: 8px 10px; }
    .adm-row { display: flex; gap: 8px; align-items: center; }
    .adm-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
    .adm-actions .adm-btn:not(.ghost) { flex: 1; }
    .adm-err { color: #c0392b; font-size: .82rem; min-height: 1.2em; margin: 4px 0 0; }

    /* Adminremsa */
    .adm-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 99990; height: 36px; display: flex; align-items: center;
      justify-content: space-between; gap: 8px; padding: 0 10px; padding-top: env(safe-area-inset-top); box-sizing: content-box;
      background: var(--primary-dark, #1a4a44); color: #fff; font: 600 .78rem 'DM Sans', system-ui, sans-serif; box-shadow: 0 2px 10px rgba(0,0,0,.2); }
    .adm-bar-label { display: flex; align-items: center; gap: 7px; white-space: nowrap; }
    .adm-bar-label::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--gold-light, #e8c97a); }
    .adm-bar button { font: inherit; color: #fff; background: rgba(255,255,255,.12); border: 0; border-radius: 8px; padding: 6px 10px; cursor: pointer; white-space: nowrap; }
    .adm-bar-actions { display: flex; gap: 6px; }
    body.adm-on { padding-top: calc(36px + env(safe-area-inset-top)); }
    @media (max-width: 360px) { .adm-bar { padding: 0 6px; gap: 4px; } .adm-bar button { padding: 6px 7px; font-size: .72rem; } .adm-bar-actions { gap: 4px; } }

    /* Redigerbara imam-chips */
    body.adm-on .imam-chip { position: relative; cursor: pointer; }
    body.adm-on .imam-chip::after { content: '▾'; margin-left: 2px; font-size: .7em; opacity: .75; }
    .adm-sel { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; font-size: 16px; -webkit-appearance: none; appearance: none; }
    .imam-chip.adm-saving { opacity: .55; }

    /* Hantera imamer */
    .adm-list { list-style: none; margin: 0 0 14px; padding: 0; }
    .adm-list li { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border-subtle, rgba(0,0,0,.06)); }
    .adm-list .adm-input { padding: 9px 12px; }
    .adm-color { width: 30px; height: 30px; flex: none; border: 0; padding: 0; border-radius: 50%; overflow: hidden; background: none; cursor: pointer; }
    .adm-color::-webkit-color-swatch-wrapper { padding: 0; }
    .adm-color::-webkit-color-swatch { border: 0; border-radius: 50%; }
    .adm-count { font-size: .72rem; color: var(--muted, #6b7280); white-space: nowrap; min-width: 52px; text-align: right; }
    .adm-empty { color: var(--muted, #6b7280); font-size: .88rem; text-align: center; padding: 10px 0 16px; }

    .adm-toast { position: fixed; left: 50%; bottom: calc(22px + env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 100001;
      background: var(--primary-dark, #1a4a44); color: #fff; font: 600 .82rem 'DM Sans', system-ui, sans-serif; padding: 10px 16px;
      border-radius: 12px; box-shadow: 0 6px 24px rgba(0,0,0,.25); animation: admUp .2s ease; }
    .adm-toast.err { background: #c0392b; }

    /* Redigerbara sidor/suror */
    body.adm-on .td-sidor, body.adm-on .td-surah, body.adm-on .dcm-pages, body.adm-on .dcm-surahs { cursor: pointer; }
    body.adm-on .td-sidor, body.adm-on .surah-names, body.adm-on .dcm-pages { text-decoration: underline dashed rgba(201,168,76,.7); text-underline-offset: 3px; }
    body.adm-on .dcm-surahs { outline: 1px dashed rgba(201,168,76,.55); outline-offset: -1px; }
    .adm-hint { font-size: .78rem; color: var(--muted, #6b7280); text-align: center; margin: -8px 0 14px; line-height: 1.5; }
    .adm-preview { background: var(--surface-2, #f0ece4); border-radius: 12px; padding: 12px 14px; font-size: .85rem; line-height: 1.7; margin: 4px 0 6px; }
    .adm-preview b { color: var(--primary, #24645d); }
    .adm-link { font: inherit; font-size: .8rem; background: none; border: 0; color: var(--primary, #24645d); text-decoration: underline; cursor: pointer; padding: 0; }
    textarea.adm-input { resize: vertical; min-height: 64px; line-height: 1.45; }
  `;
  document.head.appendChild(st);
}

function toast(msg, isErr = false) {
  document.querySelectorAll('.adm-toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'adm-toast' + (isErr ? ' err' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), isErr ? 4000 : 1600);
}

function modal(html) {
  const bd = document.createElement('div');
  bd.className = 'adm-backdrop';
  bd.innerHTML = `<div class="adm-modal" role="dialog" aria-modal="true">
    <div class="adm-orn"><i></i><b></b><i></i></div>${html}</div>`;
  const close = () => bd.remove();
  bd.addEventListener('click', e => { if (e.target === bd) close(); });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  });
  document.body.appendChild(bd);
  return { el: bd, close };
}

function authErrorText(code) {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':        return 'Fel e-post eller lösenord.';
    case 'auth/too-many-requests':    return 'För många försök. Vänta en stund och försök igen.';
    case 'auth/network-request-failed': return 'Ingen anslutning. Kontrollera nätet.';
    case 'auth/operation-not-allowed':  return 'E-post/lösenord är inte aktiverat i Firebase.';
    default:                          return 'Inloggningen misslyckades (' + code + ').';
  }
}

// ── Inloggning ──
export function openLogin() {
  injectStyles();
  if (user && ADMIN_UIDS.includes(user.uid)) { enterAdmin(); return; }
  if ($('.adm-backdrop')) return;
  const m = modal(`
    <h2 class="adm-title">Admin</h2>
    <form id="adm-login" autocomplete="on">
      <label class="adm-field"><span>E-post</span>
        <input class="adm-input" type="email" name="email" autocomplete="username" required></label>
      <label class="adm-field"><span>Lösenord</span>
        <input class="adm-input" type="password" name="password" autocomplete="current-password" required></label>
      <p class="adm-err" id="adm-login-err"></p>
      <div class="adm-actions">
        <button type="button" class="adm-btn ghost" id="adm-cancel">Avbryt</button>
        <button type="submit" class="adm-btn">Logga in</button>
      </div>
    </form>`);
  $('#adm-cancel', m.el).onclick = m.close;
  const form = $('#adm-login', m.el);
  setTimeout(() => form.email.focus(), 50);
  form.onsubmit = async e => {
    e.preventDefault();
    const btn = $('button[type=submit]', form), err = $('#adm-login-err', m.el);
    btn.disabled = true; err.textContent = '';
    try {
      const cred = await signInWithEmailAndPassword(auth, form.email.value.trim(), form.password.value);
      if (!ADMIN_UIDS.includes(cred.user.uid)) {
        await signOut(auth);
        err.textContent = 'Kontot saknar adminbehörighet.';
        btn.disabled = false;
        return;
      }
      m.close();
      enterAdmin();
    } catch (ex) {
      err.textContent = authErrorText(ex.code);
      btn.disabled = false;
    }
  };
}

// Anropas vid sidladdning om enheten tidigare loggat in som admin
export function resume() {
  injectStyles();
  const stop = onAuthStateChanged(auth, u => {
    stop();
    if (u && ADMIN_UIDS.includes(u.uid)) enterAdmin(); else setFlag(false);
  });
}

onAuthStateChanged(auth, u => { user = u; });

// ── Adminläge ──
function enterAdmin() {
  user = auth.currentUser;
  if (!user || $('.adm-bar')) return;
  setFlag(true);
  document.body.classList.add('adm-on');

  const bar = document.createElement('div');
  bar.className = 'adm-bar';
  bar.innerHTML = `<span class="adm-bar-label">Adminläge</span>
    <span class="adm-bar-actions">
      <button type="button" id="adm-start">Datum</button>
      <button type="button" id="adm-manage">Imamer</button>
      <button type="button" id="adm-logout">Logga ut</button>
    </span>`;
  document.body.appendChild(bar);
  $('#adm-manage').onclick = openManage;
  $('#adm-start').onclick = openStartDate;
  document.addEventListener('click', onEditableClick, true);
  $('#adm-logout').onclick = async () => {
    await signOut(auth);
    setFlag(false);
    location.reload();
  };

  // Live-synk: båda admins ser varandras ändringar direkt
  unsubscribe = onSnapshot(ref, snap => {
    const d = snap.exists() ? snap.data() : {};
    data = {
      imams: d.imams || {}, assignments: d.assignments || {}, nights: d.nights || {},
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(d.startDate || '') ? d.startDate : DEFAULT_START,
      eidDate: /^\d{4}-\d{2}-\d{2}$/.test(d.eidDate || '') ? d.eidDate : null,
    };
    try { localStorage.setItem('tarawih-imams-1448', JSON.stringify(data)); } catch (e) {}
    // Nytt startdatum (även från den andra admin) → räkna om alla datum
    const effEid = data.eidDate && data.eidDate >= addDaysIso(data.startDate, 30) && data.eidDate <= addDaysIso(data.startDate, 31)
      ? data.eidDate : addDaysIso(data.startDate, 31);
    if (data.startDate !== window.RAMADAN_START || effEid !== window.EID_DATE) { location.reload(); return; }
    window.applyImamData(data);
    attachSelects();
    refreshManage();
  }, err => toast('Kunde inte läsa schemat: ' + err.code, true));
}

function imamOptions(selected) {
  const ids = Object.keys(data.imams).sort((a, b) => data.imams[a].name.localeCompare(data.imams[b].name, 'sv'));
  return `<option value=""${selected ? '' : ' selected'}>— Meddelas senare —</option>` +
    ids.map(id => `<option value="${esc(id)}"${id === selected ? ' selected' : ''}>${esc(data.imams[id].name)}</option>`).join('');
}

// Lägger en osynlig native <select> över varje imam-chip → snabbt byte på mobil och desktop
function attachSelects() {
  (window.SCHEDULE || []).forEach(row => {
    const current = data.imams[data.assignments[row.day]] ? data.assignments[row.day] : '';
    document.querySelectorAll(`[data-datum="${row.datum}"] .imam-chip`).forEach(chip => {
      let sel = chip.querySelector('.adm-sel');
      if (!sel) {
        sel = document.createElement('select');
        sel.className = 'adm-sel';
        sel.setAttribute('aria-label', 'Välj imam för natt ' + row.day);
        ['click', 'pointerdown', 'mousedown', 'touchstart'].forEach(ev =>
          sel.addEventListener(ev, e => e.stopPropagation(), { passive: true }));
        sel.addEventListener('change', () => assign(row.day, sel.value, chip));
        chip.appendChild(sel);
      }
      sel.innerHTML = imamOptions(current);
    });
  });
}

async function assign(day, imamId, chip) {
  const prev = data.assignments[day] || '';
  if (prev === imamId) return;
  // Optimistisk uppdatering
  const next = { ...data, assignments: { ...data.assignments } };
  if (imamId) next.assignments[day] = imamId; else delete next.assignments[day];
  data = next;
  window.applyImamData(data);
  chip && chip.classList.add('adm-saving');
  try {
    await setDoc(ref, {
      assignments: { [day]: imamId ? imamId : deleteField() },
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    }, { merge: true });
    const name = imamId ? data.imams[imamId].name : 'Meddelas senare';
    toast(`Natt ${day}: ${name} ✓`);
  } catch (ex) {
    const rollback = { ...data, assignments: { ...data.assignments } };
    if (prev) rollback.assignments[day] = prev; else delete rollback.assignments[day];
    data = rollback;
    window.applyImamData(data);
    attachSelects();
    toast(ex.code === 'permission-denied' ? 'Saknar behörighet att spara.' : 'Kunde inte spara: ' + (ex.code || ex.message), true);
  } finally {
    chip && chip.classList.remove('adm-saving');
  }
}

// ── Hantera imamer ──
let manageModal = null;

function nightsFor(id) {
  return Object.keys(data.assignments).filter(d => data.assignments[d] === id).map(Number).sort((a, b) => a - b);
}

function newId(name) {
  const base = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'imam';
  let id = base, i = 2;
  while (data.imams[id] || id === 'tba' || id === 'chip') id = base + '-' + i++;
  return id;
}

function nextColor() {
  const used = new Set(Object.values(data.imams).map(i => i.color));
  return PALETTE.find(c => !used.has(c)) || PALETTE[Object.keys(data.imams).length % PALETTE.length];
}

const save_ = (patch, okMsg) => save(patch, okMsg);
async function save(patch, okMsg) {
  try {
    await setDoc(ref, { ...patch, updatedAt: serverTimestamp(), updatedBy: user.uid }, { merge: true });
    if (okMsg) toast(okMsg);
    return true;
  } catch (ex) {
    toast(ex.code === 'permission-denied' ? 'Saknar behörighet att spara.' : 'Kunde inte spara: ' + (ex.code || ex.message), true);
    return false;
  }
}

function openManage() {
  if (manageModal) return;
  manageModal = modal(`
    <h2 class="adm-title">Hantera imamer</h2>
    <ul class="adm-list" id="adm-list"></ul>
    <form class="adm-row" id="adm-add">
      <input class="adm-input" name="name" placeholder="Namn på ny imam" maxlength="40" autocomplete="off" required>
      <button class="adm-btn" type="submit">Lägg till</button>
    </form>
    <div class="adm-actions"><button type="button" class="adm-btn ghost" id="adm-close">Stäng</button></div>`);
  const origClose = manageModal.close;
  manageModal.close = () => { origClose(); manageModal = null; };
  manageModal.el.addEventListener('click', e => { if (e.target === manageModal?.el) manageModal.close(); });
  $('#adm-close', manageModal.el).onclick = () => manageModal.close();

  const form = $('#adm-add', manageModal.el);
  form.onsubmit = async e => {
    e.preventDefault();
    const name = cleanName(form.name.value);
    if (!name) return;
    if (Object.values(data.imams).some(i => i.name.toLowerCase() === name.toLowerCase())) {
      toast('Det finns redan en imam med det namnet.', true); return;
    }
    const id = newId(name);
    if (await save({ imams: { [id]: { name, color: nextColor() } } }, `${name} tillagd ✓`)) form.reset();
    form.name.focus();
  };
  refreshManage();
}

function refreshManage() {
  if (!manageModal) return;
  const list = $('#adm-list', manageModal.el);
  const ids = Object.keys(data.imams).sort((a, b) => data.imams[a].name.localeCompare(data.imams[b].name, 'sv'));
  const focused = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.id;
  if (!ids.length) { list.innerHTML = '<li class="adm-empty">Inga imamer ännu. Lägg till den första nedan.</li>'; return; }
  list.innerHTML = ids.map(id => {
    const im = data.imams[id], n = nightsFor(id).length;
    return `<li>
      <input type="color" class="adm-color" data-id="${esc(id)}" value="${esc(im.color || '#24645d')}" title="Färg">
      <input class="adm-input adm-name" data-id="${esc(id)}" value="${esc(im.name)}" maxlength="40">
      <span class="adm-count">${n} ${n === 1 ? 'natt' : 'nätter'}</span>
      <button type="button" class="adm-btn danger" data-del="${esc(id)}" aria-label="Ta bort ${esc(im.name)}">✕</button>
    </li>`;
  }).join('');
  if (focused) { const el = list.querySelector(`.adm-name[data-id="${focused}"]`); el && el.focus(); }

  list.querySelectorAll('.adm-name').forEach(inp => {
    const commit = () => {
      const id = inp.dataset.id, name = cleanName(inp.value);
      if (!data.imams[id] || name === data.imams[id].name) return;
      if (!name) { inp.value = data.imams[id].name; return; }
      save({ imams: { [id]: { name, color: data.imams[id].color } } }, 'Namn sparat ✓');
    };
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
  });
  list.querySelectorAll('.adm-color').forEach(inp => {
    inp.addEventListener('change', () => {
      const id = inp.dataset.id;
      save({ imams: { [id]: { name: data.imams[id].name, color: inp.value } } }, 'Färg sparad ✓');
    });
  });
  list.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.del, im = data.imams[id], nights = nightsFor(id);
      const msg = nights.length
        ? `Ta bort ${im.name}?\n\n${im.name} är tilldelad natt ${nights.join(', ')}. De nätterna blir "Meddelas senare".`
        : `Ta bort ${im.name}?`;
      if (!confirm(msg)) return;
      const asg = {};
      nights.forEach(d => { asg[d] = deleteField(); });
      save({ imams: { [id]: deleteField() }, ...(nights.length ? { assignments: asg } : {}) }, `${im.name} borttagen`);
    });
  });
}

// ── Första Tarawih-kvällen (efter månskådning) ──
const MONTHS_SV = ['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'];
const DAYS_SV   = ['söndag','måndag','tisdag','onsdag','torsdag','fredag','lördag'];
function fmtDay(iso, add = 0) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + add));
  return `${DAYS_SV[dt.getUTCDay()]} ${dt.getUTCDate()} ${MONTHS_SV[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

const addDaysIso = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

function openStartDate() {
  if ($('.adm-backdrop')) return;
  const curStart = data.startDate || DEFAULT_START;
  const curEid   = window.EID_DATE || addDaysIso(curStart, 31);
  const m = modal(`
    <h2 class="adm-title">Datum</h2>
    <p class="adm-hint">Ställ in efter månskådningen. Förvalen gäller om inget ändras.</p>
    <label class="adm-field"><span>Första Tarawih (kväll, natt 1)</span>
      <input class="adm-input" type="date" id="adm-date" value="${curStart}" min="2027-01-31" max="2027-02-14" required></label>
    <label class="adm-field"><span>Eid al-Fitr</span>
      <input class="adm-input" type="date" id="adm-eid" value="${curEid}" required></label>
    <div class="adm-preview" id="adm-date-preview"></div>
    <button type="button" class="adm-link" id="adm-date-reset">Återställ förval (natt 1 ${fmtDay(DEFAULT_START)}, Eid ${fmtDay(DEFAULT_START, 31)})</button>
    <p class="adm-err" id="adm-date-err"></p>
    <div class="adm-actions">
      <button type="button" class="adm-btn ghost" id="adm-date-cancel">Avbryt</button>
      <button type="button" class="adm-btn" id="adm-date-save">Spara</button>
    </div>`);
  const inp = $('#adm-date', m.el), eid = $('#adm-eid', m.el), prev = $('#adm-date-preview', m.el), saveBtn = $('#adm-date-save', m.el);
  let lastStart = curStart;
  const render = () => {
    const v = inp.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { prev.textContent = 'Välj första Tarawih-kvällen.'; saveBtn.disabled = true; return; }
    // Flyttas natt 1 följer Eid med (samma antal dagar)
    if (v !== lastStart && /^\d{4}-\d{2}-\d{2}$/.test(eid.value)) {
      const [a, b] = [lastStart, v].map(x => Date.UTC(...x.split('-').map((n, i) => i === 1 ? n - 1 : +n)));
      eid.value = addDaysIso(eid.value, Math.round((b - a) / 864e5));
    }
    lastStart = v;
    eid.min = addDaysIso(v, 30); eid.max = addDaysIso(v, 31);
    if (eid.value < eid.min || eid.value > eid.max) eid.value = eid.max;
    const nights = eid.value === eid.min ? 29 : 30;
    prev.innerHTML = `Natt 1: <b>${fmtDay(v)}</b><br>Sista Tarawih: <b>natt ${nights}, ${fmtDay(v, nights - 1)}</b><br>` +
      `Eid al-Fitr: <b>${fmtDay(eid.value)}</b> · Ramadan ${nights} dagar` +
      (nights === 29 ? '<br><span style="opacity:.75">Natt 30 döljs i schemat.</span>' : '');
    saveBtn.disabled = v === curStart && eid.value === curEid;
  };
  inp.addEventListener('input', render);
  eid.addEventListener('input', render);
  render();
  $('#adm-date-reset', m.el).onclick = () => { lastStart = DEFAULT_START; inp.value = DEFAULT_START; eid.value = addDaysIso(DEFAULT_START, 31); render(); };
  $('#adm-date-cancel', m.el).onclick = m.close;
  saveBtn.onclick = async () => {
    const v = inp.value, e = eid.value;
    if (!confirm(`Spara datum?\n\nFörsta Tarawih: ${fmtDay(v)}\nEid al-Fitr: ${fmtDay(e)}\n\nSidan laddas om för alla besökare med de nya datumen.`)) return;
    saveBtn.disabled = true;
    if (await save_({ startDate: v, eidDate: e }, 'Datum sparade ✓')) m.close();   // onSnapshot laddar om sidan
    else saveBtn.disabled = false;
  };
}

// ── Sidor / Suror / Verser per natt ──
function onEditableClick(e) {
  if (!document.body.classList.contains('adm-on')) return;
  const hit = e.target.closest('.td-sidor, .td-surah, .dcm-pages, .dcm-surahs');
  if (!hit || e.target.closest('.adm-sel, .imam-chip, .play-btn, .fav-btn')) return;
  const host = hit.closest('[data-datum]');
  const row = host && (window.SCHEDULE || []).find(r => r.datum === host.dataset.datum);
  if (!row) return;
  e.preventDefault();
  e.stopPropagation();
  openNightEditor(row);
}

function openNightEditor(row) {
  if ($('.adm-backdrop')) return;
  const def = (window.DEFAULT_NIGHT_TEXTS || [])[row.day - 1] || {};
  const overridden = !!data.nights[row.day];
  const m = modal(`
    <h2 class="adm-title">Natt ${row.day}</h2>
    <p class="adm-hint">${fmtDay(row.datum)}</p>
    <form id="adm-night">
      <label class="adm-field"><span>Sidor</span>
        <input class="adm-input" name="sidor" value="${esc(row.sidor)}" maxlength="40" placeholder="t.ex. 92–101" required></label>
      <label class="adm-field"><span>Suror</span>
        <textarea class="adm-input" name="surahs" maxlength="300" placeholder="t.ex. An-Nisa, Al-Maidah" required>${esc(row.surahs)}</textarea></label>
      <label class="adm-field"><span>Verser</span>
        <input class="adm-input" name="tooltip" value="${esc(row.tooltip)}" maxlength="120" placeholder="t.ex. 4:88 – 4:147"></label>
      ${overridden ? `<button type="button" class="adm-link" id="adm-night-reset">Återställ standard (s. ${esc(def.sidor)} · ${esc(def.surahs)})</button>` : ''}
      <p class="adm-err"></p>
      <div class="adm-actions">
        <button type="button" class="adm-btn ghost" id="adm-night-cancel">Avbryt</button>
        <button type="submit" class="adm-btn">Spara</button>
      </div>
    </form>`);
  const form = $('#adm-night', m.el);
  $('#adm-night-cancel', m.el).onclick = m.close;
  const reset = $('#adm-night-reset', m.el);
  if (reset) reset.onclick = async () => {
    if (await save_({ nights: { [row.day]: deleteField() } }, `Natt ${row.day} återställd ✓`)) m.close();
  };
  form.onsubmit = async e => {
    e.preventDefault();
    const clean = v => String(v || '').replace(/[<>`]/g, '').replace(/\s+/g, ' ').trim();
    const val = { sidor: clean(form.sidor.value).slice(0, 40), surahs: clean(form.surahs.value).slice(0, 300), tooltip: clean(form.tooltip.value).slice(0, 120) };
    if (!val.sidor || !val.surahs) return;
    const same = val.sidor === def.sidor && val.surahs === def.surahs && val.tooltip === def.tooltip;
    const btn = $('button[type=submit]', form); btn.disabled = true;
    const ok = await save_({ nights: { [row.day]: same ? deleteField() : val } }, `Natt ${row.day} sparad ✓`);
    if (ok) m.close(); else btn.disabled = false;
  };
}
