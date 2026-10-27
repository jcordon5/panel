// Encrypted backups of the vault: download one, restore one, and a daily automatic copy to a
// folder you choose (e.g. one synced by OneDrive or Google Drive). Everything is encrypted in
// the browser; the password never leaves it. See crypt.js for the file format.

import { h, slugify } from "./util.js";
import { icon } from "./icons.js";
import { t, relTime } from "./i18n.js";
import { store, sync, apiGet } from "./store.js";
import { backend, APP_VERSION } from "./backends.js";
import { makeZip, makeZipCompressed, readZip } from "./zip.js";
import { encryptBackup, decryptBackup, readHeader, deriveKey, newSalt, ITERATIONS, EXT, BadPassword, NotABackup } from "./crypt.js";
import { idbGet, idbSet, idbDel } from "./idb.js";
import { modal, field, toast, errorToast, confirmDialog } from "./ui.js";
import { state } from "./state.js";

const DAY = 24 * 3600 * 1000;
const NAME_RE = /^panel-backup-[\w.-]{1,120}\.panelbackup$/;
const RESTORE_EXT = /\.(md|txt|csv|json|png|jpe?g|gif|webp|svg|pdf|bmp)$/i; // same list as the desktop server
const KEEP_DEFAULT = 14;

/* ------------------------------------------------------------ password kept on this device */

/** The device keeps a key that can only ENCRYPT: with it Panel makes automatic copies, but nobody
 *  with access to this browser can open them. Restoring always asks for the password. */
export const savedKey = () => idbGet("backupKey").catch(() => null);
export const forgetKey = () => idbDel("backupKey");
async function rememberKey(password) {
  const salt = newSalt();
  const key = await deriveKey(password, salt, ITERATIONS, ["encrypt"]);
  await idbSet("backupKey", { key, salt, iterations: ITERATIONS, created: Date.now() });
}

/* ------------------------------------------------------------ making a backup */

/** Every file of the vault as [{ name: "vault/<path>", data }] */
export async function vaultFiles() {
  const enc = new TextEncoder();
  const files = [...store.files.entries()].map(([p, f]) => ({ name: "vault/" + p, data: enc.encode(f.content) }));
  for (const p of store.others.keys()) {
    const url = await backend.assetBlobUrl(p);
    if (url) files.push({ name: "vault/" + p, data: new Uint8Array(await (await fetch(url)).arrayBuffer()) });
  }
  return files;
}

const vaultLabel = () => slugify(store.info?.vaultName || backend.describe()?.label || "vault", 30) || "vault";
const stamp = () => { // local time: panel-backup-…-2026-10-27-1922
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

/** keyInfo: { password } or a saved { key, salt, iterations } */
export async function buildBackup(keyInfo) {
  const files = await vaultFiles();
  const zip = new Uint8Array(await (await makeZipCompressed(files)).arrayBuffer());
  const bytes = await encryptBackup(zip, { ...keyInfo, meta: { app: "panel", version: APP_VERSION, created: new Date().toISOString(), vault: vaultLabel(), files: files.length } });
  return { name: `panel-backup-${vaultLabel()}-${stamp()}${EXT}`, bytes, files: files.length };
}

function download(name, bytes, type = "application/octet-stream") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

/** Ask for a new backup password (twice), optionally keeping it on this device. */
export function passwordDialog({ title = t("backup.setPassword"), remember = true } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const p1 = h("input", { class: "input", type: "password", autocomplete: "new-password", autofocus: true });
    const p2 = h("input", { class: "input", type: "password", autocomplete: "new-password" });
    const keep = h("input", { type: "checkbox", checked: true });
    const err = h("div", { class: "text-danger small" });
    modal({
      title,
      body: [
        h("p", { class: "muted small" }, t("backup.passwordHelp")),
        field(t("backup.password"), p1),
        field(t("backup.passwordAgain"), p2),
        remember ? h("label", { class: "check-field" }, keep, h("span", {}, h("strong", {}, t("backup.remember")), " — ", t("backup.rememberHint"))) : null,
        h("p", { class: "backup-warn small" }, icon("alert", 14), " ", t("backup.noRecovery")),
        err,
      ],
      actions: [
        { label: t("common.cancel"), onClick: () => { done = true; resolve(null); } },
        { label: t("common.ok"), primary: true, onClick: () => {
          if (p1.value.length < 8) { err.textContent = t("backup.tooShort"); p1.focus(); return false; }
          if (p1.value !== p2.value) { err.textContent = t("backup.mismatch"); p2.focus(); return false; }
          done = true; resolve({ password: p1.value, remember: remember && keep.checked });
        } },
      ],
      onClose: () => { if (!done) resolve(null); },
    });
  });
}

async function busy(text, fn) {
  const el = h("div", { class: "busy-overlay" }, h("div", { class: "busy-box" }, h("div", { class: "boot-spinner" }), h("div", {}, text)));
  document.body.append(el);
  try { return await fn(); } finally { el.remove(); }
}

/** "Download encrypted backup": with the saved key, or asking for a password. */
export async function downloadBackup() {
  let keyInfo = await savedKey();
  if (!keyInfo) {
    const r = await passwordDialog({ title: t("backup.downloadTitle") });
    if (!r) return;
    if (r.remember) await rememberKey(r.password);
    keyInfo = r.remember ? await savedKey() : { password: r.password };
  }
  const b = await busy(t("backup.encrypting"), () => buildBackup(keyInfo));
  download(b.name, b.bytes);
  toast(t("backup.downloaded", { n: b.files }));
}

/* ------------------------------------------------------------ automatic copies */

/** Where automatic copies go: the desktop server's backup folder, or a folder picked in the browser. */
export function autoSupported() { return backend.kind === "server" || backend.kind === "folder"; }

export async function folderDest() { return backend.kind === "folder" ? idbGet("backupDest").catch(() => null) : null; }

export async function pickFolderDest() {
  const handle = await window.showDirectoryPicker({ id: "panel-backups", mode: "readwrite" });
  const cur = (await folderDest()) || {};
  await idbSet("backupDest", { ...cur, handle, auto: cur.auto ?? true });
  return handle;
}

async function saveToFolder(handle, name, bytes, keep) {
  const fh = await handle.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(bytes);
  await w.close();
  const names = [];
  for await (const [n, e] of handle.entries()) if (e.kind === "file" && NAME_RE.test(n)) names.push(n);
  names.sort();
  for (const old of names.slice(0, Math.max(0, names.length - keep))) await handle.removeEntry(old).catch(() => {});
}

/** Make a copy now into the automatic-backup folder. */
export async function backupNowToFolder() {
  const keyInfo = await savedKey();
  if (!keyInfo) throw new Error(t("backup.needPassword"));
  const b = await buildBackup(keyInfo);
  if (backend.kind === "server") return (await backend.saveBackup(b.name, b.bytes)).path;
  const dest = await folderDest();
  if (!dest?.handle) throw new Error(t("backup.noFolder"));
  if ((await dest.handle.queryPermission({ mode: "readwrite" })) !== "granted" && (await dest.handle.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error(t("backup.noPermission"));
  await saveToFolder(dest.handle, b.name, b.bytes, dest.keep || KEEP_DEFAULT);
  await idbSet("backupDest", { ...dest, last: Date.now() });
  return dest.handle.name + "/" + b.name;
}

/** Called when Panel starts and every few hours: one encrypted copy a day, silently. */
export async function maybeAutoBackup() {
  if (!autoSupported() || !(await savedKey())) return;
  if (backend.kind === "server") {
    const s = await apiGet("/api/settings");
    if (!s.autoBackup || (s.lastBackup && Date.now() - s.lastBackup < DAY * 0.95)) return;
  } else {
    const dest = await folderDest();
    if (!dest?.auto || !dest.handle || (dest.last && Date.now() - dest.last < DAY * 0.95)) return;
    if ((await dest.handle.queryPermission({ mode: "readwrite" })) !== "granted") return; // asked again on the next click
  }
  await backupNowToFolder();
  toast(t("backup.autoDone"));
}

let autoStarted = false;
export function startAutoBackups() {
  if (autoStarted) return;
  autoStarted = true;
  const go = () => maybeAutoBackup().catch((e) => console.warn("automatic backup:", e));
  setTimeout(go, 8000);
  setInterval(go, 3 * 3600 * 1000);
}

/** After a click (the browser needs one), ask again for access to the backup folder. */
export async function regrantFolderDest() {
  const dest = await folderDest();
  if (dest?.auto && dest.handle && (await dest.handle.queryPermission({ mode: "readwrite" })) === "prompt") {
    await dest.handle.requestPermission({ mode: "readwrite" }).catch(() => {});
  }
}

/* ------------------------------------------------------------ restore */

/** Vault files of a decrypted backup: [{ path, data }], unsafe or hidden paths left out. */
export async function backupEntries(zipBytes) {
  const out = [];
  for (const { name, data } of await readZip(zipBytes)) {
    const path = name.replace(/^vault\//, "");
    if (!path || path.split("/").some((p) => !p || p === ".." || p.startsWith(".")) || !RESTORE_EXT.test(path)) continue;
    out.push({ path, data });
  }
  return out;
}

/** What restoring would do: new files, files that would replace a different current version, unchanged. */
export function planRestore(entries) {
  const dec = new TextDecoder();
  const plan = { add: [], replace: [], same: 0 };
  for (const e of entries) {
    const cur = /\.md$/i.test(e.path) ? store.files.get(e.path) : null;
    if (cur) { if (cur.content === dec.decode(e.data).replace(/\r\n/g, "\n")) plan.same++; else plan.replace.push(e); }
    else if (store.others.has(e.path)) plan.same++; // attachments are never edited
    else plan.add.push(e);
  }
  return plan;
}

export async function applyRestore(plan) {
  const files = [...plan.replace, ...plan.add];
  if (backend.writeMany) await backend.writeMany(files, "Panel: restore backup"); // GitHub: one commit, history keeps the rest
  else {
    for (const f of plan.replace) await backend.remove(f.path); // current version -> .trash
    for (const f of files) await backend.writeBytes(f.path, f.data);
  }
  await sync();
  state.render();
}

/** Restore dialog: pick a .panelbackup, type its password, restore into this vault or save it as .zip. */
export function restoreDialog() {
  const fileInput = h("input", { class: "input", type: "file", accept: EXT + ",application/octet-stream" });
  const pass = h("input", { class: "input", type: "password", autocomplete: "current-password" });
  const info = h("div", { class: "backup-info small muted" });
  const err = h("div", { class: "text-danger small" });
  const result = h("div", { class: "backup-result" });
  let bytes = null, opened = null;

  fileInput.addEventListener("change", async () => {
    err.textContent = ""; info.textContent = ""; result.replaceChildren(); opened = null; bytes = null;
    const f = fileInput.files[0];
    if (!f) return;
    try {
      bytes = new Uint8Array(await f.arrayBuffer());
      const { header } = readHeader(bytes);
      info.textContent = t("backup.fileInfo", { date: header.created ? new Date(header.created).toLocaleString() : "?", n: header.files ?? "?", vault: header.vault || "?", version: header.version || "?" });
      pass.focus();
    } catch (e) { bytes = null; err.textContent = e instanceof NotABackup ? t("backup.notBackup") : e.message; }
  });

  const showResult = (entries, header) => {
    const plan = planRestore(entries);
    result.replaceChildren(
      h("p", { class: "text-ok small" }, icon("check", 14), " ", t("backup.opened", { n: entries.length })),
      h("p", { class: "small" }, t("backup.plan", { add: plan.add.length, replace: plan.replace.length, same: plan.same })),
      plan.replace.length ? h("p", { class: "muted small" }, t(backend.writeMany ? "backup.replaceGithub" : "backup.replaceTrash")) : null,
      h("div", { class: "row-actions" },
        h("button", { class: "btn btn-primary", type: "button", disabled: !(plan.add.length + plan.replace.length), onclick: async () => {
          if (plan.replace.length && !(await confirmDialog(t("backup.restoreConfirm", { n: plan.replace.length }), { ok: t("backup.restore"), danger: false }))) return;
          try {
            await busy(t("backup.restoring"), () => applyRestore(plan));
            dlg.close();
            toast(t("backup.restored", { n: plan.add.length + plan.replace.length }));
          } catch (e) { errorToast(e); }
        } }, icon("upload", 14), t("backup.restore")),
        h("button", { class: "btn", type: "button", title: t("backup.saveZipHint"), onclick: () => {
          download(`panel-vault-${(header.created || "").slice(0, 10) || "backup"}.zip`, makeZip(entries.map((e) => ({ name: "vault/" + e.path, data: e.data }))), "application/zip");
        } }, icon("download", 14), t("backup.saveZip"))));
  };

  const open = async () => {
    err.textContent = "";
    if (!bytes) { err.textContent = t("backup.pickFile"); return false; }
    if (!pass.value) { pass.focus(); return false; }
    try {
      opened = await busy(t("backup.decrypting"), async () => {
        const { header, data } = await decryptBackup(bytes, pass.value);
        return { header, entries: await backupEntries(data) };
      });
      showResult(opened.entries, opened.header);
    } catch (e) { err.textContent = e instanceof BadPassword ? t("backup.badPassword") : e.message; }
    return false; // keep the dialog open
  };

  const dlg = modal({
    title: t("backup.restoreTitle"),
    body: [h("p", { class: "muted small" }, t("backup.restoreHelp")), field(t("backup.file"), fileInput), info, field(t("backup.password"), pass), err, result],
    actions: [{ label: t("common.close") }, { label: t("backup.open"), primary: true, onClick: open }],
  });
}

/* ------------------------------------------------------------ settings pane */

export function backupPane() {
  const wrap = h("div", { class: "settings-block" });
  const keyRow = h("div", { class: "settings-info" });
  const auto = h("div", {});
  wrap.append(
    h("p", { class: "muted small" }, t("backup.intro")),
    keyRow,
    h("div", { class: "row-actions" },
      h("button", { class: "btn btn-primary", type: "button", onclick: () => downloadBackup().then(paintKey).catch(errorToast) }, icon("download", 14), t("backup.download")),
      h("button", { class: "btn", type: "button", onclick: restoreDialog }, icon("upload", 14), t("backup.restoreBtn"))),
    h("h3", { class: "settings-sub" }, icon("clock", 15), t("backup.autoTitle")),
    auto);

  async function paintKey() {
    const k = await savedKey();
    keyRow.replaceChildren(
      h("div", { class: "backup-key" + (k ? " is-set" : "") }, icon("lock", 14), k ? h("span", {}, t("backup.keySaved"), " ", h("span", { class: "muted small" }, "· " + relTime(k.created))) : h("span", { class: "muted" }, t("backup.keyNone"))),
      h("div", { class: "row-actions" },
        h("button", { class: "btn btn-sm", type: "button", onclick: async () => {
          const r = await passwordDialog({ title: k ? t("backup.changePassword") : t("backup.setPassword"), remember: false });
          if (!r) return;
          await rememberKey(r.password); toast(t("backup.keyStored")); paintKey(); paintAuto();
        } }, k ? t("backup.changePassword") : t("backup.setPassword")),
        k ? h("button", { class: "btn btn-sm btn-ghost", type: "button", onclick: async () => { await forgetKey(); paintKey(); paintAuto(); } }, t("backup.forget")) : null));
  }

  async function paintAuto() {
    if (!autoSupported()) { auto.replaceChildren(h("p", { class: "muted small" }, t(backend.kind === "github" ? "backup.autoGithub" : "backup.autoUnavailable"))); return; }
    const hasKey = !!(await savedKey());
    const nowBtn = h("button", { class: "btn btn-sm", type: "button", disabled: !hasKey, onclick: async () => {
      try { const p = await busy(t("backup.encrypting"), backupNowToFolder); toast(t("backup.savedTo", { path: p })); paintAuto(); } catch (e) { errorToast(e); }
    } }, t("backup.now"));
    if (backend.kind === "server") {
      const s = await apiGet("/api/settings");
      const enabled = h("input", { type: "checkbox", checked: s.autoBackup, disabled: !hasKey, onchange: () => backend.api("/api/settings", { autoBackup: enabled.checked }).catch(errorToast) });
      const dir = h("input", { class: "input mono", type: "text", value: s.backupDir });
      const keep = h("input", { class: "input input-auto", type: "number", min: "1", max: "365", value: String(s.backupKeep) });
      auto.replaceChildren(
        h("label", { class: "check-field" }, enabled, h("span", {}, h("strong", {}, t("backup.autoDaily")), " — ", t("backup.autoHint"))),
        hasKey ? null : h("p", { class: "muted small" }, t("backup.needPassword")),
        field(t("backup.folder"), dir, t("backup.folderHint")),
        field(t("backup.keep"), keep),
        h("div", { class: "row-actions" },
          h("button", { class: "btn btn-sm btn-primary", type: "button", onclick: async () => {
            try { await backend.api("/api/settings", { backupDir: dir.value.trim(), backupKeep: +keep.value || KEEP_DEFAULT }); toast(t("common.saved")); paintAuto(); } catch (e) { errorToast(e); }
          } }, t("common.save")),
          nowBtn),
        h("p", { class: "muted small" }, s.lastBackup ? t("backup.last", { when: relTime(s.lastBackup) }) : t("backup.never")));
      return;
    }
    const dest = await folderDest();
    const enabled = h("input", { type: "checkbox", checked: !!dest?.auto, disabled: !hasKey || !dest?.handle, onchange: async () => { await idbSet("backupDest", { ...(await folderDest()), auto: enabled.checked }); } });
    auto.replaceChildren(
      h("label", { class: "check-field" }, enabled, h("span", {}, h("strong", {}, t("backup.autoDaily")), " — ", t("backup.autoHintWeb"))),
      hasKey ? null : h("p", { class: "muted small" }, t("backup.needPassword")),
      h("div", { class: "settings-info" }, h("div", {}, h("span", { class: "muted" }, t("backup.folder") + ": "), dest?.handle ? h("code", {}, dest.handle.name) : h("span", { class: "muted" }, t("backup.noFolder")))),
      h("div", { class: "row-actions" },
        h("button", { class: "btn btn-sm", type: "button", onclick: async () => { try { await pickFolderDest(); paintAuto(); } catch (e) { if (e.name !== "AbortError") errorToast(e); } } }, icon("folder", 14), dest?.handle ? t("backup.changeFolder") : t("backup.pickFolder")),
        dest?.handle ? nowBtn : null),
      h("p", { class: "muted small" }, dest?.last ? t("backup.last", { when: relTime(dest.last) }) : t("backup.never")));
  }

  paintKey();
  paintAuto().catch((e) => auto.replaceChildren(h("p", { class: "text-danger small" }, e.message)));
  return wrap;
}
