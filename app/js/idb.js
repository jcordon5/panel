// Minimal IndexedDB key-value store (folder handles, GitHub settings, blob cache).

const DB = "panel";
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

function run(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction("kv", mode);
    const req = fn(tx.objectStore("kv"));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export const idbGet = (key) => run("readonly", (s) => s.get(key));
export const idbSet = (key, value) => run("readwrite", (s) => s.put(value, key));
export const idbDel = (key) => run("readwrite", (s) => s.delete(key));
