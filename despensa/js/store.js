// Estado de la app y guardado local. Es la única capa que habrá que cambiar para pasar a la nube.
const KEY = 'freshkito:data';
const subs = new Set();
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

let state = load();

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}
function commit() {
  localStorage.setItem(KEY, JSON.stringify(state));
  subs.forEach(fn => fn(state));
}

export const get = () => state;
export const isReady = () => !!state?.appliances;
export const subscribe = fn => subs.add(fn);

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
  state = {
    version: 1,
    appliances: [
      { id: uid(), type: 'fridge', name: 'Nevera', zones: makeZones('fridge', cfg.fridge) },
      { id: uid(), type: 'freezer', name: 'Congelador', zones: makeZones('freezer', cfg.freezer) },
      { id: uid(), type: 'pantry', name: 'Despensa', zones: makeZones('pantry', cfg.pantry) }
    ],
    items: [],
    shopping: [],
    barcodes: {}
  };
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

export function addZone(type, kind) {
  const a = byType(type);
  const n = a.zones.filter(z => z.kind === kind).length + 1;
  const z = { id: uid(), kind, name: `${kindLabel(type, kind)} ${n}` };
  a.zones.push(z);
  commit();
  return z;
}

export function renameZone(zid, name) {
  const f = findZone(zid);
  if (f && name.trim()) { f.zone.name = name.trim(); commit(); }
}

export function moveZone(zid, dir) {
  const { appliance: a, zone } = findZone(zid);
  const i = a.zones.indexOf(zone), j = i + dir;
  if (j < 0 || j >= a.zones.length) return;
  [a.zones[i], a.zones[j]] = [a.zones[j], a.zones[i]];
  commit();
}

/** Borra una zona. Sus alimentos pasan a otra zona del mismo aparato (o se borran si no hay). */
export function removeZone(zid) {
  const { appliance: a, zone } = findZone(zid);
  a.zones = a.zones.filter(z => z !== zone);
  const target = a.zones[0];
  state.items = state.items.flatMap(i => i.zoneId !== zid ? [i] : target ? [{ ...i, zoneId: target.id }] : []);
  commit();
}

// ---------- Alimentos ----------
const ITEM_FIELDS = ['name', 'emoji', 'category', 'qty', 'unit', 'zoneId', 'expires', 'minQty', 'barcode'];
const pick = o => Object.fromEntries(ITEM_FIELDS.filter(k => k in o).map(k => [k, o[k]]));

export function addItem(data) {
  const item = { id: uid(), createdAt: Date.now(), qty: 1, unit: 'ud', minQty: 0, expires: '', ...pick(data) };
  state.items.push(item);
  commit();
  return item;
}

export function updateItem(id, patch) {
  const i = state.items.find(i => i.id === id);
  if (i) { Object.assign(i, pick(patch)); commit(); }
}

export function changeQty(id, delta) {
  const i = state.items.find(i => i.id === id);
  if (!i) return;
  i.qty = Math.max(0, Math.round((i.qty + delta) * 100) / 100);
  commit();
}

export function removeItem(id) {
  const item = state.items.find(i => i.id === id);
  state.items = state.items.filter(i => i.id !== id);
  commit();
  return item;
}

export function restoreItem(item) {
  if (!item) return;
  state.items.push(item);
  commit();
}

// ---------- Lista de la compra ----------
export function addShop({ name, emoji = '🛒', note = '' }) {
  const exists = state.shopping.find(s => s.name.toLowerCase() === name.toLowerCase() && !s.checked);
  if (exists) return exists;
  const s = { id: uid(), name, emoji, note, checked: false };
  state.shopping.unshift(s);
  commit();
  return s;
}
export function toggleShop(id) {
  const s = state.shopping.find(s => s.id === id);
  if (s) { s.checked = !s.checked; commit(); }
}
export function removeShops(ids) {
  const set = new Set(ids);
  state.shopping = state.shopping.filter(s => !set.has(s.id));
  commit();
}

// ---------- Códigos de barras recordados ----------
export const getBarcode = code => state.barcodes[code];
export function rememberBarcode(code, info) {
  state.barcodes[code] = info;
  commit();
}

// ---------- Datos ----------
export const exportJSON = () => JSON.stringify(state, null, 2);
export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data?.appliances || !Array.isArray(data.items)) throw new Error('Archivo no válido');
  state = { shopping: [], barcodes: {}, ...data };
  commit();
}
export function reset() {
  localStorage.removeItem(KEY);
  state = null;
  subs.forEach(fn => fn(state));
}
