// Vault cache on top of the current backend (local server, folder or GitHub).
// Every .md file is kept in memory, so views render synchronously. Writes use
// etags: if a file changed elsewhere (Obsidian, an AI agent, another device...)
// the backend answers 409 and we re-apply the change on top of the fresh content
// instead of overwriting it.

import { t } from "./i18n.js";
import { backend, ApiError } from "./backends.js";

export { ApiError };

export const store = {
  info: null,
  files: new Map(),   // path -> { content, etag, mtime, size }
  others: new Map(),  // non-markdown files: path -> { mtime, size }
  dirs: [],
  version: 0,
  online: true,
};

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function changed(paths) {
  store.version++;
  for (const fn of listeners) { try { fn(paths); } catch (e) { console.error(e); } }
}

/** Call the backend, keeping track of connectivity. */
async function call(fn) {
  try {
    const r = await fn();
    setOnline(true);
    return r;
  } catch (e) {
    if (e.status === 0 || (e.data && e.data.offline)) { setOnline(false); throw new ApiError(t(backend && backend.kind === "server" ? "err.offline" : "err.offlineWeb"), 0, e.data); }
    throw e;
  }
}
// server-only endpoints (settings, calendar, updates...)
const api = (path, body) => call(() => backend.api(path, body));

function setOnline(v) {
  if (store.online !== v) { store.online = v; changed([]); }
}

export const apiGet = (path) => api(path);
export const apiPost = (path, body) => api(path, body || {});

/** Wait until the server answers again (after an update / restart), then reload the page. */
export async function waitForServerAndReload(prevVersion) {
  const t0 = Date.now();
  await new Promise((r) => setTimeout(r, 1200));
  while (Date.now() - t0 < 120000) {
    try {
      const res = await fetch("/api/info", { cache: "no-store" });
      const info = await res.json();
      if (info.app === "panel" && (!prevVersion || info.version !== prevVersion || Date.now() - t0 > 4000)) { location.reload(); return; }
    } catch (e) { /* still restarting */ }
    await new Promise((r) => setTimeout(r, 800));
  }
  location.reload();
}

export async function loadInfo() {
  store.info = await call(() => backend.info());
  return store.info;
}

const isMd = (p) => /\.md$/i.test(p);

/** Fetch the file list; (re)read markdown files that are new or changed. */
export async function sync() {
  const list = await call(() => backend.files());
  const seen = new Set();
  const toRead = [];
  const others = new Map();
  for (const f of list.files) {
    if (!isMd(f.path)) { others.set(f.path, f); continue; }
    seen.add(f.path);
    const c = store.files.get(f.path);
    if (!c || (f.etag ? c.etag !== f.etag : c.mtime !== f.mtime || c.size !== f.size)) toRead.push(f.path);
  }
  const removed = [...store.files.keys()].filter((p) => !seen.has(p));
  for (const p of removed) store.files.delete(p);
  store.others = others;
  const dirsChanged = JSON.stringify(list.dirs) !== JSON.stringify(store.dirs);
  store.dirs = list.dirs;
  const changedPaths = [...removed];
  for (let i = 0; i < toRead.length; i += 200) {
    const chunk = toRead.slice(i, i + 200);
    const res = await call(() => backend.read(chunk));
    for (const [p, f] of Object.entries(res)) {
      if (!f) continue;
      const c = store.files.get(p);
      if (c && c.etag === f.etag) { c.mtime = f.mtime; c.size = f.size; continue; }
      store.files.set(p, f);
      changedPaths.push(p);
    }
  }
  if (changedPaths.length || dirsChanged) changed(changedPaths);
  return changedPaths;
}

export function content(path) {
  const f = store.files.get(path);
  return f ? f.content : null;
}
export function exists(path) { return store.files.has(path) || store.others.has(path) || store.dirs.includes(path); }

async function writeRaw(path, text, opts = {}) {
  const res = await call(() => backend.write(path, text, opts));
  store.files.set(res.path, { content: text.replace(/\r\n/g, "\n"), etag: res.etag, mtime: res.mtime, size: res.size });
  store.version++; // derived indexes must be rebuilt (listeners are notified by transactions)
  const dir = res.path.split("/").slice(0, -1);
  for (let i = 1; i <= dir.length; i++) {
    const d = dir.slice(0, i).join("/");
    if (!store.dirs.includes(d)) store.dirs.push(d);
  }
  return res;
}

/* ------------------------------------------------------------ transactions */
// A transaction groups file changes under one undo step.

const undoStack = [];
let currentTx = null;

async function snapshot(path) {
  if (currentTx && !currentTx.snaps.has(path)) currentTx.snaps.set(path, content(path));
}

/**
 * Read-modify-write. `fn(oldContent|null) -> newContent|null` (null = no change).
 * Retries automatically when the file changed on disk in the meantime.
 */
export async function mutate(path, fn) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = store.files.get(path);
    const next = fn(cur ? cur.content : null);
    if (next === null || next === undefined || (cur && next === cur.content)) return false;
    await snapshot(path);
    try {
      await writeRaw(path, next, { etag: cur ? cur.etag : null });
      return true;
    } catch (e) {
      if (e.status === 409 && e.data.reason === "conflict") {
        if (e.data.content === null || e.data.content === undefined) store.files.delete(path);
        else store.files.set(path, { content: e.data.content, etag: e.data.etag, mtime: 0, size: 0 });
        continue;
      }
      throw e;
    }
  }
  throw new ApiError(t("err.conflict"), 409);
}

/** Plain write (editor autosave). Pass etag to detect external edits. */
export async function write(path, text, opts = {}) {
  await snapshot(path);
  return writeRaw(path, text, opts);
}

export async function create(path, text) {
  await snapshot(path);
  return writeRaw(path, text, { create: true });
}

export async function remove(path) {
  if (currentTx) {
    for (const p of store.files.keys()) if (p === path || p.startsWith(path + "/")) await snapshot(p);
  }
  await call(() => backend.remove(path));
  for (const p of [...store.files.keys()]) if (p === path || p.startsWith(path + "/")) store.files.delete(p);
  store.dirs = store.dirs.filter((d) => d !== path && !d.startsWith(path + "/"));
}

export async function move(from, to) {
  const res = await call(() => backend.move(from, to));
  const moved = [];
  for (const [p, f] of [...store.files.entries()]) {
    if (p === from || p.startsWith(from + "/")) {
      store.files.delete(p);
      const np = res.path + p.slice(from.length);
      store.files.set(np, f);
      moved.push([p, np]);
    }
  }
  if (currentTx) currentTx.moves.push([from, res.path]);
  await sync().catch(() => {});
  return res.path;
}

export async function upload(file) {
  const res = await call(() => backend.upload(file.name || "image.png", file));
  store.others.set(res.path, { path: res.path, mtime: Date.now(), size: file.size });
  return res.path;
}

export async function migrate(lang) { return call(() => backend.migrate(lang)); }

/**
 * Run `fn` as one undoable step. Returns fn's result. Notifies listeners once.
 */
export async function transaction(label, fn) {
  const outer = !currentTx;
  if (outer) currentTx = { label, snaps: new Map(), moves: [] };
  const tx = currentTx;
  try {
    return await fn();
  } finally {
    if (outer) {
      currentTx = null;
      if (tx.snaps.size || tx.moves.length) {
        undoStack.push(tx);
        if (undoStack.length > 50) undoStack.shift();
      }
      changed([...tx.snaps.keys()]);
    }
  }
}

export function canUndo() { return undoStack.length > 0; }
export function lastUndoLabel() { return undoStack.length ? undoStack[undoStack.length - 1].label : null; }

export async function undo() {
  const tx = undoStack.pop();
  if (!tx) return null;
  // moves first (reverse order), then contents
  for (const [from, to] of [...tx.moves].reverse()) {
    try { await call(() => backend.move(to, from)); } catch (e) { console.warn(e); }
  }
  for (const [path, prev] of [...tx.snaps.entries()].reverse()) {
    try {
      if (prev === null) { if (store.files.has(path)) await call(() => backend.remove(path)); store.files.delete(path); }
      else await writeRaw(path, prev);
    } catch (e) { console.warn(e); }
  }
  await sync().catch(() => {});
  changed([...tx.snaps.keys()]);
  return tx.label;
}

export function notify() { changed([]); }

/* ------------------------------------------------------------ polling */
let pollTimer = null;
export function startPolling(ms = backend.pollMs || 3000) {
  const tick = async () => {
    if (document.visibilityState === "visible" && !currentTx) {
      try { await sync(); } catch (e) { /* offline: flag already set */ }
    }
    pollTimer = setTimeout(tick, ms);
  };
  clearTimeout(pollTimer);
  pollTimer = setTimeout(tick, ms);
  window.addEventListener("focus", () => { if (!currentTx) sync().catch(() => {}); });
}
