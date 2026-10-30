// The vault is served by the local Python server (panel.bat / panel.sh). The rest of the app
// only talks to `backend`: info, files, read, write, move, remove, upload, assetUrl.
// Writes carry an etag so concurrent edits (Obsidian, an AI agent...) are detected
// instead of overwritten.

import { slugify } from "./util.js";

export const APP_VERSION = "3.1.2";

export class ApiError extends Error {
  constructor(msg, status, data) { super(msg); this.status = status; this.data = data || {}; }
}

function b64encode(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
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
  /** Restore: put a file back at its exact path. */
  writeBytes(path, bytes) { return this.api("/api/write-bytes", { path, data: b64encode(bytes) }); }
  /** Store an encrypted backup in the backup folder of the desktop version. */
  async saveBackup(name, bytes) {
    const res = await fetch("/api/backup/encrypted?name=" + encodeURIComponent(name), { method: "POST", headers: { "X-Panel": "1", "Content-Type": "application/octet-stream" }, body: bytes });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new ApiError(data.error || res.statusText, res.status, data);
    return data;
  }
  migrate(lang) { return this.api("/api/migrate", { lang }); }
  describe() { return null; }
}

/* ======================================================================= current */

export let backend = null;
export function setBackend(b) { backend = b; }

/** The local server that serves the app. */
export async function detectBackend() {
  return { backend: new ServerBackend() };
}

export { slugify };
