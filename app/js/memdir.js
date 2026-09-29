// An in-memory directory with the same shape as a File System Access handle.
// Used for the web demo (nothing is saved) and in tests.

export function memDir(name = "demo") {
  const kids = new Map();
  const notFound = () => Object.assign(new Error("Not found"), { name: "NotFoundError" });
  return {
    kind: "directory", name, kids,
    async getDirectoryHandle(n, { create } = {}) {
      let d = kids.get(n);
      if (!d) { if (!create) throw notFound(); d = memDir(n); kids.set(n, d); }
      if (d.kind !== "directory") throw new TypeError("Not a directory");
      return d;
    },
    async getFileHandle(n, { create } = {}) {
      let f = kids.get(n);
      if (!f) { if (!create) throw notFound(); f = memFile(n); kids.set(n, f); }
      if (f.kind !== "file") throw new TypeError("Not a file");
      return f;
    },
    async removeEntry(n) { if (!kids.delete(n)) throw notFound(); },
    async *entries() { for (const e of [...kids]) yield e; },
    async queryPermission() { return "granted"; },
    async requestPermission() { return "granted"; },
  };
}

function memFile(name) {
  let bytes = new Uint8Array(), mtime = Date.now();
  return {
    kind: "file", name,
    async getFile() {
      const b = bytes;
      return { lastModified: mtime, size: b.length, arrayBuffer: async () => b.slice().buffer, text: async () => new TextDecoder().decode(b) };
    },
    async createWritable() {
      let buf = new Uint8Array();
      return {
        async write(d) {
          buf = d instanceof Uint8Array ? d : d instanceof ArrayBuffer ? new Uint8Array(d) : new Uint8Array(await d.arrayBuffer());
        },
        async close() { bytes = buf; mtime = Date.now(); },
      };
    },
  };
}
