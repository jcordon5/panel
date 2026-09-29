// Markdown editor: live preview, autosave, list continuation, [[link]]
// autocomplete, paste/drop images. Edits the body; frontmatter stays intact.

import { h, debounce, today, dirname, relativePath, fold, basename } from "../util.js";
import { icon } from "../icons.js";
import { t } from "../i18n.js";
import { vault, P } from "../model.js";
import { parseDoc, setFm } from "../frontmatter.js";
import { renderMarkdown } from "../markdown.js";
import { store, write, upload, onChange, content } from "../store.js";
import { backend } from "../backends.js";
import { crumbs } from "./doc.js";
import { propertiesDialog } from "./dialogs.js";
import { go, route } from "../nav.js";
import { state, savePrefs } from "../state.js";
import { toast, errorToast, emptyState } from "../ui.js";

export const live = false; // the app must not re-render us while typing
export const title = (r) => "✎ " + (vault().docs.get(r.arg)?.title || "");

let session = null;

export function leave() {
  if (!session) return;
  session.flush();
  session.dispose();
  session = null;
}

window.addEventListener("beforeunload", (e) => {
  if (session && session.dirty()) { session.flush(); e.preventDefault(); e.returnValue = ""; }
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") session?.flush(); });

/* ------------------------------------------------------------ text helpers */

function edit(ta, start, end, text, selStart, selEnd) {
  ta.focus();
  ta.setSelectionRange(start, end);
  const ok = text === "" ? document.execCommand("delete") : document.execCommand("insertText", false, text);
  if (!ok) { ta.setRangeText(text, start, end, "end"); ta.dispatchEvent(new Event("input")); }
  if (selStart !== undefined) ta.setSelectionRange(selStart, selEnd ?? selStart);
}

function lineBounds(v, pos) {
  const s = v.lastIndexOf("\n", pos - 1) + 1;
  let e = v.indexOf("\n", pos);
  if (e < 0) e = v.length;
  return [s, e];
}

function selectedLines(ta) {
  const v = ta.value;
  const [s] = lineBounds(v, ta.selectionStart);
  const [, e] = lineBounds(v, ta.selectionEnd > ta.selectionStart && v[ta.selectionEnd - 1] === "\n" ? ta.selectionEnd - 1 : ta.selectionEnd);
  return [s, e];
}

function mapLines(ta, fn) {
  const [s, e] = selectedLines(ta);
  const block = ta.value.slice(s, e);
  const out = block.split("\n").map(fn).join("\n");
  edit(ta, s, e, out, s, s + out.length);
}

function wrap(ta, before, after = before, placeholder = "") {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const sel = value.slice(s, e) || placeholder;
  if (value.slice(s - before.length, s) === before && value.slice(e, e + after.length) === after) {
    edit(ta, s - before.length, e + after.length, sel, s - before.length, s - before.length + sel.length);
    return;
  }
  edit(ta, s, e, before + sel + after, s + before.length, s + before.length + sel.length);
}

function togglePrefix(ta, prefix, re) {
  const [s, e] = selectedLines(ta);
  const lines = ta.value.slice(s, e).split("\n");
  const all = lines.every((l) => !l.trim() || re.test(l));
  mapLines(ta, (l) => {
    if (!l.trim()) return l;
    if (all) return l.replace(re, "$1");
    const ind = /^\s*/.exec(l)[0];
    return ind + prefix + l.slice(ind.length).replace(/^([-*+]\s+(\[[ xX]\]\s+)?|>\s?|\d+[.)]\s+)/, "");
  });
}

const LIST_RE = /^(\s*)([-*+]|(\d+)([.)]))\s+(\[[ xX]\]\s+)?/;

function onEnter(ta, e) {
  const { selectionStart: s, selectionEnd: se, value } = ta;
  if (s !== se) return false;
  const [ls] = lineBounds(value, s);
  const line = value.slice(ls, s);
  const m = LIST_RE.exec(line);
  if (!m) return false;
  e.preventDefault();
  if (line.trim() === m[0].trim()) {
    // empty item: end the list
    edit(ta, ls, s, m[1].length >= 2 ? m[1].slice(2) + (m[3] ? `${+m[3]}${m[4]} ` : m[2] + " ") + (m[5] ? "[ ] " : "") : "");
    return true;
  }
  const marker = m[3] ? `${+m[3] + 1}${m[4]}` : m[2];
  edit(ta, s, s, "\n" + m[1] + marker + " " + (m[5] ? "[ ] " : ""));
  return true;
}

function toggleTaskAtCursor(ta) {
  const [s, e] = lineBounds(ta.value, ta.selectionStart);
  const line = ta.value.slice(s, e);
  const m = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/.exec(line);
  if (m) {
    const pos = ta.selectionStart;
    edit(ta, s + m[1].length, s + m[1].length + 3, m[2] === " " ? "[x]" : "[ ]", pos);
  } else togglePrefix(ta, "- [ ] ", /^(\s*)[-*+]\s+\[[ xX]\]\s+/);
}

/* caret coordinates inside a textarea (mirror div technique) */
function caretXY(ta, pos) {
  const cs = getComputedStyle(ta);
  const div = document.createElement("div");
  for (const p of ["boxSizing", "width", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderLeftWidth", "tabSize", "whiteSpace", "wordWrap", "wordBreak"]) div.style[p] = cs[p];
  div.style.position = "absolute"; div.style.visibility = "hidden"; div.style.whiteSpace = "pre-wrap"; div.style.overflowWrap = "break-word";
  div.textContent = ta.value.slice(0, pos);
  const span = document.createElement("span");
  span.textContent = "​";
  div.append(span);
  document.body.append(div);
  const r = ta.getBoundingClientRect();
  const x = r.left + span.offsetLeft - ta.scrollLeft;
  const y = r.top + span.offsetTop - ta.scrollTop + parseFloat(cs.lineHeight || "20");
  div.remove();
  return { x, y };
}

/* ------------------------------------------------------------ render */

export function render(root, r) {
  leave();
  const path = r.arg;
  const v = vault();
  const doc = v.docs.get(path);
  const file = store.files.get(path);
  if (!doc || !file) {
    root.append(emptyState("file", t("doc.notFound"), path));
    return;
  }
  const parsed = parseDoc(file.content);
  let fmPart = file.content.slice(0, file.content.length - parsed.body.length);
  let baseEtag = file.etag;
  let saved = parsed.body;
  let touched = false;
  let conflict = false;
  const mode = () => state.prefs.editorMode || (innerWidth >= 1100 ? "split" : "write");

  const status = h("span", { class: "editor-status" }, t("editor.saved"));
  const setStatus = (key, cls = "") => { status.textContent = t(key); status.className = "editor-status " + cls; };

  const ta = h("textarea", { class: "editor-text", spellcheck: "true", "aria-label": t("editor.body"), placeholder: t("editor.placeholder") });
  const lead = parsed.body.startsWith("\n") ? "\n" : "";
  // A leading "# Title" that repeats the title is edited through the title field
  let h1 = "";
  const isTemplate = doc.kind === "template";
  const split = (body) => {
    if (isTemplate) return ["", body];
    const m = /^(#[ \t]+(.+?)[ \t]*\n(?:[ \t]*\n)?)/.exec(body);
    if (m && fold(m[2]).startsWith(fold(doc.title))) return [m[1], body.slice(m[1].length)];
    return ["", body];
  };
  [h1, ta.value] = split(parsed.body.replace(/^\n/, ""));
  saved = ta.value;
  const preview = h("div", { class: "editor-preview md" });
  const banner = h("div", { class: "editor-banner", hidden: true });

  const refreshPreview = debounce(() => {
    preview.innerHTML = renderMarkdown(ta.value, { path, interactive: false }) || `<p class="muted">${t("editor.previewEmpty")}</p>`;
  }, 120);

  const titleInput = h("input", { class: "editor-title", value: isTemplate ? t("tpl.editing", { name: doc.name }) : doc.title, readonly: isTemplate, "aria-label": t("common.title"), placeholder: t("common.title") });

  async function save() {
    if (conflict) return;
    const body = ta.value;
    let fm = fmPart;
    if (!touched && fm) { fm = setFm(fm, { updated: today() }); touched = true; fmPart = fm; }
    const full = fm + lead + h1 + body + (body && !body.endsWith("\n") ? "\n" : "");
    if (body === saved && !titleDirty) return;
    setStatus("editor.saving", "saving");
    try {
      const res = await write(path, full, { etag: baseEtag });
      baseEtag = res.etag;
      saved = body;
      titleDirty = false;
      setStatus("editor.saved", "ok");
    } catch (e) {
      if (e.status === 409) { showConflict(); return; }
      setStatus("editor.error", "error");
      errorToast(e);
    }
  }
  const autosave = debounce(save, backend.saveDelay || 700);

  let titleDirty = false;
  titleInput.addEventListener("input", () => {
    const newTitle = titleInput.value.trim();
    if (!newTitle) return;
    const d = parseDoc(fmPart + "x");
    const old = typeof d.fm.title === "string" ? d.fm.title : doc.title;
    fmPart = setFm(fmPart || "", { title: newTitle });
    if (!fmPart.endsWith("\n")) fmPart += "\n";
    // keep the hidden "# Title" line in sync
    if (h1) h1 = "# " + newTitle + "\n\n";
    void old;
    titleDirty = true;
    setStatus("editor.unsaved");
    autosave();
  });
  titleInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ta.focus(); } });

  function showConflict() {
    conflict = true;
    setStatus("editor.conflict", "error");
    banner.hidden = false;
    banner.replaceChildren(icon("alert", 16), h("span", {}, t("editor.conflictText")),
      h("button", { class: "btn btn-sm", type: "button", onclick: () => { const c = store.files.get(path); if (c) { const pd = parseDoc(c.content); [h1, ta.value] = split(pd.body.replace(/^\n/, "")); saved = ta.value; baseEtag = c.etag; fmPart = c.content.slice(0, c.content.length - pd.body.length); } conflict = false; banner.hidden = true; refreshPreview(); setStatus("editor.saved", "ok"); } }, t("editor.reload")),
      h("button", { class: "btn btn-sm btn-danger", type: "button", onclick: async () => { const c = store.files.get(path); baseEtag = c ? c.etag : null; conflict = false; banner.hidden = true; saved = null; await save(); } }, t("editor.overwrite")));
  }

  // external changes (another app, an AI agent...) while editing
  const off = onChange(() => {
    const c = store.files.get(path);
    if (!c || c.etag === baseEtag) return;
    if (ta.value === saved) {
      const pos = ta.selectionStart;
      const pd = parseDoc(c.content);
      [h1, ta.value] = split(pd.body.replace(/^\n/, ""));
      saved = ta.value;
      fmPart = c.content.slice(0, c.content.length - pd.body.length);
      baseEtag = c.etag;
      ta.setSelectionRange(Math.min(pos, ta.value.length), Math.min(pos, ta.value.length));
      refreshPreview();
      toast(t("editor.reloaded"));
    } else showConflict();
  });

  ta.addEventListener("input", () => { setStatus("editor.unsaved"); autosave(); refreshPreview(); ac.update(); });

  /* ---------- keyboard */
  ta.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (ac.handle(e)) return;
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); autosave.flush(); toast(t("editor.saved")); return; }
    if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); wrap(ta, "**", "**", t("editor.bold")); return; }
    if (mod && e.key.toLowerCase() === "i") { e.preventDefault(); wrap(ta, "*", "*", t("editor.italic")); return; }
    if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); e.stopPropagation(); insertLink(); return; }
    if (mod && e.key === "Enter") { e.preventDefault(); toggleTaskAtCursor(ta); return; }
    if (e.key === "Escape") { e.preventDefault(); done(); return; }
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !mod) { if (onEnter(ta, e)) return; }
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) mapLines(ta, (l) => l.replace(/^( {1,2}|\t)/, ""));
      else if (ta.selectionStart === ta.selectionEnd && !LIST_RE.test(ta.value.slice(...lineBounds(ta.value, ta.selectionStart)))) edit(ta, ta.selectionStart, ta.selectionEnd, "  ");
      else mapLines(ta, (l) => "  " + l);
    }
  });

  /* ---------- paste / drop images */
  async function insertFiles(files) {
    for (const f of files) {
      if (!/^image\/|application\/pdf/.test(f.type)) continue;
      try {
        setStatus("editor.uploading", "saving");
        const p = await upload(f);
        const rel = relativePath(dirname(path), p).split("/").map((s) => (/\s/.test(s) ? encodeURIComponent(s) : s)).join("/");
        const md = f.type === "application/pdf" ? `[${basename(p)}](${rel})` : `![](${rel})`;
        edit(ta, ta.selectionStart, ta.selectionEnd, md + "\n");
      } catch (err) { errorToast(err); }
    }
  }
  ta.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); insertFiles(files); return; }
    const text = e.clipboardData?.getData("text") || "";
    if (/^https?:\/\/\S+$/.test(text.trim()) && ta.selectionStart !== ta.selectionEnd) {
      e.preventDefault();
      wrap(ta, "[", "](" + text.trim() + ")");
    }
  });
  ta.addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); });
  ta.addEventListener("drop", (e) => {
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) { e.preventDefault(); insertFiles(files); }
  });

  function insertLink() {
    const { selectionStart: s, selectionEnd: e2, value } = ta;
    const sel = value.slice(s, e2);
    if (/^https?:\/\//.test(sel)) edit(ta, s, e2, `[](${sel})`, s + 1);
    else { const txt = `[${sel || t("editor.linkText")}](https://)`; edit(ta, s, e2, txt, s + txt.length - 9, s + txt.length - 1); }
  }

  /* ---------- [[ autocomplete */
  const ac = (() => {
    let box = null, items = [], idx = 0, from = -1;
    const close = () => { box?.remove(); box = null; from = -1; };
    const pick = (i) => {
      const it = items[i];
      if (!it) return;
      const s = ta.selectionStart;
      const after = ta.value.slice(s, s + 2) === "]]" ? "" : "]]";
      edit(ta, from, s, it.insert + after, from + it.insert.length + 2);
      close();
    };
    const update = () => {
      const s = ta.selectionStart;
      const before = ta.value.slice(Math.max(0, s - 80), s);
      const m = /\[\[([^\]\n[]*)$/.exec(before);
      if (!m) { close(); return; }
      from = s - m[1].length;
      const q = fold(m[1]);
      const all = [...vault().docs.values()].filter((d) => d.path !== path && d.kind !== "template");
      items = all.map((d) => ({ d, score: fold(d.title).startsWith(q) ? 0 : fold(d.title).includes(q) ? 1 : fold(d.path).includes(q) ? 2 : 9 }))
        .filter((x) => x.score < 9).sort((a, b) => a.score - b.score || b.d.mtime - a.d.mtime).slice(0, 8)
        .map(({ d }) => ({ label: d.title, sub: d.path, insert: vault().byName.get(fold(d.name.replace(/\.md$/, ""))) === d.path ? d.name.replace(/\.md$/, "") : d.path.replace(/\.md$/, "") }));
      if (!items.length) { close(); return; }
      idx = Math.min(idx, items.length - 1);
      if (!box) { box = h("div", { class: "ac-box", role: "listbox" }); document.getElementById("overlays").append(box); }
      box.replaceChildren(...items.map((it, i) => h("div", { class: "ac-item" + (i === idx ? " active" : ""), role: "option", onmousedown: (e) => { e.preventDefault(); pick(i); } },
        h("span", { class: "ac-label" }, it.label), h("span", { class: "ac-sub" }, it.sub))));
      const { x, y } = caretXY(ta, s);
      box.style.left = Math.min(x, innerWidth - 320) + "px";
      box.style.top = Math.min(y + 4, innerHeight - 260) + "px";
    };
    const handle = (e) => {
      if (!box) return false;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); idx = (idx + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length; update(); return true; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(idx); return true; }
      if (e.key === "Escape") { e.preventDefault(); close(); return true; }
      return false;
    };
    ta.addEventListener("blur", () => setTimeout(close, 150));
    return { update, handle, close };
  })();

  /* ---------- toolbar */
  const tb = (ic, label, fn) => h("button", { class: "icon-btn", type: "button", title: label, "aria-label": label, onmousedown: (e) => e.preventDefault(), onclick: fn }, icon(ic, 16));
  const imgInput = h("input", { type: "file", accept: "image/*,application/pdf", multiple: true, hidden: true, onchange: () => { insertFiles([...imgInput.files]); imgInput.value = ""; } });
  const toolbar = h("div", { class: "editor-toolbar", role: "toolbar" },
    tb("heading", t("editor.heading"), () => mapLines(ta, (l) => (/^###\s/.test(l) ? l.replace(/^###\s+/, "") : /^##\s/.test(l) ? l.replace(/^##/, "###") : "## " + l.replace(/^#+\s*/, "")))),
    tb("bold", t("editor.bold") + " (Ctrl+B)", () => wrap(ta, "**", "**", t("editor.bold"))),
    tb("italic", t("editor.italic") + " (Ctrl+I)", () => wrap(ta, "*", "*", t("editor.italic"))),
    h("span", { class: "tb-sep" }),
    tb("list", t("editor.list"), () => togglePrefix(ta, "- ", /^(\s*)[-*+]\s+(?!\[[ xX]\])/)),
    tb("list-checks", t("editor.task") + " (Ctrl+Enter)", () => toggleTaskAtCursor(ta)),
    tb("quote", t("editor.quote"), () => togglePrefix(ta, "> ", /^(\s*)>\s?/)),
    h("span", { class: "tb-sep" }),
    tb("link", t("editor.link") + " (Ctrl+K)", insertLink),
    tb("hash", t("editor.wikilink"), () => { edit(ta, ta.selectionStart, ta.selectionEnd, "[[", ta.selectionStart + 2); ac.update(); }),
    tb("code", t("editor.code"), () => (ta.value.slice(ta.selectionStart, ta.selectionEnd).includes("\n") ? wrap(ta, "```\n", "\n```") : wrap(ta, "`", "`"))),
    tb("image", t("editor.image"), () => imgInput.click()),
    imgInput);

  const panes = h("div", { class: "editor-panes mode-" + mode() }, h("div", { class: "editor-write" }, ta), preview);
  const modeBtn = (m, ic, label) => h("button", { class: "seg-btn" + (mode() === m ? " active" : ""), type: "button", "data-mode": m, title: label, "aria-label": label, onclick: (e) => {
    state.prefs.editorMode = m; savePrefs();
    panes.className = "editor-panes mode-" + m;
    e.currentTarget.parentElement.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b === e.currentTarget));
    if (m !== "preview") ta.focus();
  } }, icon(ic, 15));

  function done() {
    autosave.flush();
    go(route.doc(path));
  }

  root.append(
    h("div", { class: "doc-top editor-top" }, crumbs(doc), h("div", { class: "page-actions" },
      status,
      h("div", { class: "seg" }, modeBtn("write", "pencil", t("editor.modeWrite")), modeBtn("split", "split", t("editor.modeSplit")), modeBtn("preview", "eye", t("editor.modePreview"))),
      h("button", { class: "icon-btn", type: "button", title: t("props.title"), "aria-label": t("props.title"), onclick: () => { autosave.flush(); propertiesDialog(vault().docs.get(path) || doc, (np) => { if (np !== path) go(route.edit(np)); else { const c = store.files.get(path); if (c) { fmPart = c.content.slice(0, c.content.length - parseDoc(c.content).body.length); baseEtag = c.etag; } } }); } }, icon("settings", 16)),
      h("button", { class: "btn btn-primary", type: "button", onclick: done }, icon("check", 15), t("editor.done")))),
    banner,
    h("div", { class: "editor" }, titleInput, toolbar, panes),
    h("div", { class: "editor-foot muted small" }, isTemplate ? t("tpl.placeholders") : t("editor.help")));

  refreshPreview.flush();
  // place the cursor: after the first "##" of a fresh template, else at the end
  requestAnimationFrame(() => {
    const onlyHeadings = ta.value.split("\n").every((l) => !l.trim() || /^#{1,6}\s/.test(l));
    let pos = ta.value.length;
    if (onlyHeadings) {
      const m = /^##\s.*\n\n?/m.exec(ta.value);
      if (m) pos = m.index + m[0].length;
    }
    ta.focus();
    ta.setSelectionRange(pos, pos);
    if (onlyHeadings) ta.scrollTop = 0; else ta.scrollTop = ta.scrollHeight;
  });

  session = {
    dirty: () => ta.value !== saved || titleDirty,
    flush: () => { if (ta.value !== saved || titleDirty) autosave.flush(); },
    dispose: () => { off(); ac.close(); autosave.cancel(); },
  };
  void P; void content;
}
