// Nube: login (Google / enlace por correo), hogares compartidos y sincronización en tiempo real con Firestore.
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const EMAIL_KEY = 'freshkito:emailForSignIn';

let fb = null;          // módulos de Firebase + instancias
let hid = null;         // hogar actual
let unsubs = [];        // listeners activos

export const isConfigured = () => !!firebaseConfig?.apiKey && !firebaseConfig.apiKey.startsWith('TU_');

export async function ready() {
  if (fb) return fb;
  const [appM, authM, fsM] = await Promise.all([
    import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore.js`)
  ]);
  const app = appM.initializeApp(firebaseConfig);
  const auth = authM.getAuth(app);
  auth.languageCode = 'es';
  let db;
  try {
    db = fsM.initializeFirestore(app, { localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() }) });
  } catch {
    db = fsM.getFirestore(app);
  }
  fb = { ...authM, ...fsM, auth, db };
  return fb;
}

const user = () => fb.auth.currentUser;
const me = () => {
  const u = user();
  return { name: u.displayName || (u.email || '').split('@')[0], email: u.email || '', photo: u.photoURL || '' };
};
export const currentUser = () => (fb ? user() : null);

/* ================= Autenticación ================= */
export function onUser(cb) { return fb.onAuthStateChanged(fb.auth, cb); }

export async function signInGoogle() {
  const provider = new fb.GoogleAuthProvider();
  try {
    await fb.signInWithPopup(fb.auth, provider);
  } catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(e.code)) {
      return fb.signInWithRedirect(fb.auth, provider);
    }
    throw e;
  }
}

export async function sendEmailLink(email) {
  await fb.sendSignInLinkToEmail(fb.auth, email, { url: location.origin + location.pathname, handleCodeInApp: true });
  localStorage.setItem(EMAIL_KEY, email);
}

/** Si la página se abrió desde el enlace del correo, completa el inicio de sesión. */
export async function completeEmailLink() {
  if (!fb.isSignInWithEmailLink(fb.auth, location.href)) return false;
  let email = localStorage.getItem(EMAIL_KEY);
  if (!email) email = prompt('Confirma tu correo para entrar:');
  if (!email) return false;
  await fb.signInWithEmailLink(fb.auth, email, location.href);
  localStorage.removeItem(EMAIL_KEY);
  history.replaceState(null, '', location.pathname);
  return true;
}

export async function logout() {
  stopListening();
  await fb.signOut(fb.auth);
}

/* ================= Perfil y hogares ================= */
const userRef = () => fb.doc(fb.db, 'users', user().uid);
const hhRef = (id = hid) => fb.doc(fb.db, 'households', id);
const sub = (col, id) => fb.doc(fb.db, 'households', hid, col, id);
const clean = o => JSON.parse(JSON.stringify(o));

export async function getProfile() {
  const ref = userRef();
  await fb.setDoc(ref, me(), { merge: true }).catch(() => {});
  const snap = await fb.getDoc(ref);
  return snap.exists() ? snap.data() : {};
}

async function uniqueCode() {
  for (let t = 0; t < 8; t++) {
    const code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    const snap = await fb.getDoc(fb.doc(fb.db, 'invites', code));
    if (!snap.exists()) return code;
  }
  throw new Error('No se pudo generar el código');
}

export async function createHousehold(name, local) {
  const u = user();
  const ref = fb.doc(fb.collection(fb.db, 'households'));
  const code = await uniqueCode();
  const b = fb.writeBatch(fb.db);
  b.set(ref, {
    name, ownerId: u.uid, members: [u.uid], memberInfo: { [u.uid]: me() },
    inviteCode: code, appliances: local?.appliances ? clean(local.appliances) : null, createdAt: Date.now()
  });
  b.set(fb.doc(fb.db, 'invites', code), { householdId: ref.id });
  b.set(userRef(), { householdId: ref.id }, { merge: true });
  await b.commit();
  if (local) await uploadAll(ref.id, local, false);
  return ref.id;
}

export async function joinHousehold(rawCode) {
  const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const inv = await fb.getDoc(fb.doc(fb.db, 'invites', code));
  if (!inv.exists()) throw new Error('Código no válido');
  const id = inv.data().householdId;
  const u = user();
  await fb.updateDoc(hhRef(id), { members: fb.arrayUnion(u.uid), [`memberInfo.${u.uid}`]: me() });
  await fb.setDoc(userRef(), { householdId: id }, { merge: true });
  return id;
}

export async function leaveHousehold() {
  const u = user();
  const id = hid;
  stopListening();
  await fb.setDoc(userRef(), { householdId: null }, { merge: true });
  if (id) await fb.updateDoc(hhRef(id), { members: fb.arrayRemove(u.uid), [`memberInfo.${u.uid}`]: fb.deleteField() }).catch(() => {});
}

export async function clearHousehold() {
  stopListening();
  await fb.setDoc(userRef(), { householdId: null }, { merge: true }).catch(() => {});
}

async function uploadAll(id, data, withAppliances = true) {
  const writes = [];
  if (withAppliances && data.appliances) writes.push(b => b.update(hhRef(id), { appliances: clean(data.appliances) }));
  const put = (col, docId, val) => writes.push(b => b.set(fb.doc(fb.db, 'households', id, col, String(docId)), clean(val)));
  (data.items || []).forEach(i => put('items', i.id, { ...i, addedBy: i.addedBy || user().uid }));
  (data.shopping || []).forEach(s => put('shopping', s.id, { createdAt: Date.now(), ...s }));
  Object.entries(data.barcodes || {}).forEach(([code, info]) => put('barcodes', code, info));
  for (let i = 0; i < writes.length; i += 400) {
    const b = fb.writeBatch(fb.db);
    writes.slice(i, i + 400).forEach(w => w(b));
    await b.commit();
  }
}

/* ================= Sincronización en tiempo real ================= */
export function stopListening() {
  unsubs.forEach(u => u());
  unsubs = [];
  hid = null;
}

/**
 * Escucha el hogar y llama a onState con el estado completo cada vez que cambia algo
 * (en este dispositivo o en cualquier otro).
 */
export function listen(id, { onState, onStatus, onGone, onError }) {
  stopListening();
  hid = id;
  const parts = { hh: null, items: null, shopping: [], barcodes: {} };
  const pending = { hh: false, items: false, shopping: false };

  const emit = () => {
    if (!parts.hh || !parts.items) return;
    const h = parts.hh;
    onState({
      version: 1,
      appliances: h.appliances || null,
      items: parts.items,
      shopping: [...parts.shopping].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
      barcodes: parts.barcodes,
      household: { id, name: h.name, members: h.members || [], memberInfo: h.memberInfo || {}, inviteCode: h.inviteCode, ownerId: h.ownerId }
    });
  };
  const status = () => onStatus?.(!navigator.onLine ? 'offline' : Object.values(pending).some(Boolean) ? 'pending' : 'synced');
  const onNet = () => status();
  addEventListener('online', onNet);
  addEventListener('offline', onNet);
  unsubs.push(() => { removeEventListener('online', onNet); removeEventListener('offline', onNet); });

  const opts = { includeMetadataChanges: true };
  const fail = e => { console.error(e); if (e.code === 'permission-denied') onGone?.(); else onError?.(e); };

  unsubs.push(fb.onSnapshot(hhRef(id), opts, snap => {
    if (!snap.exists() || !(snap.data().members || []).includes(user()?.uid)) return onGone?.();
    parts.hh = snap.data(); pending.hh = snap.metadata.hasPendingWrites; status(); emit();
  }, fail));
  unsubs.push(fb.onSnapshot(fb.collection(fb.db, 'households', id, 'items'), opts, snap => {
    parts.items = snap.docs.map(d => d.data()); pending.items = snap.metadata.hasPendingWrites; status(); emit();
  }, fail));
  unsubs.push(fb.onSnapshot(fb.collection(fb.db, 'households', id, 'shopping'), opts, snap => {
    parts.shopping = snap.docs.map(d => d.data()); pending.shopping = snap.metadata.hasPendingWrites; status(); emit();
  }, fail));
  unsubs.push(fb.onSnapshot(fb.collection(fb.db, 'households', id, 'barcodes'), snap => {
    parts.barcodes = Object.fromEntries(snap.docs.map(d => [d.id, d.data()])); emit();
  }, fail));
}

/* Operaciones que usa store.js en modo nube. No se espera a la red: Firestore las guarda y sincroniza solo. */
const w = p => p.catch(e => console.error('Error al sincronizar', e));
export const remoteOps = {
  setAppliances: apps => w(fb.updateDoc(hhRef(), { appliances: clean(apps) })),
  putItem: it => w(fb.setDoc(sub('items', it.id), clean({ ...it, addedBy: it.addedBy || user().uid, updatedAt: Date.now() }))),
  delItem: id => w(fb.deleteDoc(sub('items', id))),
  putShop: s => w(fb.setDoc(sub('shopping', s.id), clean(s))),
  delShop: id => w(fb.deleteDoc(sub('shopping', id))),
  putBarcode: (code, info) => w(fb.setDoc(sub('barcodes', String(code)), clean(info))),
  renameHousehold: name => w(fb.updateDoc(hhRef(), { name })),
  importAll: st => w(uploadAll(hid, st))
};
