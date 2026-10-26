import * as S from './store.js';
import { EMOJIS, findFood, searchFoods, normalize, guessEmoji } from './foods.js';
import { RECIPES, matchRecipe } from './recipes.js';
import { openScanner, lookupBarcode } from './scanner.js';
import * as Cloud from './cloud.js';

/* ================= Utilidades ================= */
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => String(Math.round((+n || 0) * 100) / 100).replace('.', ',');
const num = v => parseFloat(String(v).replace(',', '.')) || 0;

const META = { fridge: { label: 'Nevera', icon: '🧊' }, freezer: { label: 'Congelador', icon: '❄️' }, pantry: { label: 'Despensa', icon: '🥫' } };
const KINDS = { fridge: ['shelf', 'drawer', 'door'], freezer: ['drawer', 'shelf'], pantry: ['shelf', 'drawer'] };
const UNITS = ['ud', 'paq', 'kg', 'g', 'L', 'ml'];
const STEP = { ud: 1, paq: 1, kg: 0.25, g: 100, L: 0.5, ml: 250 };
const TABS = [['fridge', '🧊', 'Nevera'], ['freezer', '❄️', 'Congelador'], ['pantry', '🥫', 'Despensa'], ['shop', '🛒', 'Compra'], ['recipes', '🍳', 'Recetas']];
const isAppliance = t => t in META;

let tab = localStorage.getItem('freshkito:tab') || 'fridge';
let recipeFilter = 'all';

/* ---------- Fechas y estado de caducidad ---------- */
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const inDays = n => { const d = today(); d.setDate(d.getDate() + n); return iso(d); };
const daysLeft = e => { if (!e) return null; const [y, m, d] = e.split('-').map(Number); return Math.round((new Date(y, m - 1, d) - today()) / 864e5); };
const status = i => { const d = daysLeft(i.expires); return d === null ? 'none' : d < 0 ? 'expired' : d <= 3 ? 'soon' : 'ok'; };
const isUrgent = i => i.qty > 0 && (status(i) === 'soon' || status(i) === 'expired');
const isLow = i => i.qty <= 0 || (i.minQty > 0 && i.qty <= i.minQty);
const RANK = { expired: 0, soon: 1, ok: 2, none: 3 };
const byUrgency = (a, b) => RANK[status(a)] - RANK[status(b)] || (daysLeft(a.expires) ?? 1e4) - (daysLeft(b.expires) ?? 1e4) || a.name.localeCompare(b.name);

function expText(i) {
  const d = daysLeft(i.expires);
  if (d === null) return 'Sin fecha';
  if (d < -1) return `Caducó hace ${-d} días`;
  if (d === -1) return 'Caducó ayer';
  if (d === 0) return 'Caduca hoy';
  if (d === 1) return 'Caduca mañana';
  if (d <= 30) return `Caduca en ${d} días`;
  const [y, m, dd] = i.expires.split('-');
  return `Caduca el ${dd}/${m}/${y.slice(2)}`;
}

/* ---------- Ayudantes de zonas ---------- */
const zoneName = zid => { const f = S.findZone(zid); return f ? `${META[f.appliance.type].icon} ${f.zone.name}` : '—'; };
const zonesOf = type => S.byType(type)?.zones || [];
const itemsOf = type => { const ids = new Set(zonesOf(type).map(z => z.id)); return S.get().items.filter(i => ids.has(i.zoneId)); };

function zoneFor(type = 'fridge', kind) {
  for (const t of [type, 'fridge', 'pantry', 'freezer']) {
    const zs = zonesOf(t);
    const z = zs.find(z => z.kind === kind) || zs[0];
    if (z) return z.id;
  }
  return '';
}
const suggestedZone = food => food ? zoneFor(food.app, food.kind) : zoneFor(isAppliance(tab) ? tab : 'fridge');

/* ================= Tema claro / oscuro ================= */
const THEME_KEY = 'freshkito:theme';
let theme = localStorage.getItem(THEME_KEY) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  $('meta[name=theme-color]').content = theme === 'dark' ? '#0F1518' : '#F6F4EE';
  document.querySelectorAll('[data-theme-btn]').forEach(b => { b.textContent = theme === 'dark' ? '☀️' : '🌙'; b.setAttribute('aria-label', theme === 'dark' ? 'Modo claro' : 'Modo oscuro'); });
  document.querySelectorAll('[data-theme-switch]').forEach(b => b.classList.toggle('on', theme === 'dark'));
}
function toggleTheme() {
  theme = theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.classList.add('theme-anim');
  applyTheme();
  setTimeout(() => document.documentElement.classList.remove('theme-anim'), 400);
}
applyTheme();
document.addEventListener('click', e => { if (e.target.closest('[data-theme-btn],[data-theme-switch]')) toggleTheme(); });

/* ================= Toasts ================= */
function toast(msg, action) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${msg}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) t.querySelector('button').onclick = () => { action.run(); t.remove(); };
  $('#toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, action ? 4500 : 2600);
}

/* ================= Hojas inferiores (bottom sheets) ================= */
let sheet = null;
function showSheet({ render, setup, live = true, cls = '' }) {
  closeSheet(true);
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="backdrop"></div><div class="sheet ${cls}" role="dialog" aria-modal="true"><div class="grabber"><i></i></div><div class="sheet-body"></div></div>`;
  document.body.appendChild(wrap);
  const body = wrap.querySelector('.sheet-body');
  const refresh = () => { const html = render(); if (html !== null) body.innerHTML = html; };
  refresh();
  setup?.(body);
  wrap.querySelector('.backdrop').onclick = () => closeSheet();
  body.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
  enableSwipeDown(wrap.querySelector('.sheet'), wrap.querySelector('.grabber'));
  requestAnimationFrame(() => wrap.classList.add('open'));
  sheet = { wrap, refresh: live ? refresh : null };
  return body;
}
function closeSheet(instant) {
  if (!sheet) return;
  const { wrap } = sheet;
  sheet = null;
  if (instant) return wrap.remove();
  wrap.classList.remove('open');
  setTimeout(() => wrap.remove(), 260);
}
function enableSwipeDown(el, handle) {
  let y0 = null, dy = 0;
  handle.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; el.style.transition = 'none'; }, { passive: true });
  handle.addEventListener('touchmove', e => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); el.style.transform = `translateY(${dy}px)`; }, { passive: true });
  handle.addEventListener('touchend', () => {
    el.style.transition = ''; el.style.transform = '';
    if (dy > 90) closeSheet();
    y0 = null; dy = 0;
  });
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
const sheetHead = (title, eyebrow = '') => `
  <div class="sheet-head">
    <div>${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}<h3>${title}</h3></div>
    <button class="icon-btn" data-close aria-label="Cerrar">✕</button>
  </div>`;

/* ================= Asistente inicial ================= */
const ob = { step: 0, fridge: { shelf: 4, drawer: 3, door: 3 }, freezer: { drawer: 3, shelf: 0 }, pantry: { shelf: 4, drawer: 0 } };
const OB_ROWS = {
  fridge: [['shelf', 'Baldas', '▭'], ['drawer', 'Cajones', '🗄️'], ['door', 'Compartimentos de puerta', '🚪']],
  freezer: [['drawer', 'Cajones', '🗄️'], ['shelf', 'Baldas', '▭']],
  pantry: [['shelf', 'Estantes', '▭'], ['drawer', 'Cestas', '🧺']]
};

function miniPreview(type, c) {
  const block = (kind, n) => Array.from({ length: n }, () => `<i class="mz ${kind}"></i>`).join('');
  const body = block('shelf', c.shelf || 0) + block('drawer', c.drawer || 0);
  return `<div class="mini ${type}"><div class="mini-body">${body || '<em>Vacío</em>'}</div>${type === 'fridge' ? `<div class="mini-door">${block('door', c.door || 0)}</div>` : ''}</div>`;
}

function renderOnboarding() {
  const s = ob.step;
  let content;
  if (s === 0) {
    content = `
      <div class="ob-hero">
        <div class="ob-logo">🥬</div>
        <h1>Freshkito</h1>
        <p>Organiza tu nevera, congelador y despensa <b>balda a balda</b>. Sabrás qué tienes, dónde está y qué caduca antes.</p>
        <ul class="ob-feats">
          <li><span>🧊</span>Tu nevera tal y como es</li>
          <li><span>📷</span>Añade productos escaneando el código</li>
          <li><span>🛒</span>Lista de la compra automática</li>
          <li><span>🍳</span>Recetas con lo que tienes</li>
        </ul>
      </div>`;
  } else {
    const type = ['fridge', 'freezer', 'pantry'][s - 1];
    const c = ob[type];
    content = `
      <p class="eyebrow">Paso ${s} de 3</p>
      <h2>${META[type].icon} ¿Cómo es tu ${META[type].label.toLowerCase()}?</h2>
      <p class="muted">Podrás cambiarlo, renombrarlo y reordenarlo cuando quieras.</p>
      ${miniPreview(type, c)}
      <div class="ob-rows">
        ${OB_ROWS[type].map(([k, label, ic]) => `
          <div class="ob-row">
            <span class="ob-ic">${ic}</span><span class="ob-label">${label}</span>
            <div class="stepper">
              <button data-ob="${type}.${k}" data-d="-1" aria-label="Menos ${label}">−</button>
              <b>${c[k]}</b>
              <button data-ob="${type}.${k}" data-d="1" aria-label="Más ${label}">+</button>
            </div>
          </div>`).join('')}
      </div>`;
  }
  app.innerHTML = `
    <div class="onboard">
      <div class="ob-top">
        <div class="dots">${[0, 1, 2, 3].map(i => `<i class="${i === s ? 'on' : i < s ? 'done' : ''}"></i>`).join('')}</div>
        <button class="icon-btn" data-theme-btn></button>
      </div>
      <div class="ob-card fade-in">${content}</div>
      <div class="ob-actions">
        ${s > 0 ? '<button class="btn ghost" id="obBack">Atrás</button>' : '<span></span>'}
        <button class="btn primary" id="obNext">${s === 0 ? 'Empezar' : s === 3 ? '¡Listo! ✨' : 'Siguiente'}</button>
      </div>
    </div>`;
  applyTheme();
  app.querySelectorAll('[data-ob]').forEach(b => b.onclick = () => {
    const [t, k] = b.dataset.ob.split('.');
    ob[t][k] = Math.min(12, Math.max(0, ob[t][k] + +b.dataset.d));
    renderOnboarding();
  });
  $('#obBack')?.addEventListener('click', () => { ob.step--; renderOnboarding(); });
  $('#obNext').onclick = () => {
    if (ob.step < 3) { ob.step++; return renderOnboarding(); }
    tab = 'fridge';
    S.init(ob);
    toast('¡Tu cocina está lista! Pulsa <b>+</b> para añadir alimentos');
  };
}

/* ================= Estructura principal ================= */
function renderShell() {
  app.innerHTML = `
    <header class="topbar">
      <div class="brand"><span class="logo">🥬</span><span class="brand-name">Freshkito</span><span id="syncDot" class="sync" hidden></span></div>
      <div class="top-actions">
        <button class="icon-btn" id="alertBtn" aria-label="Avisos">🔔<span class="badge" id="alertBadge" hidden></span></button>
        <button class="icon-btn" data-theme-btn></button>
        <button class="icon-btn" id="settingsBtn" aria-label="Ajustes">⚙️</button>
      </div>
    </header>
    <main id="view" class="view"></main>
    <button id="fab" class="fab" aria-label="Añadir alimento"><span>+</span></button>
    <nav class="tabbar" aria-label="Secciones">
      ${TABS.map(([id, ic, label]) => `<button class="tab" data-tab="${id}" id="tab-${id}"><span class="tab-ic">${ic}</span><span>${label}</span><i class="tab-badge" hidden></i></button>`).join('')}
    </nav>`;
  applyTheme();
  app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => setTab(b.dataset.tab));
  $('#alertBtn').onclick = openAlerts;
  $('#settingsBtn').onclick = openSettings;
  $('#fab').onclick = () => {
    if (tab === 'shop') return $('#shopIn')?.focus();
    openItemForm({ zoneId: isAppliance(tab) ? zoneFor(tab) : '' });
  };
  $('#view').addEventListener('click', onViewClick);
  $('#view').addEventListener('submit', onViewSubmit);
  setSyncStatus(syncStatus);
}

function setTab(t) {
  tab = t;
  localStorage.setItem('freshkito:tab', t);
  renderView(true);
  window.scrollTo({ top: 0 });
}

function render() {
  if (!S.isReady() || !$('#view')) return;
  renderView();
  const st = S.get();
  const alerts = st.items.filter(i => isUrgent(i) || isLow(i)).length;
  const badge = $('#alertBadge');
  badge.hidden = !alerts; badge.textContent = alerts;
  const pending = st.shopping.filter(s => !s.checked).length;
  const tb = $('#tab-shop .tab-badge');
  tb.hidden = !pending; tb.textContent = pending;
  sheet?.refresh?.();
}

function renderView(animate) {
  const view = $('#view');
  app.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('#fab').classList.toggle('hidden', tab === 'recipes');
  view.innerHTML = isAppliance(tab) ? viewAppliance(tab) : tab === 'shop' ? viewShop() : viewRecipes();
  if (animate) { view.classList.remove('fade-in'); void view.offsetWidth; view.classList.add('fade-in'); }
}

/* ================= Vista de nevera / congelador / despensa ================= */
function zoneCard(z, items) {
  const sorted = [...items].sort(byUrgency);
  const urgent = items.filter(isUrgent).length;
  const preview = sorted.slice(0, 9).map(i => `<span class="em ${i.qty <= 0 ? 'out' : status(i)}" title="${esc(i.name)}">${i.emoji}</span>`).join('');
  return `
    <button class="zone ${z.kind}" data-zone="${z.id}" aria-label="${esc(z.name)}: ${items.length} alimentos">
      <span class="zone-label"><span>${esc(z.name)}</span>
        ${urgent ? `<span class="pill warn">⏰ ${urgent}</span>` : ''}${items.length ? `<span class="count">${items.length}</span>` : ''}
      </span>
      <span class="zone-items">${preview || '<span class="empty">Vacío · toca para añadir</span>'}${sorted.length > 9 ? `<span class="more">+${sorted.length - 9}</span>` : ''}</span>
    </button>`;
}

function viewAppliance(type) {
  const ap = S.byType(type);
  const items = itemsOf(type);
  const urgent = items.filter(isUrgent).length;
  const inZone = z => items.filter(i => i.zoneId === z.id);
  const body = ap.zones.filter(z => z.kind !== 'door');
  const door = ap.zones.filter(z => z.kind === 'door');
  const empty = !ap.zones.length;
  return `
    <section class="view-head">
      <div>
        <h1>${META[type].icon} ${esc(ap.name)}</h1>
        <p class="muted">${items.length ? `${items.length} alimento${items.length > 1 ? 's' : ''}` : 'Todavía vacía'}${urgent ? ` · <span class="warn-txt">${urgent} por revisar</span>` : ''}</p>
      </div>
      <button class="chip-btn" data-act="edit-layout">✏️ Distribución</button>
    </section>
    ${empty ? `<div class="empty-state"><p>No hay zonas configuradas.</p><button class="btn primary" data-act="edit-layout">Configurar</button></div>` : `
    <div class="unit ${type} ${door.length ? 'has-door' : ''}">
      <div class="unit-body">${body.map(z => zoneCard(z, inZone(z))).join('')}</div>
      ${door.length ? `<div class="unit-door">${door.map(z => zoneCard(z, inZone(z))).join('')}</div>` : ''}
    </div>`}
    ${items.length === 0 && !empty ? `<p class="hint">💡 Toca una ${type === 'pantry' ? 'estantería' : 'balda o cajón'} o el botón <b>+</b> para guardar tu primer alimento.</p>` : ''}`;
}

/* ---------- Hoja de una zona ---------- */
function itemRow(i, showZone = false) {
  const st = i.qty <= 0 ? 'out' : status(i);
  const sub = i.qty <= 0 ? 'Agotado' : expText(i);
  return `
    <li class="item-row ${st}" data-item="${i.id}">
      <span class="item-emoji">${i.emoji}</span>
      <span class="item-main"><b>${esc(i.name)}</b><small class="exp">${sub}${showZone ? ` · ${esc(zoneName(i.zoneId))}` : ''}</small></span>
      <span class="qty">
        <button data-q="-1" aria-label="Quitar uno">−</button>
        <span class="qty-val">${fmt(i.qty)}<small>${i.unit !== 'ud' ? ' ' + esc(i.unit) : ''}</small></span>
        <button data-q="1" aria-label="Añadir uno">+</button>
      </span>
    </li>`;
}

function handleItemClick(e, back) {
  const row = e.target.closest('[data-item]');
  if (!row) return false;
  const item = S.get().items.find(i => i.id === row.dataset.item);
  if (!item) return true;
  const q = e.target.closest('[data-q]');
  if (q) {
    S.changeQty(item.id, +q.dataset.q * (STEP[item.unit] || 1));
    if (item.qty <= 0 && +q.dataset.q < 0) {
      toast(`${item.emoji} ${esc(item.name)} agotado`, { label: 'Añadir a la compra', run: () => { S.addShop({ name: item.name, emoji: item.emoji }); toast('Añadido a la compra 🛒'); } });
    }
  } else openItemForm({ item, back });
  return true;
}

function openZone(zid) {
  showSheet({
    render: () => {
      const f = S.findZone(zid);
      if (!f) { setTimeout(closeSheet); return ''; }
      const items = S.get().items.filter(i => i.zoneId === zid).sort(byUrgency);
      return `
        ${sheetHead(esc(f.zone.name), `${META[f.appliance.type].icon} ${esc(f.appliance.name)}`)}
        ${items.length ? `<ul class="item-list">${items.map(i => itemRow(i)).join('')}</ul>` : `<div class="empty-state small"><span class="big-emoji">🫙</span><p>Aquí no hay nada todavía.</p></div>`}
        <div class="sheet-actions">
          <button class="btn ghost" data-act="scan-here">📷 Escanear</button>
          <button class="btn primary" data-act="add-here">+ Añadir aquí</button>
        </div>`;
    },
    setup: body => body.addEventListener('click', e => {
      const back = () => openZone(zid);
      if (handleItemClick(e, back)) return;
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'add-here') openItemForm({ zoneId: zid, back });
      if (act === 'scan-here') scanAndAdd({ zoneId: zid, back });
    })
  });
}

/* ================= Formulario de alimento ================= */
function openItemForm({ item, zoneId, prefill, back } = {}) {
  const f = item ? { ...item } : { name: '', emoji: '🛒', category: '', qty: 1, unit: 'ud', zoneId: zoneId || suggestedZone(null), expires: '', minQty: 0, barcode: '', ...prefill };
  const touched = { zone: !!item || !!zoneId, emoji: !!item || !!prefill?.emoji, exp: !!item || !!prefill?.expires };
  let food = findFood(f.name);
  let brand = prefill?.brand || '';

  const body = showSheet({
    live: false,
    cls: 'tall',
    render: () => `
      ${sheetHead(item ? 'Editar alimento' : 'Nuevo alimento')}
      <div class="f-name">
        <button type="button" class="emoji-btn" id="fEmojiBtn" aria-label="Cambiar icono">${f.emoji}</button>
        <div class="name-wrap">
          <input id="fName" placeholder="¿Qué guardas? Ej: Leche" value="${esc(f.name)}" autocomplete="off" enterkeyhint="done">
          <div id="fSugg" class="sugg"></div>
        </div>
        <button type="button" class="icon-btn scan-btn" id="fScan" aria-label="Escanear código de barras">📷</button>
      </div>
      <p id="fBrand" class="brand-line"></p>
      <div id="fEmojiGrid" class="emoji-grid" hidden>${EMOJIS.map(e => `<button type="button" data-emoji="${e}">${e}</button>`).join('')}</div>
      <div class="f-group"><label>Cantidad</label><div id="fQty"></div></div>
      <div class="f-group"><label>¿Dónde lo guardas?</label><div id="fLoc"></div></div>
      <div class="f-group"><label>Caducidad</label><div id="fExp"></div></div>
      <div class="f-group"><label>Avisarme cuando queden</label><div id="fMin"></div></div>
      <div class="sheet-actions">
        ${item ? '<button class="btn danger-ghost" id="fDelete">🗑 Borrar</button>' : ''}
        <button class="btn primary grow" id="fSave">Guardar</button>
      </div>`
  });

  const paint = {
    qty() {
      $('#fQty', body).innerHTML = `
        <div class="qty-row">
          <div class="stepper big"><button data-fq="-1" aria-label="Menos">−</button><input id="fQtyIn" inputmode="decimal" value="${fmt(f.qty)}" aria-label="Cantidad"><button data-fq="1" aria-label="Más">+</button></div>
          <div class="chips">${UNITS.map(u => `<button class="chip ${f.unit === u ? 'on' : ''}" data-unit="${u}">${u}</button>`).join('')}</div>
        </div>`;
    },
    loc() {
      const cur = S.findZone(f.zoneId);
      const curType = cur?.appliance.type || 'fridge';
      $('#fLoc', body).innerHTML = `
        <div class="seg">${Object.keys(META).map(t => `<button class="${t === curType ? 'on' : ''}" data-ap="${t}">${META[t].icon} ${META[t].label}</button>`).join('')}</div>
        <div class="chips wrap">${zonesOf(curType).map(z => `<button class="chip ${z.id === f.zoneId ? 'on' : ''}" data-zid="${z.id}">${esc(z.name)}</button>`).join('') || '<span class="muted small">Sin zonas</span>'}</div>
        ${food && !touched.zone ? '' : food ? `<p class="muted small">💡 Suele ir en: ${esc(zoneName(suggestedZone(food)))}</p>` : ''}`;
    },
    exp() {
      const opts = [['Sin fecha', ''], ['3 días', inDays(3)], ['1 semana', inDays(7)], ['2 semanas', inDays(14)], ['1 mes', inDays(30)]];
      if (food?.days && food.days < 400 && ![3, 7, 14, 30].includes(food.days)) opts.splice(1, 0, [`✨ ${food.days} días`, inDays(food.days)]);
      const known = opts.some(o => o[1] === f.expires);
      $('#fExp', body).innerHTML = `
        <div class="chips wrap">${opts.map(([l, v]) => `<button class="chip ${f.expires === v ? 'on' : ''}" data-exp="${v}">${l}</button>`).join('')}
          <label class="chip date-chip ${f.expires && !known ? 'on' : ''}">📅 <input type="date" id="fDate" value="${f.expires}"></label>
        </div>
        ${f.expires ? `<p class="exp-preview ${status(f)}">${expText(f)}</p>` : ''}`;
    },
    min() {
      $('#fMin', body).innerHTML = `
        <div class="qty-row">
          <div class="stepper"><button data-fm="-1" aria-label="Menos">−</button><b>${fmt(f.minQty)}</b><button data-fm="1" aria-label="Más">+</button></div>
          <span class="muted small">${f.minQty > 0 ? `Te avisaré y lo sugeriré en la compra` : 'Sin aviso (solo cuando se agote)'}</span>
        </div>`;
    },
    brand() {
      const who = item?.addedBy && S.get().household?.memberInfo?.[item.addedBy]?.name;
      const parts = [brand && `🏷️ ${brand}${f.barcode ? ` · ${f.barcode}` : ''}`, who && `👤 Añadido por ${who}`].filter(Boolean);
      $('#fBrand', body).textContent = parts.join('   ');
    },
    emoji() { $('#fEmojiBtn', body).textContent = f.emoji; },
    all() { this.qty(); this.loc(); this.exp(); this.min(); this.brand(); this.emoji(); }
  };
  paint.all();

  const nameIn = $('#fName', body);
  const sugg = $('#fSugg', body);
  const applyFood = (fd, fromPick) => {
    food = fd;
    if (!fd) return;
    if (fromPick) f.name = fd.name;
    if (!touched.emoji) f.emoji = fd.emoji;
    f.category = fd.cat;
    if (!touched.zone) f.zoneId = suggestedZone(fd);
    if (!touched.exp && fd.days && fd.days < 400) f.expires = inDays(fd.days);
    paint.all();
  };
  const showSugg = () => {
    const list = searchFoods(nameIn.value).filter(x => x.key !== normalize(nameIn.value));
    sugg.innerHTML = list.map(x => `<button type="button" data-food="${esc(x.name)}"><span>${x.emoji}</span>${esc(x.name)}<small>${esc(x.cat)}</small></button>`).join('');
    sugg.classList.toggle('open', list.length > 0);
  };
  nameIn.addEventListener('input', () => {
    f.name = nameIn.value;
    applyFood(findFood(f.name), false);
    showSugg();
  });
  nameIn.addEventListener('blur', () => setTimeout(() => sugg.classList.remove('open'), 150));
  nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nameIn.blur(); } });
  if (!item && !f.name) setTimeout(() => nameIn.focus(), 300);

  body.addEventListener('input', e => {
    if (e.target.id === 'fQtyIn') f.qty = Math.max(0, num(e.target.value));
    if (e.target.id === 'fDate') { f.expires = e.target.value; touched.exp = true; paint.exp(); }
  });

  body.addEventListener('click', e => {
    const t = e.target.closest('button,[data-food]');
    if (!t) return;
    const d = t.dataset;
    if (d.food) { nameIn.value = d.food; applyFood(searchFoods(d.food, 1)[0], true); sugg.classList.remove('open'); }
    else if (t.id === 'fEmojiBtn') { const g = $('#fEmojiGrid', body); g.hidden = !g.hidden; }
    else if (d.emoji) { f.emoji = d.emoji; touched.emoji = true; paint.emoji(); $('#fEmojiGrid', body).hidden = true; }
    else if (d.fq) { f.qty = Math.max(0, Math.round((f.qty + +d.fq * (STEP[f.unit] || 1)) * 100) / 100); paint.qty(); }
    else if (d.unit) {
      const was = f.unit; f.unit = d.unit;
      if (STEP[was] !== STEP[f.unit]) f.qty = STEP[f.unit] >= 1 ? Math.max(1, Math.round(f.qty)) : f.qty;
      paint.qty();
    }
    else if (d.ap) { f.zoneId = zoneFor(d.ap, food?.app === d.ap ? food.kind : undefined); touched.zone = true; paint.loc(); }
    else if (d.zid) { f.zoneId = d.zid; touched.zone = true; paint.loc(); }
    else if ('exp' in d) { f.expires = d.exp; touched.exp = true; paint.exp(); }
    else if (d.fm) { f.minQty = Math.max(0, f.minQty + +d.fm * (STEP[f.unit] || 1)); paint.min(); }
    else if (t.id === 'fScan') {
      openScanner(async code => {
        const info = await resolveBarcode(code);
        f.barcode = code;
        if (!info) { brand = ''; paint.brand(); toast('No encontré ese producto. Escribe el nombre ✍️'); nameIn.focus(); return; }
        f.name = info.name; nameIn.value = info.name; brand = info.brand || '';
        f.emoji = info.emoji; touched.emoji = true;
        applyFood(findFood(info.name), false);
        paint.all();
        toast(`${info.emoji} ${esc(info.name)} encontrado`);
      });
    }
    else if (t.id === 'fSave') save();
    else if (t.id === 'fDelete') {
      const removed = S.removeItem(item.id);
      done();
      toast(`🗑 ${esc(removed.name)} borrado`, { label: 'Deshacer', run: () => S.restoreItem(removed) });
    }
  });

  function save() {
    f.name = nameIn.value.trim();
    if (!f.name) { nameIn.classList.add('shake'); nameIn.focus(); setTimeout(() => nameIn.classList.remove('shake'), 500); return; }
    if (!f.zoneId) return toast('Elige dónde lo guardas');
    if (f.barcode) S.rememberBarcode(f.barcode, { name: f.name, emoji: f.emoji, brand });
    if (item) S.updateItem(item.id, f); else S.addItem(f);
    done();
    toast(`${f.emoji} ${esc(f.name)} → ${esc(zoneName(f.zoneId))}`);
  }
  function done() { if (back) back(); else closeSheet(); }
}

/* ---------- Códigos de barras ---------- */
async function resolveBarcode(code) {
  const known = S.getBarcode(code);
  if (known) return known;
  toast('🔎 Buscando producto…');
  try {
    const p = await lookupBarcode(code);
    if (!p) return null;
    return { name: p.name, brand: p.brand, emoji: guessEmoji(p.name, p.cats) };
  } catch {
    toast('Sin conexión para buscar el producto');
    return null;
  }
}

function scanAndAdd({ zoneId, back } = {}) {
  openScanner(async code => {
    const info = await resolveBarcode(code);
    const fd = info && findFood(info.name);
    openItemForm({
      zoneId: zoneId || (fd ? suggestedZone(fd) : undefined),
      back,
      prefill: info ? { name: info.name, emoji: info.emoji, brand: info.brand, barcode: code, expires: fd?.days && fd.days < 400 ? inDays(fd.days) : '' } : { barcode: code }
    });
    if (!info) toast('No encontré ese producto. Escribe el nombre ✍️');
  });
}

/* ================= Avisos ================= */
function openAlerts() {
  showSheet({
    cls: 'tall',
    render: () => {
      const items = S.get().items;
      const expired = items.filter(i => i.qty > 0 && status(i) === 'expired').sort(byUrgency);
      const soon = items.filter(i => i.qty > 0 && status(i) === 'soon').sort(byUrgency);
      const low = items.filter(isLow);
      const sec = (title, list, cls) => list.length ? `<h4 class="sec-title ${cls}">${title} <span>${list.length}</span></h4><ul class="item-list">${list.map(i => itemRow(i, true)).join('')}</ul>` : '';
      const any = expired.length + soon.length + low.length;
      return `
        ${sheetHead('Avisos')}
        ${any ? '' : '<div class="empty-state small"><span class="big-emoji">🎉</span><p>Todo en orden. Nada caduca pronto.</p></div>'}
        ${sec('🔴 Caducado', expired, 'danger')}
        ${sec('🟡 Caduca pronto', soon, 'warn')}
        ${sec('📉 Se acaba', low, 'muted')}
        ${low.length ? `<div class="sheet-actions"><button class="btn primary grow" data-act="low-to-shop">🛒 Añadir ${low.length} a la compra</button></div>` : ''}`;
    },
    setup: body => body.addEventListener('click', e => {
      if (handleItemClick(e, openAlerts)) return;
      if (e.target.closest('[data-act="low-to-shop"]')) {
        const n = addLowToShop();
        toast(n ? `🛒 ${n} añadido${n > 1 ? 's' : ''} a la compra` : 'Ya estaban en la lista');
      }
    })
  });
}

function addLowToShop() {
  const st = S.get();
  const inList = new Set(st.shopping.filter(s => !s.checked).map(s => normalize(s.name)));
  const low = st.items.filter(isLow).filter(i => !inList.has(normalize(i.name)));
  [...low].reverse().forEach(i => S.addShop({ name: i.name, emoji: i.emoji, note: i.qty <= 0 ? 'Agotado' : 'Queda poco' }));
  return low.length;
}

/* ================= Lista de la compra ================= */
function viewShop() {
  const st = S.get();
  const pending = st.shopping.filter(s => !s.checked);
  const checked = st.shopping.filter(s => s.checked);
  const inList = new Set(pending.map(s => normalize(s.name)));
  const lowCount = st.items.filter(isLow).filter(i => !inList.has(normalize(i.name))).length;
  const row = s => `
    <li class="shop-row ${s.checked ? 'checked' : ''}" data-shop="${s.id}">
      <span class="check" aria-hidden="true"></span>
      <span class="item-emoji">${s.emoji}</span>
      <span class="item-main"><b>${esc(s.name)}</b>${s.note ? `<small>${esc(s.note)}</small>` : ''}</span>
      <button class="icon-btn small" data-del="${s.id}" aria-label="Quitar">✕</button>
    </li>`;
  return `
    <section class="view-head">
      <div><h1>🛒 Lista de la compra</h1><p class="muted">${pending.length ? `${pending.length} pendiente${pending.length > 1 ? 's' : ''}` : 'Nada pendiente'}</p></div>
    </section>
    <form class="shop-add" id="shopForm" autocomplete="off">
      <input id="shopIn" placeholder="Añadir… (ej: pan, leche)" aria-label="Añadir a la compra" enterkeyhint="done">
      <button type="button" class="icon-btn" data-act="shop-scan" aria-label="Escanear">📷</button>
      <button class="btn primary" type="submit">Añadir</button>
    </form>
    ${lowCount ? `<button class="suggest-card" data-act="suggest"><span>✨</span><span><b>Sugerir lo que falta</b><small>${lowCount} alimento${lowCount > 1 ? 's' : ''} agotado${lowCount > 1 ? 's' : ''} o por acabarse</small></span><span class="arrow">›</span></button>` : ''}
    ${!st.shopping.length ? `<div class="empty-state"><span class="big-emoji">🧺</span><p>Tu lista está vacía.<br><span class="muted">Al marcar lo que compras, podrás guardarlo en casa con un toque.</span></p></div>` : ''}
    <ul class="shop-list">${pending.map(row).join('')}</ul>
    ${checked.length ? `
      <h4 class="sec-title muted">En el carro <span>${checked.length}</span></h4>
      <ul class="shop-list">${checked.map(row).join('')}</ul>
      <div class="shop-footer">
        <button class="btn ghost" data-act="clear-checked">Quitar marcados</button>
        <button class="btn primary grow" data-act="store-checked">📥 Guardar ${checked.length} en casa</button>
      </div>` : ''}`;
}

function storeChecked() {
  const st = S.get();
  const checked = st.shopping.filter(s => s.checked);
  checked.forEach(s => {
    const existing = st.items.find(i => normalize(i.name) === normalize(s.name));
    const fd = findFood(s.name);
    if (existing) {
      S.updateItem(existing.id, {
        qty: Math.round((existing.qty + (STEP[existing.unit] >= 1 ? 1 : STEP[existing.unit] * 2)) * 100) / 100,
        expires: fd?.days && fd.days < 400 ? inDays(fd.days) : existing.expires
      });
    } else {
      S.addItem({ name: s.name, emoji: s.emoji, category: fd?.cat || '', zoneId: suggestedZone(fd), expires: fd?.days && fd.days < 400 ? inDays(fd.days) : '' });
    }
  });
  S.removeShops(checked.map(s => s.id));
  toast(`📥 ${checked.length} alimento${checked.length > 1 ? 's' : ''} guardado${checked.length > 1 ? 's' : ''} en casa`);
}

/* ================= Recetas ================= */
function scoredRecipes() {
  const inv = S.get().items.filter(i => i.qty > 0).sort(byUrgency);
  return RECIPES.map(r => matchRecipe(r, inv, isUrgent))
    .sort((a, b) => (b.ready - a.ready) || (b.urgent.length - a.urgent.length) || (b.pct - a.pct));
}

function viewRecipes() {
  const all = scoredRecipes();
  const list = all.filter(m => recipeFilter === 'ready' ? m.ready : recipeFilter === 'urgent' ? m.urgent.length : true);
  const readyN = all.filter(m => m.ready).length;
  const urgentN = all.filter(m => m.urgent.length).length;
  const f = (id, label) => `<button class="chip ${recipeFilter === id ? 'on' : ''}" data-rf="${id}">${label}</button>`;
  return `
    <section class="view-head">
      <div><h1>🍳 Recetas</h1><p class="muted">${readyN ? `Puedes cocinar ${readyN} ya mismo` : 'Según lo que tienes en casa'}</p></div>
    </section>
    <div class="chips scroll">${f('all', 'Todas')}${f('ready', `✅ Puedo hacer (${readyN})`)}${f('urgent', `⏰ Aprovechar (${urgentN})`)}</div>
    <div class="recipe-grid">
      ${list.map(m => `
        <button class="recipe-card ${m.ready ? 'ready' : ''}" data-recipe="${m.r.id}">
          <span class="r-emoji">${m.r.emoji}</span>
          <span class="r-body">
            <b>${esc(m.r.name)}</b>
            <small>⏱ ${m.r.time} min · ${m.haveReq}/${m.totalReq} básicos</small>
            <span class="bar"><i style="width:${Math.round(m.pct * 100)}%"></i></span>
            ${m.urgent.length ? `<span class="pill warn">⏰ Usa: ${esc(m.urgent.map(i => i.name).slice(0, 2).join(', '))}</span>` : m.ready ? '<span class="pill ok">✅ Lo tienes todo</span>' : ''}
          </span>
        </button>`).join('') || '<div class="empty-state small"><p>No hay recetas con este filtro.</p></div>'}
    </div>`;
}

function openRecipe(id) {
  showSheet({
    cls: 'tall',
    render: () => {
      const inv = S.get().items.filter(i => i.qty > 0).sort(byUrgency);
      const m = matchRecipe(RECIPES.find(r => r.id === id), inv, isUrgent);
      const haveMap = new Map(m.have.map(h => [h.ing, h.item]));
      const missingReq = m.missing.filter(i => !i.opt);
      return `
        ${sheetHead(`${m.r.emoji} ${esc(m.r.name)}`, `⏱ ${m.r.time} min`)}
        <h4 class="sec-title">Ingredientes</h4>
        <ul class="ing-list">
          ${m.r.ings.map(ing => {
            const it = haveMap.get(ing);
            return `<li class="${it ? 'have' : 'miss'}"><span class="ing-dot">${it ? '✓' : ''}</span>
              <span><b>${esc(ing.label)}</b>${ing.opt ? ' <small class="muted">(opcional)</small>' : ''}
              ${it ? `<small class="${isUrgent(it) ? 'warn-txt' : 'muted'}">${it.emoji} ${esc(it.name)} · ${esc(zoneName(it.zoneId))}${isUrgent(it) ? ' · ' + expText(it) : ''}</small>` : '<small class="muted">No lo tienes</small>'}</span></li>`;
          }).join('')}
          <li class="basic"><span class="ing-dot">🧂</span><span><small class="muted">Además: aceite, sal y agua</small></span></li>
        </ul>
        <h4 class="sec-title">Preparación</h4>
        <ol class="steps">${m.r.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        <div class="sheet-actions">
          <a class="btn ghost" target="_blank" rel="noopener" href="https://www.google.com/search?q=${encodeURIComponent('receta ' + m.r.name)}">🔎 Ver más</a>
          ${m.missing.length ? `<button class="btn primary grow" data-act="missing-to-shop">🛒 Añadir ${missingReq.length || m.missing.length} que faltan</button>` : '<span class="pill ok big">✅ ¡Tienes todo!</span>'}
        </div>`;
    },
    setup: body => body.addEventListener('click', e => {
      if (!e.target.closest('[data-act="missing-to-shop"]')) return;
      const m = matchRecipe(RECIPES.find(r => r.id === id), S.get().items.filter(i => i.qty > 0), isUrgent);
      const req = m.missing.filter(i => !i.opt);
      const toAdd = req.length ? req : m.missing;
      toAdd.forEach(ing => S.addShop({ name: ing.label, emoji: findFood(ing.label)?.emoji || '🛒', note: `Para: ${m.r.name}` }));
      toast(`🛒 ${toAdd.length} ingrediente${toAdd.length > 1 ? 's' : ''} añadido${toAdd.length > 1 ? 's' : ''}`);
    })
  });
}

/* ================= Eventos de la vista principal ================= */
function onViewClick(e) {
  const t = e.target;
  const zone = t.closest('[data-zone]');
  if (zone) return openZone(zone.dataset.zone);
  const rec = t.closest('[data-recipe]');
  if (rec) return openRecipe(rec.dataset.recipe);
  const rf = t.closest('[data-rf]');
  if (rf) { recipeFilter = rf.dataset.rf; return renderView(); }
  const del = t.closest('[data-del]');
  if (del) return S.removeShops([del.dataset.del]);
  const shop = t.closest('[data-shop]');
  if (shop) return S.toggleShop(shop.dataset.shop);
  const act = t.closest('[data-act]')?.dataset.act;
  if (act === 'edit-layout') openSettings(tab);
  if (act === 'suggest') { const n = addLowToShop(); toast(`✨ ${n} añadido${n > 1 ? 's' : ''}`); }
  if (act === 'store-checked') storeChecked();
  if (act === 'clear-checked') S.removeShops(S.get().shopping.filter(s => s.checked).map(s => s.id));
  if (act === 'shop-scan') openScanner(async code => {
    const info = await resolveBarcode(code);
    if (!info) return toast('No encontré ese producto');
    S.addShop({ name: info.name, emoji: info.emoji, note: info.brand });
    toast(`🛒 ${info.emoji} ${esc(info.name)} añadido`);
  });
}

function onViewSubmit(e) {
  if (e.target.id !== 'shopForm') return;
  e.preventDefault();
  const input = $('#shopIn');
  const name = input.value.trim();
  if (!name) return;
  const fd = findFood(name);
  S.addShop({ name: name[0].toUpperCase() + name.slice(1), emoji: fd?.emoji || '🛒' });
  $('#shopIn').focus();
}

/* ================= Ajustes / distribución ================= */
function openSettings(focusType) {
  showSheet({
    cls: 'tall',
    render: () => {
      const st = S.get();
      const types = focusType && isAppliance(focusType) ? [focusType, ...Object.keys(META).filter(t => t !== focusType)] : Object.keys(META);
      return `
        ${sheetHead('Ajustes')}
        ${accountSection()}
        <div class="set-row"><span>🌙 Modo oscuro</span><button class="switch" data-theme-switch aria-label="Modo oscuro"><i></i></button></div>
        <h4 class="sec-title">Distribución</h4>
        ${types.map(type => {
          const ap = S.byType(type);
          const count = z => st.items.filter(i => i.zoneId === z.id).length;
          return `
            <div class="set-card">
              <h4>${META[type].icon} ${esc(ap.name)}</h4>
              <ul class="zone-edit">
                ${ap.zones.map((z, idx) => `
                  <li>
                    <span class="z-kind ${z.kind}"></span>
                    <input value="${esc(z.name)}" data-rename="${z.id}" aria-label="Nombre de la zona">
                    <small class="muted">${count(z) || ''}</small>
                    <button class="icon-btn small" data-up="${z.id}" ${idx === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
                    <button class="icon-btn small" data-down="${z.id}" ${idx === ap.zones.length - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button>
                    <button class="icon-btn small danger" data-delz="${z.id}" aria-label="Borrar zona">🗑</button>
                  </li>`).join('')}
              </ul>
              <div class="chips">${KINDS[type].map(k => `<button class="chip add" data-addz="${type}.${k}">+ ${S.kindLabel(type, k)}</button>`).join('')}</div>
            </div>`;
        }).join('')}
        <h4 class="sec-title">Tus datos</h4>
        <p class="muted small">${S.isRemote() ? 'Se guardan en la nube y se sincronizan con tu hogar.' : 'Se guardan solo en este móvil. Haz una copia para no perderlos.'}</p>
        <div class="chips wrap">
          <button class="chip" data-act="export">⬇️ Exportar copia</button>
          <label class="chip">⬆️ Importar<input type="file" accept="application/json" id="importFile" hidden></label>
          ${S.isRemote() ? '' : '<button class="chip danger" data-act="reset">♻️ Empezar de cero</button>'}
        </div>
        <p class="credits muted small">Freshkito · Datos de productos: Open Food Facts</p>`;
    },
    setup: body => {
      applyTheme();
      body.addEventListener('change', e => {
        if (e.target.dataset.rename) S.renameZone(e.target.dataset.rename, e.target.value);
        if (e.target.id === 'hhNameIn') S.renameHousehold(e.target.value);
        if (e.target.id === 'importFile' && e.target.files[0]) {
          e.target.files[0].text().then(txt => { S.importJSON(txt); toast('Copia importada ✅'); }).catch(() => toast('Ese archivo no es válido'));
        }
      });
      body.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.rename) e.target.blur(); });
      body.addEventListener('click', e => {
        const d = e.target.closest('button')?.dataset || {};
        if (d.act) handleAccountAction(d.act);
        if (d.up) S.moveZone(d.up, -1);
        if (d.down) S.moveZone(d.down, 1);
        if (d.addz) { const [t, k] = d.addz.split('.'); S.addZone(t, k); }
        if (d.delz) {
          const n = S.get().items.filter(i => i.zoneId === d.delz).length;
          const f = S.findZone(d.delz);
          if (n && !confirm(`"${f.zone.name}" tiene ${n} alimento${n > 1 ? 's' : ''}. Se moverán a otra zona del mismo sitio. ¿Borrar?`)) return;
          S.removeZone(d.delz);
        }
        if (d.act === 'export') {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([S.exportJSON()], { type: 'application/json' }));
          a.download = `freshkito-${iso(new Date())}.json`;
          a.click();
        }
        if (d.act === 'reset' && confirm('¿Borrar todos los datos y volver a configurar?')) { closeSheet(true); S.reset(); }
      });
    }
  });
  applyTheme();
}

/* ================= Cuenta, hogar y nube ================= */
const MODE_KEY = 'freshkito:mode';
const INVITE_KEY = 'freshkito:invite';
const HID_KEY = 'freshkito:hid';
let mode = localStorage.getItem(MODE_KEY); // 'local' | 'cloud' | null
let syncStatus = '';
const setMode = m => { mode = m; m ? localStorage.setItem(MODE_KEY, m) : localStorage.removeItem(MODE_KEY); };

// Enlaces de invitación: ?invite=CODIGO
const urlInvite = new URLSearchParams(location.search).get('invite');
if (urlInvite) {
  sessionStorage.setItem(INVITE_KEY, urlInvite.toUpperCase());
  history.replaceState(null, '', location.pathname);
}
const inviteLink = code => `${location.origin}${location.pathname}?invite=${code}`;

function setSyncStatus(s) {
  syncStatus = s;
  const el = $('#syncDot');
  if (!el) return;
  const map = { synced: ['☁️', 'Sincronizado'], pending: ['⏳', 'Sincronizando…'], offline: ['📴', 'Sin conexión: se sincronizará luego'] };
  el.hidden = !map[s];
  if (map[s]) { el.textContent = map[s][0]; el.title = map[s][1]; el.className = `sync ${s}`; }
}

const avatar = m => m?.photo
  ? `<img class="avatar" src="${esc(m.photo)}" alt="" referrerpolicy="no-referrer">`
  : `<span class="avatar">${esc((m?.name || '?')[0].toUpperCase())}</span>`;

function renderSplash(msg = '') {
  app.innerHTML = `<div class="splash"><div class="ob-logo">🥬</div><p class="muted">${esc(msg)}</p></div>`;
}

function renderAuth() {
  app.innerHTML = `
    <div class="onboard">
      <div class="ob-top"><span></span><button class="icon-btn" data-theme-btn></button></div>
      <div class="ob-card fade-in">
        <div class="ob-hero">
          <div class="ob-logo">🥬</div>
          <h1>Freshkito</h1>
          <p>Entra para tener tu cocina <b>sincronizada en todos tus móviles</b> y compartirla con tu familia.</p>
        </div>
        <div class="auth-box">
          <button class="btn google block" id="gBtn">
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            Continuar con Google
          </button>
          <div class="or"><span>o con tu correo</span></div>
          <form id="mailForm" class="mail-form">
            <input type="email" id="mailIn" required placeholder="tu@correo.com" autocomplete="email" aria-label="Correo electrónico">
            <button class="btn primary" type="submit">Enviar enlace</button>
          </form>
          <p class="muted small center">Te llegará un enlace para entrar, sin contraseñas.</p>
          <div id="mailSent" class="mail-sent" hidden></div>
          <button class="btn ghost block" id="localBtn">Seguir sin cuenta</button>
          <p class="muted small center">Tus datos de este móvil no se pierden.</p>
        </div>
      </div>
    </div>`;
  applyTheme();
  $('#gBtn').onclick = async () => {
    try { await Cloud.signInGoogle(); }
    catch (e) { if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') toast('No se pudo entrar con Google: ' + esc(e.code || e.message)); }
  };
  $('#mailForm').onsubmit = async e => {
    e.preventDefault();
    const email = $('#mailIn').value.trim();
    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      await Cloud.sendEmailLink(email);
      const box = $('#mailSent');
      box.hidden = false;
      box.innerHTML = `📬 Te hemos enviado un enlace a <b>${esc(email)}</b>.<br>Ábrelo <b>en este mismo dispositivo</b>. Mira también en spam.`;
      $('#mailForm').hidden = true;
    } catch (err) {
      toast('No se pudo enviar: ' + esc(err.code || err.message));
      btn.disabled = false; btn.textContent = 'Enviar enlace';
    }
  };
  $('#localBtn').onclick = () => { setMode('local'); boot(); };
}

function renderHousehold() {
  const u = Cloud.currentUser();
  const first = (u?.displayName || u?.email || '').split(/[\s@]/)[0];
  const local = S.localData();
  const localCount = local?.items?.length || 0;
  const invite = sessionStorage.getItem(INVITE_KEY) || '';
  app.innerHTML = `
    <div class="onboard">
      <div class="ob-top">
        <span class="user-chip">${avatar({ name: first, photo: u?.photoURL })}<span>${esc(u?.email || '')}</span></span>
        <button class="btn ghost small-btn" id="hhLogout">Salir</button>
      </div>
      <div class="ob-card fade-in">
        <h2>🏠 ¡Hola${first ? ', ' + esc(first[0].toUpperCase() + first.slice(1)) : ''}!</h2>
        <p class="muted">Crea tu hogar o únete al de tu familia con su código.</p>
        <div class="choice-card ${invite ? 'dim' : ''}">
          <h3>✨ Crear mi hogar</h3>
          <input id="hhName" class="text-in" value="Casa de ${esc(first ? first[0].toUpperCase() + first.slice(1) : 'todos')}" aria-label="Nombre del hogar">
          ${local?.appliances ? `<label class="check-row"><input type="checkbox" id="hhUpload" checked><span>Subir la cocina de este móvil${localCount ? ` (${localCount} alimentos)` : ''}</span></label>` : ''}
          <button class="btn primary block" id="hhCreate">Crear hogar</button>
        </div>
        <div class="choice-card ${invite ? 'highlight' : ''}">
          <h3>🔑 Unirme con un código</h3>
          <input id="hhCode" class="text-in code-in" value="${esc(invite)}" placeholder="Ej: K7Q2XM" maxlength="8" autocapitalize="characters" aria-label="Código de invitación">
          <button class="btn ${invite ? 'primary' : 'ghost'} block" id="hhJoin">Unirme</button>
        </div>
      </div>
    </div>`;
  const busy = (btn, on, label) => { btn.disabled = on; btn.textContent = on ? 'Un momento…' : label; };
  $('#hhLogout').onclick = doLogout;
  $('#hhCreate').onclick = async e => {
    busy(e.target, true);
    try {
      const upload = $('#hhUpload')?.checked ? local : null;
      const id = await Cloud.createHousehold($('#hhName').value.trim() || 'Mi hogar', upload);
      sessionStorage.removeItem(INVITE_KEY);
      connect(id);
      toast('🏠 Hogar creado. Invita a tu familia desde ⚙️ Ajustes');
    } catch (err) { console.error(err); toast('No se pudo crear: ' + esc(err.code || err.message)); busy(e.target, false, 'Crear hogar'); }
  };
  $('#hhJoin').onclick = async e => {
    const code = $('#hhCode').value;
    if (!code.trim()) return $('#hhCode').focus();
    busy(e.target, true);
    try {
      const id = await Cloud.joinHousehold(code);
      sessionStorage.removeItem(INVITE_KEY);
      connect(id);
      toast('🎉 Te has unido al hogar');
    } catch (err) { console.error(err); toast(err.message === 'Código no válido' ? 'Ese código no existe 🤔' : 'No se pudo unir: ' + esc(err.code || err.message)); busy(e.target, false, 'Unirme'); }
  };
}

function connect(id) {
  localStorage.setItem(HID_KEY, id);
  if (!$('#view')) renderSplash('Cargando tu hogar…');
  let first = true;
  Cloud.listen(id, {
    onState: st => {
      if (first) {
        first = false;
        S.attachRemote(Cloud.remoteOps, st);
        if (!S.isReady()) boot();
        checkPendingInvite(st);
      } else S.applyRemote(st);
    },
    onStatus: setSyncStatus,
    onGone: async () => {
      localStorage.removeItem(HID_KEY);
      S.detachRemote();
      await Cloud.clearHousehold();
      toast('Ya no formas parte de ese hogar');
      renderHousehold();
    }
  });
}

async function checkPendingInvite(st) {
  const code = sessionStorage.getItem(INVITE_KEY);
  if (!code) return;
  sessionStorage.removeItem(INVITE_KEY);
  if (code === st.household?.inviteCode) return;
  if (!confirm(`Te han invitado a otro hogar (${code}). ¿Quieres salir de "${st.household?.name}" y unirte?`)) return;
  try {
    await Cloud.leaveHousehold();
    S.detachRemote();
    const id = await Cloud.joinHousehold(code);
    connect(id);
  } catch (e) { toast('No se pudo cambiar de hogar'); }
}

async function doLogout() {
  closeSheet(true);
  setMode(null);
  setSyncStatus('');
  localStorage.removeItem(HID_KEY);
  S.detachRemote();
  await Cloud.logout();
}

function accountSection() {
  if (!Cloud.isConfigured()) return '';
  if (!S.isRemote()) {
    return `<button class="suggest-card" data-act="go-cloud"><span>☁️</span><span><b>Sincroniza y comparte</b><small>Entra con Google o tu correo para usarlo en varios móviles</small></span><span class="arrow">›</span></button>`;
  }
  const h = S.get().household || {};
  const u = Cloud.currentUser();
  const members = (h.members || []).map(id => ({ id, ...(h.memberInfo?.[id] || {}) }));
  return `
    <div class="set-card home-card">
      <label class="f-label-sm">🏠 Mi hogar</label>
      <input id="hhNameIn" class="text-in" value="${esc(h.name || '')}" aria-label="Nombre del hogar">
      <div class="members">
        ${members.map(m => `<span class="member">${avatar(m)}<small>${esc(m.id === u?.uid ? 'Tú' : (m.name || 'Miembro'))}</small></span>`).join('')}
      </div>
      <div class="invite-box">
        <span class="muted small">Código para invitar</span>
        <b class="code">${esc(h.inviteCode || '')}</b>
        <div class="chips">
          <button class="chip on" data-act="share-invite">📤 Invitar</button>
          <button class="chip" data-act="copy-invite">📋 Copiar enlace</button>
        </div>
      </div>
      <p class="muted small">Conectado como ${esc(u?.email || '')}</p>
      <div class="chips wrap">
        <button class="chip" data-act="logout">🚪 Cerrar sesión</button>
        <button class="chip danger" data-act="leave">Salir del hogar</button>
      </div>
    </div>`;
}

async function handleAccountAction(act) {
  const h = S.get()?.household;
  if (act === 'go-cloud') { closeSheet(true); setMode(null); return renderAuth(); }
  if (act === 'logout') return doLogout();
  if (act === 'leave') {
    if (!confirm(`¿Salir de "${h?.name}"? Dejarás de ver su nevera en este móvil.`)) return;
    closeSheet(true);
    localStorage.removeItem(HID_KEY);
    await Cloud.leaveHousehold();
    S.detachRemote();
    setSyncStatus('');
    return renderHousehold();
  }
  if (act === 'share-invite' || act === 'copy-invite') {
    const link = inviteLink(h.inviteCode);
    const text = `¡Únete a nuestra cocina "${h.name}" en Freshkito! 🥬\nCódigo: ${h.inviteCode}\n${link}`;
    if (act === 'share-invite' && navigator.share) {
      try { await navigator.share({ title: 'Freshkito', text }); } catch { /* cancelado */ }
    } else {
      try { await navigator.clipboard.writeText(act === 'copy-invite' ? link : text); toast('📋 Copiado'); }
      catch { prompt('Copia este enlace:', link); }
    }
  }
}

/* ================= Arranque ================= */
S.subscribe(() => {
  const mounted = !!$('#view');
  if (S.isReady()) { mounted ? render() : boot(); applyTheme(); }
  else if (mounted) boot();
});

function boot() {
  if (!S.isReady()) { ob.step = 0; return renderOnboarding(); }
  if (!TABS.some(t => t[0] === tab)) tab = 'fridge';
  renderShell();
  render();
  renderView(true);
}

async function start() {
  if (!Cloud.isConfigured()) return boot();
  if (mode === 'local' && !urlInvite) boot(); // arranque instantáneo en modo local
  else renderSplash();
  try {
    await Cloud.ready();
    await Cloud.completeEmailLink().catch(e => toast('El enlace no es válido o ha caducado'));
  } catch (e) {
    console.warn('Nube no disponible', e);
    if (mode !== 'local') { if (S.localData()?.appliances) boot(); else renderAuth(); }
    return;
  }
  Cloud.onUser(async user => {
    if (!user) {
      Cloud.stopListening();
      S.detachRemote();
      if (mode === 'local' && !sessionStorage.getItem(INVITE_KEY)) { if (!$('#view') && !$('.onboard')) boot(); return; }
      return renderAuth();
    }
    setMode('cloud');
    if (S.isRemote()) return;
    const cachedHid = localStorage.getItem(HID_KEY);
    if (cachedHid) { connect(cachedHid); Cloud.getProfile().catch(() => {}); return; } // funciona también sin conexión
    renderSplash('Cargando tu hogar…');
    try {
      const profile = await Cloud.getProfile();
      if (profile.householdId) connect(profile.householdId);
      else renderHousehold();
    } catch (e) {
      console.error(e);
      toast('Error de conexión con la nube');
      renderHousehold();
    }
  });
}
start();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
