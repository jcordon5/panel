// GitHub backend against an in-memory fake of the GitHub Git Data API. Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
if (!globalThis.navigator) globalThis.navigator = { language: "es-ES" };

/* ------------------------------------------------------------ fake GitHub */
function fakeGitHub() {
  const blobs = new Map(), trees = new Map(), commits = new Map();
  const gh = { head: null, calls: 0, blobs, trees };
  const sha1 = (s) => createHash("sha1").update(s).digest("hex");
  const blobSha = (buf) => sha1(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf]));
  const putBlob = (buf) => { const s = blobSha(buf); blobs.set(s, buf); return s; };
  const putTree = (map) => { const s = sha1(JSON.stringify([...map].sort())); trees.set(s, new Map(map)); return s; };
  const putCommit = (tree, parents) => { const s = sha1(tree + parents.join() + Math.random()); commits.set(s, { tree, parents }); return s; };
  gh.commitFiles = (files) => { // another device pushes directly
    const base = gh.head ? new Map(trees.get(commits.get(gh.head).tree)) : new Map();
    for (const [p, c] of Object.entries(files)) base.set(p, putBlob(Buffer.from(c)));
    gh.head = putCommit(putTree(base), gh.head ? [gh.head] : []);
  };
  gh.file = (p) => { const s = trees.get(commits.get(gh.head).tree).get(p); return s ? blobs.get(s).toString() : null; };
  gh.paths = () => [...trees.get(commits.get(gh.head).tree).keys()].sort();
  const ok = (o, status = 200) => ({ ok: true, status, statusText: "OK", json: async () => o });
  const err = (status, message) => ({ ok: false, status, statusText: "ERR", json: async () => ({ message }) });
  gh.fetch = async (url, init = {}) => {
    gh.calls++;
    assert.match(init.headers.Authorization, /^Bearer tok$/);
    const u = new URL(url);
    const p = u.pathname.replace("/repos/me/vault", "");
    const body = init.body ? JSON.parse(init.body) : null;
    const m = init.method || "GET";
    if (m === "GET" && p === "") return ok({ default_branch: "main", private: true, permissions: { push: true } });
    if (m === "GET" && p === "/git/ref/heads/main") return gh.head ? ok({ object: { sha: gh.head } }) : err(409, "Git Repository is empty.");
    if (m === "PUT" && p.startsWith("/contents/")) { gh.commitFiles({ [p.slice(10)]: Buffer.from(body.content, "base64").toString() }); return ok({}, 201); }
    let r;
    if (m === "GET" && (r = /^\/git\/commits\/(\w+)$/.exec(p))) return ok({ tree: { sha: commits.get(r[1]).tree } });
    if (m === "GET" && (r = /^\/git\/trees\/(\w+)$/.exec(p))) {
      const t = trees.get(r[1]);
      const dirs = new Set();
      for (const path of t.keys()) { const parts = path.split("/"); for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/")); }
      return ok({ tree: [...[...t].map(([path, sha]) => ({ path, sha, type: "blob", size: blobs.get(sha).length })), ...[...dirs].map((path) => ({ path, type: "tree" }))] });
    }
    if (m === "GET" && (r = /^\/git\/blobs\/(\w+)$/.exec(p))) return ok({ encoding: "base64", content: blobs.get(r[1]).toString("base64") });
    if (m === "POST" && p === "/git/blobs") return ok({ sha: putBlob(Buffer.from(body.content, "base64")) }, 201);
    if (m === "POST" && p === "/git/trees") {
      const t = new Map(trees.get(body.base_tree));
      for (const e of body.tree) {
        if (e.content !== undefined) t.set(e.path, putBlob(Buffer.from(e.content)));
        else if (e.sha === null) t.delete(e.path);
        else t.set(e.path, e.sha);
      }
      return ok({ sha: putTree(t) }, 201);
    }
    if (m === "POST" && p === "/git/commits") return ok({ sha: putCommit(body.tree, body.parents) }, 201);
    if (m === "PATCH" && p === "/git/refs/heads/main") {
      if (commits.get(body.sha).parents[0] !== gh.head) return err(422, "Update is not a fast forward");
      gh.head = body.sha;
      return ok({});
    }
    return err(404, "Not Found " + m + " " + p);
  };
  return gh;
}

const { GitHubBackend, gitBlobSha } = await import("../app/js/backends.js");

async function client(gh) {
  globalThis.fetch = gh.fetch;
  const b = new GitHubBackend({ owner: "me", repo: "vault", token: "tok" });
  await b.init();
  return b;
}

test("github: an empty repository gets a first commit and reports an empty vault", async () => {
  const gh = fakeGitHub();
  const b = await client(gh);
  assert.ok(gh.head);
  const info = await b.info();
  assert.equal(info.empty, true);
  assert.deepEqual((await b.files()).files, []); // the marker file is hidden
});

test("github: write, read back and etags equal git blob ids", async () => {
  const gh = fakeGitHub();
  const b = await client(gh);
  const r = await b.write("notes/a.md", "hola ñ\n", { etag: null });
  assert.equal(gh.file("notes/a.md"), "hola ñ\n");
  assert.equal(r.etag, await gitBlobSha(new TextEncoder().encode("hola ñ\n")));
  const files = await b.files();
  assert.deepEqual(files.files.map((f) => [f.path, f.etag]), [["notes/a.md", r.etag]]);
  assert.ok(files.dirs.includes("notes"));
  const read = await b.read(["notes/a.md", "missing.md"]);
  assert.equal(read["notes/a.md"].content, "hola ñ\n");
  assert.equal(read["missing.md"], null);
  await assert.rejects(b.write("notes/a.md", "x", { create: true }), (e) => e.status === 409 && e.data.reason === "exists");
});

test("github: a change from another device is detected (etag conflict) and a concurrent commit is retried", async () => {
  const gh = fakeGitHub();
  const b = await client(gh);
  const { etag } = await b.write("inbox.md", "v1\n");
  gh.commitFiles({ "inbox.md": "v2 from phone\n" });
  await assert.rejects(b.write("inbox.md", "v1 edited\n", { etag }), (e) => e.status === 409 && e.data.content === "v2 from phone\n");
  // a commit that races with ours on another file: our write is replayed on top
  const origFetch = gh.fetch;
  let raced = false;
  globalThis.fetch = async (url, init) => {
    if (!raced && init?.method === "PATCH") { raced = true; gh.commitFiles({ "notes/other.md": "x\n" }); }
    return origFetch(url, init);
  };
  await b.write("notes/mine.md", "mine\n");
  globalThis.fetch = origFetch;
  assert.equal(gh.file("notes/mine.md"), "mine\n");
  assert.equal(gh.file("notes/other.md"), "x\n");
});

test("github: move a folder and delete to .trash in single commits", async () => {
  const gh = fakeGitHub();
  const b = await client(gh);
  await b.write("projects/a/README.md", "# A\n");
  await b.write("projects/a/meetings/m.md", "m\n");
  const heads = new Set([gh.head]);
  await b.move("projects/a", "projects/b");
  heads.add(gh.head);
  assert.deepEqual(gh.paths().filter((p) => p.startsWith("projects")), ["projects/b/README.md", "projects/b/meetings/m.md"]);
  await b.remove("projects/b/meetings/m.md");
  assert.ok(gh.paths().some((p) => p.startsWith(".trash/") && p.endsWith("projects__b__meetings__m.md")));
  assert.ok(!gh.paths().includes("projects/b/meetings/m.md"));
  await assert.rejects(b.move("nope.md", "x.md"), (e) => e.status === 404);
});

test("github: uploads binary assets", async () => {
  const gh = fakeGitHub();
  const b = await client(gh);
  const bytes = new Uint8Array([137, 80, 78, 71, 0, 255]);
  const { path } = await b.upload("Captura 1.png", { arrayBuffer: async () => bytes.buffer });
  assert.match(path, /^assets\/\d{4}-\d{2}\/Captura-1\.png$/);
  assert.deepEqual([...gh.blobs.get(b.entries.get(path).sha)], [...bytes]);
});

/* ------------------------------------------------------------ fake File System Access API */
function fakeDir(name = "vault") {
  const kids = new Map();
  const dir = {
    kind: "directory", name, kids,
    async getDirectoryHandle(n, { create } = {}) {
      let d = kids.get(n);
      if (!d) { if (!create) throw Object.assign(new Error("NotFound"), { name: "NotFoundError" }); d = fakeDir(n); kids.set(n, d); }
      if (d.kind !== "directory") throw new TypeError("not a dir");
      return d;
    },
    async getFileHandle(n, { create } = {}) {
      let f = kids.get(n);
      if (!f) {
        if (!create) throw Object.assign(new Error("NotFound"), { name: "NotFoundError" });
        let bytes = new Uint8Array(), mtime = Date.now();
        f = {
          kind: "file", name: n,
          async getFile() { const b = bytes; return { lastModified: mtime, size: b.length, arrayBuffer: async () => b.slice().buffer, text: async () => new TextDecoder().decode(b) }; },
          async createWritable() {
            let buf = new Uint8Array();
            return {
              async write(d) { buf = d instanceof Uint8Array ? d : d instanceof ArrayBuffer ? new Uint8Array(d) : new Uint8Array(await d.arrayBuffer()); },
              async close() { bytes = buf; mtime = Date.now(); },
            };
          },
        };
        kids.set(n, f);
      }
      if (f.kind !== "file") throw new TypeError("not a file");
      return f;
    },
    async removeEntry(n) { if (!kids.delete(n)) throw new Error("NotFound"); },
    async *entries() { for (const e of kids) yield e; },
  };
  return dir;
}

const { FolderBackend } = await import("../app/js/backends.js");

test("folder: write/read/conflict/move/delete on a local folder", async () => {
  const root = fakeDir();
  const b = new FolderBackend(root);
  const r = await b.write("weeks/2026-W40.md", "## Lunes\n", { etag: null });
  const files = await b.files();
  assert.deepEqual(files.files.map((f) => f.path), ["weeks/2026-W40.md"]);
  assert.deepEqual(files.dirs, ["weeks"]);
  assert.equal((await b.read(["weeks/2026-W40.md"]))["weeks/2026-W40.md"].content, "## Lunes\n");
  // edited by another app meanwhile
  const fh = await (await root.getDirectoryHandle("weeks")).getFileHandle("2026-W40.md");
  const w = await fh.createWritable(); await w.write(new TextEncoder().encode("## Lunes\n- [ ] externa\n")); await w.close();
  await assert.rejects(b.write("weeks/2026-W40.md", "mine", { etag: r.etag }), (e) => e.status === 409 && /externa/.test(e.data.content));
  await b.write("projects/p/README.md", "# P\n");
  await b.move("projects/p", "projects/q");
  assert.ok((await b.files()).files.some((f) => f.path === "projects/q/README.md"));
  assert.ok(!(await b.files()).files.some((f) => f.path.startsWith("projects/p/")));
  await b.remove("projects/q/README.md");
  const trash = await root.getDirectoryHandle(".trash");
  assert.equal([...trash.kids.keys()].length, 1);
  assert.ok(!(await b.files()).files.some((f) => f.path.startsWith(".trash")));
});
