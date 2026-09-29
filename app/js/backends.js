// Where the vault lives. The rest of the app only talks to `backend`:
//
//   server  — the local Python server (panel.bat / panel.sh / install scripts)
//   folder  — a folder on this computer, opened directly by the browser
//             (File System Access API: Chrome, Edge, Brave, Opera on desktop)
//   github  — a private GitHub repository (any device, phones included)
//
// Every backend implements: info, files, read, write, move, remove, upload,
// assetUrl / assetBlobUrl. Writes carry an etag so concurrent edits (another
// device, Obsidian, an AI agent...) are detected instead of overwritten.

import { idbGet, idbSet, idbDel } from "./idb.js";
import { slugify } from "./util.js";

export const APP_VERSION = "2.3.0";

export class ApiError extends Error {
  constructor(msg, status, data) { super(msg); this.status = status; this.data = data || {}; }
}

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8");
const norm = (s) => s.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
const hidden = (path) => path.split("/").some((p) => p.startsWith("."));
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", pdf: "application/pdf", bmp: "image/bmp", avif: "image/avif" };
const mimeOf = (path) => MIME[(path.split(".").pop() || "").toLowerCase()] || "application/octet-stream";

async function sha1hex(bytes) {
  const d = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** Same id git gives a blob: sha1("blob <len>\0" + bytes) */
export async function gitBlobSha(bytes) {
  const head = enc.encode(`blob ${bytes.length}\0`);
  const all = new Uint8Array(head.length + bytes.length);
  all.set(head); all.set(bytes, head.length);
  return sha1hex(all);
}
function b64encode(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64decode(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function stamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function assetPath(name, taken) {
  const m = /^(.*?)(\.[a-z0-9]+)?$/i.exec(name || "image.png");
  const base = (m[1] || "file").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
  const ext = (m[2] || ".png").toLowerCase();
  const d = new Date();
  const dir = `assets/${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  let p = `${dir}/${base}${ext}`, n = 2;
  while (taken(p)) p = `${dir}/${base}-${n++}${ext}`;
  return p;
}
/** Serialise writes: one at a time, in order. */
function queue() {
  let last = Promise.resolve();
  return (fn) => { const run = last.then(fn, fn); last = run.catch(() => {}); return run; };
}

/* ======================================================================= server */

export class ServerBackend {
  constructor() { this.kind = "server"; this.pollMs = 3000; this.saveDelay = 700; this.features = { calendar: true, updates: true, migrate: true, serverSettings: true }; }
  async api(path, body) {
    let res;
    try {
      res = await fetch(path, body === undefined ? { headers: { "X-Panel": "1" } }
        : { method: "POST", headers: { "Content-Type": "application/json", "X-Panel": "1" }, body: JSON.stringify(body) });
    } catch (e) {
      throw new ApiError("offline", 0, { offline: true });
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* empty */ }
    if (!res.ok || data.ok === false) throw new ApiError(data.error || res.statusText, res.status, data);
    return data;
  }
  info() { return this.api("/api/info"); }
  files() { return this.api("/api/files"); }
  async read(paths) { return (await this.api("/api/read", { paths })).files; }
  write(path, content, opts = {}) {
    const body = { path, content };
    if ("etag" in opts) body.etag = opts.etag;
    if (opts.create) body.create = true;
    return this.api("/api/write", body);
  }
  move(from, to) { return this.api("/api/move", { from, to }); }
  remove(path) { return this.api("/api/delete", { path }); }
  async upload(name, blob) {
    const data = b64encode(new Uint8Array(await blob.arrayBuffer()));
    return this.api("/api/upload", { name, data });
  }
  assetUrl(path) { return "/vault/" + path.split("/").map(encodeURIComponent).join("/"); }
  async assetBlobUrl(path) { return this.assetUrl(path); }
  migrate(lang) { return this.api("/api/migrate", { lang }); }
  describe() { return null; }
}

/* ======================================================================= folder */

export class FolderBackend {
  static supported() { return typeof window !== "undefined" && "showDirectoryPicker" in window; }
  static async pick() {
    const handle = await window.showDirectoryPicker({ id: "panel-vault", mode: "readwrite" });
    await idbSet("folder", handle);
    return new FolderBackend(handle);
  }
  /** Saved folder, if any: { backend, needsPermission } */
  static async restore() {
    const handle = await idbGet("folder").catch(() => null);
    if (!handle) return null;
    const perm = await handle.queryPermission({ mode: "readwrite" });
    return { backend: new FolderBackend(handle), needsPermission: perm !== "granted" };
  }
  constructor(handle) {
    this.kind = "folder"; this.handle = handle; this.pollMs = 4000; this.saveDelay = 700;
    this.features = { calendar: false, updates: false, migrate: false, serverSettings: false };
    this.q = queue(); this.urls = new Map();
  }
  async grant() { return (await this.handle.requestPermission({ mode: "readwrite" })) === "granted"; }
  async forget() { await idbDel("folder"); }
  describe() { return { label: this.handle.name }; }

  async dir(parts, create = false) {
    let d = this.handle;
    for (const p of parts) d = await d.getDirectoryHandle(p, { create });
    return d;
  }
  async fileHandle(path, create = false) {
    const parts = path.split("/");
    const name = parts.pop();
    return (await this.dir(parts, create)).getFileHandle(name, { create });
  }
  async stat(path) {
    try { return await (await this.fileHandle(path)).getFile(); } catch (e) { return null; }
  }
  async info() {
    const list = await this.files();
    return { app: "panel", version: APP_VERSION, vault: this.handle.name, vaultName: this.handle.name,
      empty: !list.files.some((f) => /\.md$/i.test(f.path)), legacy: null, platform: "web" };
  }
  async files() {
    const files = [], dirs = [];
    const walk = async (dir, prefix) => {
      for await (const [name, h] of dir.entries()) {
        if (name.startsWith(".") || name.includes(".crswap")) continue;
        const path = prefix + name;
        if (h.kind === "directory") { dirs.push(path); await walk(h, path + "/"); }
        else {
          const f = await h.getFile();
          files.push({ path, mtime: f.lastModified, size: f.size });
        }
      }
    };
    await walk(this.handle, "");
    return { files, dirs };
  }
  async read(paths) {
    const out = {};
    for (const p of paths) {
      const f = await this.stat(p);
      if (!f) { out[p] = null; continue; }
      const bytes = new Uint8Array(await f.arrayBuffer());
      out[p] = { content: norm(dec.decode(bytes)), etag: await sha1hex(bytes), mtime: f.lastModified, size: f.size };
    }
    return out;
  }
  write(path, content, opts = {}) {
    return this.q(async () => {
      if (hidden(path) || !/\.md$/i.test(path)) throw new ApiError("path not allowed", 400);
      const cur = await this.stat(path);
      const curBytes = cur ? new Uint8Array(await cur.arrayBuffer()) : null;
      const curEtag = curBytes ? await sha1hex(curBytes) : null;
      if (opts.create && cur) throw new ApiError("exists", 409, { reason: "exists" });
      if ("etag" in opts && opts.etag !== curEtag) {
        throw new ApiError("conflict", 409, { reason: "conflict", etag: curEtag, content: curBytes ? norm(dec.decode(curBytes)) : null });
      }
      const bytes = enc.encode(content.replace(/\r\n/g, "\n"));
      const w = await (await this.fileHandle(path, true)).createWritable();
      await w.write(bytes);
      await w.close();
      const f = await this.stat(path);
      return { path, etag: await sha1hex(bytes), mtime: f ? f.lastModified : Date.now(), size: bytes.length };
    });
  }
  async copyTree(from, to) {
    const src = await this.stat(from);
    if (src) {
      const w = await (await this.fileHandle(to, true)).createWritable();
      await w.write(await src.arrayBuffer());
      await w.close();
      return;
    }
    const d = await this.dir(from.split("/"));
    for await (const [name] of d.entries()) await this.copyTree(from + "/" + name, to + "/" + name);
    if (!(await this.exists(to))) await this.dir(to.split("/"), true);
  }
  async exists(path) {
    if (await this.stat(path)) return true;
    try { await this.dir(path.split("/")); return true; } catch (e) { return false; }
  }
  async removeEntry(path) {
    const parts = path.split("/");
    const name = parts.pop();
    await (await this.dir(parts)).removeEntry(name, { recursive: true });
  }
  move(from, to) {
    return this.q(async () => {
      if (!(await this.exists(from))) throw new ApiError("not found", 404);
      if (await this.exists(to)) throw new ApiError("exists", 409, { reason: "exists" });
      await this.copyTree(from, to);
      await this.removeEntry(from);
      return { path: to };
    });
  }
  remove(path) {
    return this.q(async () => {
      const trash = `.trash/${stamp()}_${path.replace(/\//g, "__")}`;
      await this.copyTree(path, trash);
      await this.removeEntry(path);
      return { trash };
    });
  }
  upload(name, blob) {
    return this.q(async () => {
      const existing = new Set((await this.files()).files.map((f) => f.path));
      const path = assetPath(name, (p) => existing.has(p));
      const w = await (await this.fileHandle(path, true)).createWritable();
      await w.write(blob);
      await w.close();
      return { path };
    });
  }
  assetUrl() { return null; }
  async assetBlobUrl(path) {
    if (this.urls.has(path)) return this.urls.get(path);
    const f = await this.stat(path);
    if (!f) return null;
    const url = URL.createObjectURL(new Blob([await f.arrayBuffer()], { type: mimeOf(path) }));
    this.urls.set(path, url);
    return url;
  }
}

/* ======================================================================= demo */

/** Throw-away vault in memory, filled with sample data (web "try it" button). */
export class MemoryBackend extends FolderBackend {
  static async demo(lang) {
    const { memDir } = await import("./memdir.js");
    const { demoFiles } = await import("./demo.js");
    const b = new MemoryBackend(memDir("demo"));
    for (const [path, text] of Object.entries(demoFiles(lang))) await b.write(path, text);
    return b;
  }
  constructor(handle) { super(handle); this.kind = "memory"; this.pollMs = 60000; }
  describe() { return { label: "Demo" }; }
  async forget() {}
}

/* ======================================================================= github */

export class GitHubBackend {
  static async restore() {
    const cfg = await idbGet("github").catch(() => null);
    return cfg && cfg.token ? new GitHubBackend(cfg) : null;
  }
  /** Validate the token + repo, create the first commit if the repo is empty, remember it. */
  static async connect({ owner, repo, token }) {
    const b = new GitHubBackend({ owner: owner.trim(), repo: repo.trim(), token: token.trim() });
    await b.init();
    await idbSet("github", { owner: b.owner, repo: b.repo, token: b.token, branch: b.branch });
    return b;
  }
  constructor({ owner, repo, token, branch }) {
    Object.assign(this, { owner, repo, token, branch: branch || null });
    this.kind = "github"; this.pollMs = 30000; this.saveDelay = 2500;
    this.features = { calendar: false, updates: false, migrate: false, serverSettings: false };
    this.entries = new Map(); this.dirSet = new Set(); this.headSha = null; this.treeSha = null;
    this.q = queue(); this.urls = new Map();
  }
  async forget() { await idbDel("github"); }
  describe() { return { label: `github.com/${this.owner}/${this.repo}`, url: `https://github.com/${this.owner}/${this.repo}` }; }

  async req(method, path, body) {
    let res;
    try {
      res = await fetch("https://api.github.com" + path, {
        method, cache: "no-store",
        headers: { Authorization: "Bearer " + this.token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new ApiError("offline", 0, { offline: true });
    }
    if (res.status === 204) return {};
    let data = {};
    try { data = await res.json(); } catch (e) { /* empty */ }
    if (!res.ok) {
      const msg = res.status === 401 ? "GitHub: token not valid or expired" : res.status === 404 ? "GitHub: repository not found (check the name and the token's access)" : "GitHub: " + (data.message || res.statusText);
      throw new ApiError(msg, res.status, data);
    }
    return data;
  }
  base() { return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`; }

  async init() {
    const r = await this.req("GET", this.base());
    this.branch = r.default_branch || "main";
    if (r.permissions && r.permissions.push === false) throw new ApiError("GitHub: the token cannot write to this repository", 403);
    this.isPrivate = !!r.private;
    if (!(await this.head())) {
      // empty repository: the Git Data API needs a first commit
      await this.req("PUT", `${this.base()}/contents/.panel-vault`, { message: "Panel: start vault", content: b64encode(enc.encode("Panel vault\n")) });
    }
    await this.loadTree(true);
  }
  async head() {
    try {
      return (await this.req("GET", `${this.base()}/git/ref/heads/${encodeURIComponent(this.branch)}`)).object.sha;
    } catch (e) {
      if (e.status === 404 || e.status === 409) return null;
      throw e;
    }
  }
  async loadTree(force = false) {
    const h = await this.head();
    if (!force && h && h === this.headSha) return false;
    if (!h) { this.entries = new Map(); this.dirSet = new Set(); this.headSha = null; this.treeSha = null; return true; }
    const commit = await this.req("GET", `${this.base()}/git/commits/${h}`);
    const tree = await this.req("GET", `${this.base()}/git/trees/${commit.tree.sha}?recursive=1`);
    this.entries = new Map(); this.dirSet = new Set();
    for (const e of tree.tree) {
      if (e.type === "blob") this.entries.set(e.path, { sha: e.sha, size: e.size || 0 });
      else if (e.type === "tree") this.dirSet.add(e.path);
    }
    this.headSha = h; this.treeSha = commit.tree.sha;
    return true;
  }
  async blobBytes(sha) {
    const cached = await idbGet("blob:" + sha).catch(() => null);
    if (cached) return cached;
    const b = await this.req("GET", `${this.base()}/git/blobs/${sha}`);
    const bytes = b.encoding === "base64" ? b64decode(b.content) : enc.encode(b.content);
    idbSet("blob:" + sha, bytes).catch(() => {});
    return bytes;
  }

  async info() {
    if (!this.branch) await this.init(); else await this.loadTree();
    const empty = ![...this.entries.keys()].some((p) => /\.md$/i.test(p) && !hidden(p));
    return { app: "panel", version: APP_VERSION, vault: `github.com/${this.owner}/${this.repo}`, vaultName: this.repo, empty, legacy: null, platform: "web", private: this.isPrivate };
  }
  async files() {
    await this.loadTree();
    const files = [];
    for (const [path, e] of this.entries) if (!hidden(path)) files.push({ path, mtime: 0, size: e.size, etag: e.sha });
    return { files, dirs: [...this.dirSet].filter((d) => !hidden(d)) };
  }
  async read(paths) {
    const out = {};
    let i = 0;
    const worker = async () => {
      while (i < paths.length) {
        const p = paths[i++];
        const e = this.entries.get(p);
        if (!e) { out[p] = null; continue; }
        const bytes = await this.blobBytes(e.sha);
        out[p] = { content: norm(dec.decode(bytes)), etag: e.sha, mtime: 0, size: bytes.length };
      }
    };
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
    return out;
  }

  /** One atomic commit. changes: [{path, content} | {path, base64} | {path, sha} | {path, sha: null}] */
  async commit(changes, message) {
    const tree = [];
    for (const c of changes) {
      if ("content" in c) tree.push({ path: c.path, mode: "100644", type: "blob", content: c.content });
      else if ("base64" in c) {
        const blob = await this.req("POST", `${this.base()}/git/blobs`, { content: c.base64, encoding: "base64" });
        tree.push({ path: c.path, mode: "100644", type: "blob", sha: blob.sha });
        c.sha = blob.sha;
      } else tree.push({ path: c.path, mode: "100644", type: "blob", sha: c.sha });
    }
    const t = await this.req("POST", `${this.base()}/git/trees`, { base_tree: this.treeSha, tree });
    const commit = await this.req("POST", `${this.base()}/git/commits`, { message, tree: t.sha, parents: this.headSha ? [this.headSha] : [] });
    try {
      await this.req("PATCH", `${this.base()}/git/refs/heads/${encodeURIComponent(this.branch)}`, { sha: commit.sha, force: false });
    } catch (e) {
      if (e.status === 422 || e.status === 409) throw new ApiError("retry", 409, { reason: "retry" });
      throw e;
    }
    this.headSha = commit.sha; this.treeSha = t.sha;
    for (const c of changes) {
      if ("content" in c) {
        const bytes = enc.encode(c.content);
        c.sha = await gitBlobSha(bytes);
        this.entries.set(c.path, { sha: c.sha, size: bytes.length });
      } else if (c.sha === null) this.entries.delete(c.path);
      else this.entries.set(c.path, { sha: c.sha, size: this.entries.get(c.path)?.size || 0 });
      const parts = c.path.split("/");
      for (let k = 1; k < parts.length; k++) this.dirSet.add(parts.slice(0, k).join("/"));
    }
    return changes;
  }
  /** Retry an operation when another device committed at the same time. */
  async withRetry(fn) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await this.loadTree();
      try { return await fn(); } catch (e) {
        if (e.data && e.data.reason === "retry") { this.headSha = null; continue; }
        throw e;
      }
    }
    throw new ApiError("GitHub: too many concurrent changes, try again", 409);
  }

  write(path, content, opts = {}) {
    return this.q(() => this.withRetry(async () => {
      if (hidden(path) || !/\.md$/i.test(path)) throw new ApiError("path not allowed", 400);
      const cur = this.entries.get(path);
      if (opts.create && cur) throw new ApiError("exists", 409, { reason: "exists" });
      if ("etag" in opts && opts.etag !== (cur ? cur.sha : null)) {
        const text = cur ? norm(dec.decode(await this.blobBytes(cur.sha))) : null;
        throw new ApiError("conflict", 409, { reason: "conflict", etag: cur ? cur.sha : null, content: text });
      }
      const text = content.replace(/\r\n/g, "\n");
      const [c] = await this.commit([{ path, content: text }], "Panel: " + path);
      return { path, etag: c.sha, mtime: Date.now(), size: enc.encode(text).length };
    }));
  }
  under(path) { return [...this.entries.keys()].filter((p) => p === path || p.startsWith(path + "/")); }
  move(from, to) {
    return this.q(() => this.withRetry(async () => {
      const src = this.under(from);
      if (!src.length) throw new ApiError("not found", 404);
      if (this.under(to).length) throw new ApiError("exists", 409, { reason: "exists" });
      const changes = [];
      for (const p of src) {
        changes.push({ path: to + p.slice(from.length), sha: this.entries.get(p).sha });
        changes.push({ path: p, sha: null });
      }
      await this.commit(changes, `Panel: move ${from} → ${to}`);
      for (const d of [...this.dirSet]) if (d === from || d.startsWith(from + "/")) this.dirSet.delete(d);
      return { path: to };
    }));
  }
  remove(path) {
    return this.q(() => this.withRetry(async () => {
      const src = this.under(path);
      if (!src.length) throw new ApiError("not found", 404);
      const trash = `.trash/${stamp()}_${path.replace(/\//g, "__")}`;
      const changes = [];
      for (const p of src) {
        changes.push({ path: trash + p.slice(path.length), sha: this.entries.get(p).sha });
        changes.push({ path: p, sha: null });
      }
      await this.commit(changes, `Panel: delete ${path}`);
      for (const d of [...this.dirSet]) if (d === path || d.startsWith(path + "/")) this.dirSet.delete(d);
      return { trash };
    }));
  }
  upload(name, blob) {
    return this.q(() => this.withRetry(async () => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const path = assetPath(name, (p) => this.entries.has(p));
      await this.commit([{ path, base64: b64encode(bytes) }], "Panel: " + path);
      return { path };
    }));
  }
  assetUrl() { return null; }
  async assetBlobUrl(path) {
    if (this.urls.has(path)) return this.urls.get(path);
    const e = this.entries.get(path);
    if (!e) return null;
    const url = URL.createObjectURL(new Blob([await this.blobBytes(e.sha)], { type: mimeOf(path) }));
    this.urls.set(path, url);
    return url;
  }
}

/* ======================================================================= current */

export let backend = null;
export function setBackend(b) { backend = b; }

/** Local server when the page is served by it; otherwise a saved web backend (or null). */
export async function detectBackend() {
  if (/^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname)) {
    try {
      const r = await fetch("/api/info", { cache: "no-store" });
      const j = await r.json();
      if (j.app === "panel") return { backend: new ServerBackend() };
    } catch (e) { /* not the Python server (e.g. a static dev server) */ }
  }
  const gh = await GitHubBackend.restore().catch(() => null);
  if (gh) return { backend: gh };
  if (FolderBackend.supported()) {
    const f = await FolderBackend.restore().catch(() => null);
    if (f) return f;
  }
  return { backend: null };
}

export { slugify };
