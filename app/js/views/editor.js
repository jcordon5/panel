// Markdown editor (CodeMirror 6): live preview à la Obsidian, Markdown source or reading
// mode, autosave, list continuation, [[link]] autocomplete, paste/drop images.
// Edits the body; frontmatter stays intact.

import {
  EditorView, EditorState, Compartment, Prec, keymap, StateEffect, drawSelection, dropCursor, placeholder,
  history, historyKeymap, defaultKeymap, indentMore, indentLess, indentUnit, LanguageSupport,
  markdownLanguage, insertNewlineContinueMarkup, deleteMarkupBackward,
  autocompletion, startCompletion, search, searchKeymap, highlightSelectionMatches,
} from "../../vendor/codemirror.js";
import { livePreview, mdHighlight } from "../livemd.js";
import { meetingBar } from "./meetbar.js";
import { openDoc, fileUrlPath } from "../documents.js";
import { h, debounce, today, dirname, relativePath, fold, basename, joinPath } from "../util.js";
import { icon } from "../icons.js";
import { t } from "../i18n.js";
import { vault, resolveLink } from "../model.js";
import { parseDoc, setFm } from "../frontmatter.js";
import { renderMarkdown } from "../markdown.js";
import { store, write, upload, onChange } from "../store.js";
import { backend } from "../backends.js";
import { crumbs } from "./doc.js";
import { propertiesDialog } from "./dialogs.js";
import { go, route, goReplace } from "../nav.js";
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

const sel = (view) => view.state.selection.main;

function insert(view, text, cursor) {
  const { from, to } = sel(view);
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + (cursor ?? text.length) }, scrollIntoView: true, userEvent: "input" });
  view.focus();
}

function wrap(view, before, after = before, placeholder = "") {
  const { from, to } = sel(view);
  const doc = view.state.doc;
  if (doc.sliceString(from - before.length, from) === before && doc.sliceString(to, to + after.length) === after) {
    view.dispatch({ changes: [{ from: from - before.length, to: from }, { from: to, to: to + after.length }], selection: { anchor: from - before.length, head: to - before.length } });
  } else {
    const text = doc.sliceString(from, to) || placeholder;
    view.dispatch({ changes: { from, to, insert: before + text + after }, selection: { anchor: from + before.length, head: from + before.length + text.length } });
  }
  view.focus();
}

/** Rewrite every selected line with fn(line). */
function mapLines(view, fn) {
  const { state } = view;
  const r = sel(view);
  const first = state.doc.lineAt(r.from);
  let last = state.doc.lineAt(r.to);
  if (r.to > r.from && r.to === last.from && last.number > first.number) last = state.doc.line(last.number - 1);
  const text = state.doc.sliceString(first.from, last.to);
  const out = text.split("\n").map(fn).join("\n");
  const delta = out.split("\n")[0].length - text.split("\n")[0].length;
  view.dispatch({
    changes: { from: first.from, to: last.to, insert: out },
    selection: r.empty ? { anchor: Math.max(first.from, r.head + delta) } : { anchor: first.from, head: first.from + out.length },
  });
  view.focus();
}

function togglePrefix(view, prefix, re) {
  const r = sel(view);
  const lines = view.state.doc.sliceString(view.state.doc.lineAt(r.from).from, view.state.doc.lineAt(r.to).to).split("\n");
  const all = lines.every((l) => !l.trim() || re.test(l));
  mapLines(view, (l) => {
    if (!l.trim()) return l;
    if (all) return l.replace(re, "$1");
    const ind = /^\s*/.exec(l)[0];
    return ind + prefix + l.slice(ind.length).replace(/^([-*+]\s+(\[[ xX]\]\s+)?|>\s?|\d+[.)]\s+)/, "");
  });
}

function toggleTask(view) {
  const line = view.state.doc.lineAt(sel(view).head);
  const m = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/.exec(line.text);
  if (!m) return togglePrefix(view, "- [ ] ", /^(\s*)[-*+]\s+\[[ xX]\]\s+/);
  const at = line.from + m[1].length + 1;
  view.dispatch({ changes: { from: at, to: at + 1, insert: m[2] === " " ? "x" : " " } });
}

function insertLink(view) {
  const { from, to } = sel(view);
  const text = view.state.doc.sliceString(from, to);
  if (/^https?:\/\//.test(text)) { view.dispatch({ changes: { from, to, insert: `[](${text})` }, selection: { anchor: from + 1 } }); view.focus(); return; }
  const label = text || t("editor.linkText");
  const md = `[${label}](https://)`;
  view.dispatch({ changes: { from, to, insert: md }, selection: { anchor: from + md.length - 9, head: from + md.length - 1 } });
  view.focus();
}

/** [[ autocompletion of note names */
function wikiCompletions(path) {
  return (ctx) => {
    const m = ctx.matchBefore(/\[\[[^\]\n[|#]*$/);
    if (!m) return null;
    const q = fold(m.text.slice(2));
    const v = vault();
    const options = [...v.docs.values()].filter((d) => d.path !== path && d.kind !== "template")
      .map((d) => ({ d, score: fold(d.title).startsWith(q) ? 0 : fold(d.title).includes(q) ? 1 : fold(d.path).includes(q) ? 2 : 9 }))
      .filter((x) => x.score < 9).sort((a, b) => a.score - b.score || b.d.mtime - a.d.mtime).slice(0, 12)
      .map(({ d }) => {
        const ins = v.byName.get(fold(d.name.replace(/\.md$/, ""))) === d.path ? d.name.replace(/\.md$/, "") : d.path.replace(/\.md$/, "");
        return {
          label: d.title, detail: d.path,
          apply: (view, _c, from, to) => {
            const close = view.state.sliceDoc(to, to + 2) === "]]" ? "" : "]]";
            view.dispatch({ changes: { from, to, insert: ins + close }, selection: { anchor: from + ins.length + 2 } });
          },
        };
      });
    return { from: m.from + 2, options, filter: false };
  };
}

/* ------------------------------------------------------------ render */

const MODES = ["live", "source", "preview"];
const currentMode = () => (MODES.includes(state.prefs.editorMode) ? state.prefs.editorMode : "live");

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
  let touched = false;
  let conflict = false;
  let mode = currentMode();

  const status = h("span", { class: "editor-status" }, t("editor.saved"));
  const setStatus = (key, cls = "") => { status.textContent = t(key); status.className = "editor-status " + cls; };

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
  let initial;
  [h1, initial] = split(parsed.body.replace(/^\n/, ""));
  let saved = initial;
  const preview = h("div", { class: "editor-preview md" });
  const banner = h("div", { class: "editor-banner", hidden: true });
  const host = h("div", { class: "editor-cm" });
  const value = () => view.state.doc.toString();

  const refreshPreview = debounce(() => {
    if (mode !== "preview") return;
    preview.innerHTML = renderMarkdown(value(), { path, interactive: false }) || `<p class="muted">${t("editor.previewEmpty")}</p>`;
  }, 120);

  const titleInput = h("input", { class: "editor-title", value: isTemplate ? t("tpl.editing", { name: doc.name }) : doc.title, readonly: isTemplate, "aria-label": t("common.title"), placeholder: t("common.title") });

  async function save() {
    if (conflict) return;
    const body = value();
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
    fmPart = setFm(fmPart || "", { title: newTitle });
    if (!fmPart.endsWith("\n")) fmPart += "\n";
    if (h1) h1 = "# " + newTitle + "\n\n"; // keep the hidden "# Title" line in sync
    titleDirty = true;
    setStatus("editor.unsaved");
    autosave();
  });
  titleInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); view.focus(); } });

  /** Replace the text without it counting as an edit (reload from disk). */
  let external = false;
  function setText(text, keepCursor = true) {
    const pos = Math.min(sel(view).head, text.length);
    external = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: keepCursor ? { anchor: pos } : undefined });
    external = false;
    refreshPreview();
  }

  function showConflict() {
    conflict = true;
    setStatus("editor.conflict", "error");
    banner.hidden = false;
    banner.replaceChildren(icon("alert", 16), h("span", {}, t("editor.conflictText")),
      h("button", { class: "btn btn-sm", type: "button", onclick: () => {
        const c = store.files.get(path);
        if (c) { const pd = parseDoc(c.content); let body; [h1, body] = split(pd.body.replace(/^\n/, "")); saved = body; baseEtag = c.etag; fmPart = c.content.slice(0, c.content.length - pd.body.length); setText(body); }
        conflict = false; banner.hidden = true; setStatus("editor.saved", "ok");
      } }, t("editor.reload")),
      h("button", { class: "btn btn-sm btn-danger", type: "button", onclick: async () => { const c = store.files.get(path); baseEtag = c ? c.etag : null; conflict = false; banner.hidden = true; saved = null; await save(); } }, t("editor.overwrite")));
  }

  // external changes (another app, an AI agent...) while editing
  const off = onChange(() => {
    const c = store.files.get(path);
    if (!c || c.etag === baseEtag) return;
    if (value() === saved) {
      const pd = parseDoc(c.content);
      let body;
      [h1, body] = split(pd.body.replace(/^\n/, ""));
      saved = body;
      fmPart = c.content.slice(0, c.content.length - pd.body.length);
      baseEtag = c.etag;
      setText(body);
      toast(t("editor.reloaded"));
    } else showConflict();
  });

  /* ---------- paste / drop images */
  async function insertFiles(files) {
    for (const f of files) {
      if (!/^image\/|application\/pdf/.test(f.type)) continue;
      try {
        setStatus("editor.uploading", "saving");
        const p = await upload(f);
        const rel = relativePath(dirname(path), p).split("/").map((x) => (/\s/.test(x) ? encodeURIComponent(x) : x)).join("/");
        insert(view, (f.type === "application/pdf" ? `[${basename(p)}](${rel})` : `![](${rel})`) + "\n");
      } catch (err) { errorToast(err); }
    }
  }

  function openLink(href, wiki) {
    if (!href) return;
    if (!wiki && /^file:/i.test(href)) { openDoc(fileUrlPath(href)); return; }
    if (!wiki && /^[a-z][a-z0-9+.-]*:/i.test(href)) { window.open(href, "_blank", "noopener"); return; }
    const target = resolveLink(wiki ? href : joinPath(dirname(path), decodeURIComponent(href.split("#")[0]))) || resolveLink(href);
    if (!target) { toast(t("editor.linkMissing", { name: href }), { error: true }); return; }
    if (/\.md$/i.test(target)) go(route.doc(target));
    else window.open(backend.assetUrl(target), "_blank", "noopener");
  }

  const modeConf = new Compartment();
  const modeExt = (m) => (m === "source" ? EditorView.editorAttributes.of({ class: "cm-source" }) : livePreview({ onLink: openLink }));

  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: initial,
      extensions: [
        history(),
        drawSelection(),
        dropCursor(),
        EditorView.lineWrapping,
        indentUnit.of("  "),
        new LanguageSupport(markdownLanguage),
        mdHighlight,
        modeConf.of(modeExt(mode)),
        placeholder(t("editor.placeholder")),
        autocompletion({ override: [wikiCompletions(path)], icons: false }),
        search({ top: true }),
        highlightSelectionMatches(),
        Prec.high(keymap.of([
          { key: "Mod-s", run: () => { autosave.flush(); toast(t("editor.saved")); return true; } },
          { key: "Mod-b", run: (vw) => { wrap(vw, "**", "**", t("editor.bold")); return true; } },
          { key: "Mod-i", run: (vw) => { wrap(vw, "*", "*", t("editor.italic")); return true; } },
          { key: "Mod-k", run: (vw) => { insertLink(vw); return true; } },
          { key: "Mod-Enter", run: (vw) => { toggleTask(vw); return true; } },
          { key: "Enter", run: insertNewlineContinueMarkup },
          { key: "Backspace", run: deleteMarkupBackward },
          { key: "Tab", run: indentMore, shift: indentLess },
        ])),
        keymap.of([...searchKeymap, ...historyKeymap, ...defaultKeymap, { key: "Escape", run: () => { done(); return true; } }]),
        EditorView.contentAttributes.of({ spellcheck: "true", "aria-label": t("editor.body") }),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged || external) return;
          setStatus("editor.unsaved");
          autosave();
          refreshPreview();
        }),
        EditorView.domEventHandlers({
          paste(e, vw) {
            const files = [...(e.clipboardData?.files || [])];
            if (files.length) { e.preventDefault(); insertFiles(files); return true; }
            const text = (e.clipboardData?.getData("text") || "").trim();
            if (/^https?:\/\/\S+$/.test(text) && !sel(vw).empty) { e.preventDefault(); wrap(vw, "[", "](" + text + ")"); return true; }
            return false;
          },
          drop(e) {
            const files = [...(e.dataTransfer?.files || [])];
            if (!files.length) return false;
            e.preventDefault();
            insertFiles(files);
            return true;
          },
        }),
      ],
    }),
  });

  /* ---------- toolbar */
  const tb = (ic, label, fn) => h("button", { class: "icon-btn", type: "button", title: label, "aria-label": label, onmousedown: (e) => e.preventDefault(), onclick: fn }, icon(ic, 16));
  const imgInput = h("input", { type: "file", accept: "image/*,application/pdf", multiple: true, hidden: true, onchange: () => { insertFiles([...imgInput.files]); imgInput.value = ""; } });
  const toolbar = h("div", { class: "editor-toolbar", role: "toolbar" },
    tb("heading", t("editor.heading"), () => mapLines(view, (l) => (/^###\s/.test(l) ? l.replace(/^###\s+/, "") : /^##\s/.test(l) ? l.replace(/^##/, "###") : "## " + l.replace(/^#+\s*/, "")))),
    tb("bold", t("editor.bold") + " (Ctrl+B)", () => wrap(view, "**", "**", t("editor.bold"))),
    tb("italic", t("editor.italic") + " (Ctrl+I)", () => wrap(view, "*", "*", t("editor.italic"))),
    h("span", { class: "tb-sep" }),
    tb("list", t("editor.list"), () => togglePrefix(view, "- ", /^(\s*)[-*+]\s+(?!\[[ xX]\])/)),
    tb("list-checks", t("editor.task") + " (Ctrl+Enter)", () => toggleTask(view)),
    tb("quote", t("editor.quote"), () => togglePrefix(view, "> ", /^(\s*)>\s?/)),
    h("span", { class: "tb-sep" }),
    tb("link", t("editor.link") + " (Ctrl+K)", () => insertLink(view)),
    tb("hash", t("editor.wikilink"), () => { insert(view, "[["); startCompletion(view); }),
    tb("code", t("editor.code"), () => (view.state.sliceDoc(sel(view).from, sel(view).to).includes("\n") ? wrap(view, "```\n", "\n```") : wrap(view, "`", "`"))),
    tb("image", t("editor.image"), () => imgInput.click()),
    imgInput);

  const panes = h("div", { class: "editor-panes mode-" + mode }, h("div", { class: "editor-write" }, host), preview);
  const seg = h("div", { class: "seg" });
  const setMode = (m) => {
    mode = m;
    state.prefs.editorMode = m; savePrefs();
    panes.className = "editor-panes mode-" + m;
    toolbar.classList.toggle("is-disabled", m === "preview");
    seg.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
    if (m === "preview") refreshPreview.flush();
    else { view.dispatch({ effects: modeConf.reconfigure(modeExt(m)) }); view.focus(); }
  };
  for (const [m, ic, label] of [["live", "pencil", "editor.modeLive"], ["source", "code", "editor.modeSource"], ["preview", "eye", "editor.modePreview"]]) {
    seg.append(h("button", { class: "seg-btn" + (mode === m ? " active" : ""), type: "button", "data-mode": m, title: t(label), "aria-label": t(label), onclick: () => setMode(m) }, icon(ic, 15)));
  }

  function done() {
    autosave.flush();
    goReplace(route.doc(path)); // going back from the document skips the editor
  }

  // meetings: a slim row in the sticky header with a button per section and the context, folded
  const bar = doc.kind === "meeting" ? meetingBar(doc, view) : null;
  if (bar) {
    const refresh = debounce(() => bar.refresh(), 400);
    view.dispatch({ effects: StateEffect.appendConfig.of(EditorView.updateListener.of((u) => { if (u.docChanged) refresh(); })) });
  }

  root.append(
    h("div", { class: "editor-top" + (bar ? " has-meeting-bar" : "") }, h("div", { class: "doc-top" }, crumbs(doc), h("div", { class: "page-actions" },
      status,
      seg,
      h("button", { class: "icon-btn", type: "button", title: t("props.title"), "aria-label": t("props.title"), onclick: () => { autosave.flush(); propertiesDialog(vault().docs.get(path) || doc, (np) => { if (np !== path) go(route.edit(np)); else { const c = store.files.get(path); if (c) { fmPart = c.content.slice(0, c.content.length - parseDoc(c.content).body.length); baseEtag = c.etag; } } }); } }, icon("settings", 16)),
      h("button", { class: "btn btn-primary", type: "button", onclick: done }, icon("check", 15), t("editor.done")))), bar || ""),
    banner,
    h("div", { class: "editor" + (bar ? " is-meeting" : "") }, titleInput, toolbar, panes),
    h("div", { class: "editor-foot muted small" }, isTemplate ? t("tpl.placeholders") : t("editor.help")));
  if (mode === "preview") { toolbar.classList.add("is-disabled"); refreshPreview.flush(); }

  // Where to start: where you were reading (from the document view), after the first "##" of a
  // fresh template, or at the top. Never jump to the end.
  const at = state.editAt && state.editAt.path === path ? state.editAt : null;
  state.editAt = null;
  requestAnimationFrame(() => {
    const text = value();
    let pos = 0, center = false;
    if (text.split("\n").every((l) => !l.trim() || /^#{1,6}\s/.test(l))) {
      const m = /^##\s.*\n\n?/m.exec(text);
      if (m) pos = Math.min(m.index + m[0].length, text.length);
    } else if (at && at.text) {
      const i = text.indexOf(at.text);
      if (i >= 0) { pos = i; center = true; }
    }
    if (center) view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
    else {
      view.dispatch({ selection: { anchor: pos } });
      if (at && at.ratio) {
        const sc = view.scrollDOM;
        sc.scrollTop = at.ratio * (sc.scrollHeight - sc.clientHeight);
        view.dispatch({ selection: { anchor: view.lineBlockAtHeight(sc.scrollTop).from } });
      }
    }
    if (matchMedia("(pointer: fine)").matches && mode !== "preview") view.focus(); // phones: no keyboard until you tap
  });

  session = {
    dirty: () => value() !== saved || titleDirty,
    flush: () => { if (value() !== saved || titleDirty) autosave.flush(); },
    dispose: () => { off(); autosave.cancel(); view.destroy(); },
  };
}
