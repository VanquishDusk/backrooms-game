// The tape: photos you've taken, kept in IndexedDB (falls back to memory
// when it isn't available). A photo is { id, level, time, seed, blob }.

const DB = 'backrooms';
const STORE = 'photos';
const MAX_PHOTOS = 150;

let dbp = null;
const memory = [];
let memId = 1;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    if (!window.indexedDB) return resolve(null);
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const s = req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        s.createIndex('level', 'level');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    let out;
    Promise.resolve(fn(s)).then((v) => (out = v));
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
  });
}

function all(store) {
  return new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

export async function addPhoto(rec) {
  const db = await open();
  if (!db) {
    memory.push({ ...rec, id: memId++ });
    while (memory.length > MAX_PHOTOS) memory.shift();
    return;
  }
  const list = await tx(db, 'readwrite', async (s) => {
    s.add(rec);
    return all(s);
  });
  // Keep the tape from filling up: drop the oldest.
  if (list.length >= MAX_PHOTOS) {
    const old = list.sort((a, b) => a.time - b.time).slice(0, list.length - MAX_PHOTOS + 1);
    await tx(db, 'readwrite', (s) => old.forEach((p) => s.delete(p.id)));
  }
}

// Newest first.
export async function listPhotos() {
  const db = await open();
  const list = db ? await tx(db, 'readonly', (s) => all(s)) : memory.slice();
  return list.sort((a, b) => b.time - a.time);
}

export async function deletePhoto(id) {
  const db = await open();
  if (!db) {
    const i = memory.findIndex((p) => p.id === id);
    if (i >= 0) memory.splice(i, 1);
    return;
  }
  await tx(db, 'readwrite', (s) => s.delete(id));
}
