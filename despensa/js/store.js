// Estado de la app. Dos modos:
//  - local: guarda en localStorage (como siempre)
//  - nube:  cada cambio se aplica al momento en memoria y se envía a Firestore (cloud.js); los cambios
//           de otros dispositivos llegan por applyRemote().
const KEY = 'freshkito:data';
const subs = new Set();
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

let state = load();
let remote = null;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}
function notify() { subs.forEach(fn => fn(state)); }
function commit() {
  if (!remote) localStorage.setItem(KEY, JSON.stringify(state));
  notify();
}
const R = (op, ...args) => remote?.[op]?.(...args);

export const get = () => state;
export const isReady = () => !!state?.appliances;
export const isRemote = () => !!remote;
export const subscribe = fn => subs.add(fn);
/** Datos guardados en este móvil (para subirlos a la nube al crear un hogar). */
export const localData = () => load();

// ---------- Conexión con la nube ----------
export function attachRemote(ops, remoteState) {
  remote = ops;
  state = remoteState;
  notify();
}
export function applyRemote(remoteState) {
  state = remoteState;
  notify();
}
export function detachRemote() {
  if (!remote) return;
  remote = null;
  state = load();
  notify();
}

// ---------- Configuración ----------
const LABELS = {
  fridge: { shelf: 'Balda', drawer: 'Cajón', door: 'Puerta' },
  freezer: { shelf: 'Balda', drawer: 'Cajón', door: 'Puerta' },
  pantry: { shelf: 'Estante', drawer: 'Cesta', door: 'Puerta' }
};
export const kindLabel = (type, kind) => LABELS[type][kind];

function makeZones(type, counts) {
  const zones = [];
  for (const kind of ['shelf', 'drawer', 'door']) {
    const n = counts[kind] || 0;
    for (let i = 1; i <= n; i++) {
      let name = `${kindLabel(type, kind)} ${i}`;
      if (type === 'fridge' && kind === 'door') name = (i === n && n > 1) ? 'Botellero' : `Puerta ${i}`;
      zones.push({ id: uid(), kind, name });
    }
  }
  return zones;
}

export function init(cfg) {
  const appliances = [
    { id: uid(), type: 'fridge', name: 'Nevera', zones: makeZones('fridge', cfg.fridge) },
    { id: uid(), type: 'freezer', name: 'Congelador', zones: makeZones('freezer', cfg.freezer) },
    { id: uid(), type: 'pantry', name: 'Despensa', zones: makeZones('pantry', cfg.pantry) }
  ];
  if (remote) {
    state = { ...state, appliances };
    R('setAppliances', appliances);
  } else {
    state = { version: 1, appliances, items: [], shopping: [], barcodes: {} };
  }
  commit();
}

// ---------- Aparatos y zonas ----------
export const byType = type => state.appliances.find(a => a.type === type);

export function findZone(zid) {
  for (const a of state.appliances) {
    const z = a.zones.find(z => z.id === zid);
    if (z) return { appliance: a, zone: z };
  }
  return null;
}

const saveLayout = () => { R('setAppliances', state.appliances); commit(); };

export function addZone(type, kind) {
  const a = byType(type);
  const n = a.zones.filter(z => z.kind === kind).length + 1;
  const z = { id: uid(), kind, name: `${kindLabel(type, kind)} ${n}` };
  a.zones.push(z);
  saveLayout();
  return z;
}

export function renameZone(zid, name) {
  const f = findZone(zid);
  if (f && name.trim() && f.zone.name !== name.trim()) { f.zone.name = name.trim(); saveLayout(); }
}

export function moveZone(zid, dir) {
  const { appliance: a, zone } = findZone(zid);
  const i = a.zones.indexOf(zone), j = i + dir;
  if (j < 0 || j >= a.zones.length) return;
  [a.zones[i], a.zones[j]] = [a.zones[j], a.zones[i]];
  saveLayout();
}

/** Borra una zona. Sus alimentos pasan a otra zona del mismo aparato (o se borran si no hay). */
export function removeZone(zid) {
  const { appliance: a, zone } = findZone(zid);
  a.zones = a.zones.filter(z => z !== zone);
  const target = a.zones[0];
  state.items = state.items.flatMap(i => {
    if (i.zoneId !== zid) return [i];
    if (!target) { R('delItem', i.id); return []; }
    const moved = { ...i, zoneId: target.id };
    R('putItem', moved);
    return [moved];
  });
  saveLayout();
}

// ---------- Alimentos ----------
const ITEM_FIELDS = ['name', 'emoji', 'category', 'qty', 'unit', 'zoneId', 'expires', 'minQty', 'barcode'];
const pick = o => Object.fromEntries(ITEM_FIELDS.filter(k => k in o).map(k => [k, o[k]]));

export function addItem(data) {
  const item = { id: uid(), createdAt: Date.now(), qty: 1, unit: 'ud', minQty: 0, expires: '', ...pick(data) };
  state.items.push(item);
  R('putItem', item);
  commit();
  return item;
}

export function updateItem(id, patch) {
  const i = state.items.find(i => i.id === id);
  if (!i) return;
  Object.assign(i, pick(patch));
  R('putItem', i);
  commit();
}

export function changeQty(id, delta) {
  const i = state.items.find(i => i.id === id);
  if (!i) return;
  i.qty = Math.max(0, Math.round((i.qty + delta) * 100) / 100);
  R('putItem', i);
  commit();
}

export function removeItem(id) {
  const item = state.items.find(i => i.id === id);
  state.items = state.items.filter(i => i.id !== id);
  R('delItem', id);
  commit();
  return item;
}

export function restoreItem(item) {
  if (!item) return;
  state.items.push(item);
  R('putItem', item);
  commit();
}

// ---------- Lista de la compra ----------
export function addShop({ name, emoji = '🛒', note = '' }) {
  const exists = state.shopping.find(s => s.name.toLowerCase() === name.toLowerCase() && !s.checked);
  if (exists) return exists;
  const s = { id: uid(), name, emoji, note, checked: false, createdAt: Date.now() };
  state.shopping.unshift(s);
  R('putShop', s);
  commit();
  return s;
}
export function toggleShop(id) {
  const s = state.shopping.find(s => s.id === id);
  if (!s) return;
  s.checked = !s.checked;
  R('putShop', s);
  commit();
}
export function removeShops(ids) {
  const set = new Set(ids);
  state.shopping = state.shopping.filter(s => !set.has(s.id));
  ids.forEach(id => R('delShop', id));
  commit();
}

// ---------- Códigos de barras recordados ----------
export const getBarcode = code => state.barcodes?.[code];
export function rememberBarcode(code, info) {
  state.barcodes = { ...(state.barcodes || {}), [code]: info };
  R('putBarcode', code, info);
  commit();
}

// ---------- Hogar (solo nube) ----------
export function renameHousehold(name) {
  if (!remote || !name.trim()) return;
  state.household = { ...state.household, name: name.trim() };
  R('renameHousehold', name.trim());
  notify();
}

// ---------- Datos ----------
export const exportJSON = () => {
  const { household, ...data } = state;
  return JSON.stringify(data, null, 2);
};
export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data?.appliances || !Array.isArray(data.items)) throw new Error('Archivo no válido');
  state = { ...state, shopping: [], barcodes: {}, ...data, household: state?.household };
  if (remote) R('importAll', state);
  commit();
}
export function reset() {
  if (remote) return;
  localStorage.removeItem(KEY);
  state = null;
  notify();
}
