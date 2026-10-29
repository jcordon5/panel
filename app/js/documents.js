// Documents that live outside the vault (templates, guides, presentations…).
// documents.md in the vault lists their folders ("- /path" lines); Panel lists the files by name
// and opens them with their own app. Nothing is copied. Your AI reads the same documents.md.

import { h, debounce } from "./util.js";
import { parseDoc } from "./frontmatter.js";
import { icon } from "./icons.js";
import { t, relTime, lang } from "./i18n.js";
import { content } from "./store.js";
import { backend } from "./backends.js";
import * as A from "./actions.js";
import { field, toast, errorToast } from "./ui.js";

export const DOCS_FILE = "documents.md";
const LINE = /^\s*[-*]\s+`?([^`\n]+?)`?\s*$/;

export function docFolders() {
  return parseDoc(content(DOCS_FILE) || "").body.split("\n").map((l) => LINE.exec(l)?.[1]?.trim()).filter(Boolean);
}

function documentsText(folders) {
  const cur = content(DOCS_FILE);
  const list = folders.map((f) => "- " + f).join("\n");
  if (cur) {
    const lines = cur.replace(/\n+$/, "").split("\n").filter((l) => !LINE.test(l));
    return lines.join("\n").replace(/\n+$/, "") + "\n\n" + list + "\n";
  }
  return `---\ntype: documents\ntitle: ${t("docs.fileTitle")}\n---\n\n# ${t("docs.fileTitle")}\n\n${t("docs.fileIntro")}\n\n${list}\n`;
}

export const listDocs = (q = "") => backend.api("/api/docs?q=" + encodeURIComponent(q));
export const openDoc = (path) => backend.api("/api/open", { path }).catch(errorToast);

/** "file:///C:/x/y.docx" or "file:///Users/x/y.pdf" -> a local path */
export function fileUrlPath(href) {
  const p = decodeURIComponent(String(href).replace(/^file:\/\/(localhost)?/i, ""));
  return /^\/[A-Za-z]:\//.test(p) ? p.slice(1) : p;
}

/** Clicking a file: link anywhere opens the document with its app (browsers can't open them from a web page). */
export function bindFileLinks() {
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.("a[href^='file:'], a[data-open-file]");
    if (!a) return;
    e.preventDefault();
    openDoc(a.dataset.openFile || fileUrlPath(a.getAttribute("href")));
  }, true);
}

const EXT_ICON = { pdf: "file", doc: "file", docx: "file", xls: "week", xlsx: "week", csv: "week", ppt: "image", pptx: "image", png: "image", jpg: "image", jpeg: "image", md: "note", txt: "note" };

let lastQ = "";

/** Searchable list of the documents, with "open" and "copy path". */
export function documentsBrowser() {
  const wrap = h("div", { class: "docs-browser" });
  const search = h("input", { class: "input", type: "search", placeholder: t("docs.searchPh"), "data-focus-key": "docs-q", value: lastQ });
  const list = h("div", { class: "rows docs-list" });
  const note = h("div", { class: "muted small" });
  const run = debounce(async () => {
    try {
      const res = await listDocs(search.value.trim());
      note.textContent = res.missing.length ? t("docs.missing", { list: res.missing.join(", ") }) : "";
      if (!res.folders.length) {
        list.replaceChildren(h("div", { class: "empty-inline" }, icon("folder", 16), h("span", {}, t("docs.none")),
          h("button", { class: "btn btn-sm", type: "button", onclick: () => import("./views/settings.js").then((m) => m.openSettings("vault")) }, t("docs.addFolder"))));
        return;
      }
      list.replaceChildren(...(res.files.length ? res.files.map((f) => h("div", { class: "row doc-file" },
        h("span", { class: "row-icon" }, icon(EXT_ICON[f.ext] || "file", 16)),
        h("div", { class: "row-main" },
          h("a", { class: "row-title", href: "#", "data-open-file": f.path, title: f.path }, f.name),
          h("div", { class: "row-meta" }, h("span", {}, f.rel.split("/").slice(0, -1).join(" / ") || f.folder.split(/[\\/]/).pop()), h("span", {}, relTime(f.mtime)))),
        h("button", { class: "btn btn-sm btn-ghost", type: "button", title: t("docs.copyPath"), onclick: () => navigator.clipboard?.writeText(f.path).then(() => toast(t("common.copied"))) }, icon("copy", 13)),
        h("button", { class: "btn btn-sm", type: "button", "data-open-file": f.path }, t("docs.open"))))
        : [h("div", { class: "empty-inline" }, t("docs.noMatch"))]));
    } catch (e) { list.replaceChildren(h("div", { class: "text-danger small" }, e.message)); }
  }, 200);
  search.addEventListener("input", () => { lastQ = search.value; run(); });
  run();
  wrap.append(h("p", { class: "muted small" }, t("docs.help")), h("div", { class: "toolbar" }, search), note, list);
  return wrap;
}

/** Settings: the folders of documents.md. */
export function foldersBlock() {
  let folders = docFolders();
  const listEl = h("div", { class: "doc-folders" });
  const input = h("input", { class: "input mono", type: "text", placeholder: lang() === "es" ? "C:\\Users\\yo\\OneDrive\\Plantillas" : "/Users/me/Documents/Templates" });
  const save = async () => {
    try { await A.writeFileRaw(DOCS_FILE, documentsText(folders), t("docs.title")); toast(t("common.saved")); } catch (e) { errorToast(e); }
  };
  const paint = () => listEl.replaceChildren(...(folders.length ? folders.map((f, i) => h("div", { class: "doc-folder" }, icon("folder", 14), h("code", {}, f),
    h("button", { class: "chip-x", type: "button", "aria-label": t("common.remove"), onclick: () => { folders.splice(i, 1); paint(); save(); } }, icon("x", 11))))
    : [h("div", { class: "muted small" }, t("docs.noFolders"))]));
  const add = () => { const v = input.value.trim(); if (!v || folders.includes(v)) return; folders.push(v); input.value = ""; paint(); save(); };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
  paint();
  return h("div", {}, h("p", { class: "muted small" }, t("docs.settingsHelp")), listEl,
    field(t("docs.addFolder"), h("div", { class: "inline-input wide" }, input, h("button", { class: "btn", type: "button", onclick: add }, icon("plus", 14), t("common.add")))));
}
