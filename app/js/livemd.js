// Live preview for the editor, Obsidian style: Markdown is shown formatted while you
// type, and the syntax of whatever is under the cursor is revealed so it can be edited.
// Built on CodeMirror 6 decorations over the Markdown syntax tree.

import {
  EditorView, Decoration, WidgetType, StateField, StateEffect,
  syntaxTree, ensureSyntaxTree, HighlightStyle, syntaxHighlighting, tags,
} from "../vendor/codemirror.js";
import { renderMarkdown } from "./markdown.js";
import { resolveLink } from "./model.js";
import { backend } from "./backends.js";

/* ------------------------------------------------------------ token colours (both modes) */

const style = HighlightStyle.define([
  { tag: tags.heading, class: "tok-heading" },
  { tag: tags.strong, class: "tok-strong" },
  { tag: tags.emphasis, class: "tok-em" },
  { tag: tags.strikethrough, class: "tok-strike" },
  { tag: tags.link, class: "tok-link" },
  { tag: tags.url, class: "tok-url" },
  { tag: tags.monospace, class: "tok-code" },
  { tag: tags.quote, class: "tok-quote" },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], class: "tok-mark" },
  { tag: tags.list, class: "tok-list" },
]);
export const mdHighlight = syntaxHighlighting(style);

/* ------------------------------------------------------------ widgets */

class CheckboxWidget extends WidgetType {
  constructor(checked, at) { super(); this.checked = checked; this.at = at; } // at: position of "[" in "[ ]"
  eq(o) { return o.checked === this.checked && o.at === this.at; }
  toDOM(view) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-live-check";
    box.checked = this.checked;
    box.addEventListener("mousedown", (e) => e.preventDefault());
    box.addEventListener("click", (e) => {
      e.preventDefault();
      view.dispatch({ changes: { from: this.at + 1, to: this.at + 2, insert: this.checked ? " " : "x" } });
    });
    return box;
  }
  ignoreEvent() { return true; }
}

class BulletWidget extends WidgetType {
  eq() { return true; }
  toDOM() { const s = document.createElement("span"); s.className = "cm-live-bullet"; s.textContent = "•"; return s; }
}

class RuleWidget extends WidgetType {
  eq() { return true; }
  toDOM() { const s = document.createElement("span"); s.className = "cm-live-hr"; return s; }
}

const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

class ImageWidget extends WidgetType {
  constructor(src, alt) { super(); this.src = src; this.alt = alt; }
  eq(o) { return o.src === this.src && o.alt === this.alt; }
  toDOM() {
    const img = document.createElement("img");
    img.className = "cm-live-img";
    img.alt = this.alt;
    if (/^(https?:|data:image\/)/i.test(this.src)) img.src = this.src;
    else {
      const path = resolveLink(decodeURIComponent(this.src.split(/[?#]/)[0])) || this.src;
      img.src = backend ? backend.assetUrl(path) : path;
    }
    return img;
  }
}

class TableWidget extends WidgetType {
  constructor(text) { super(); this.text = text; }
  eq(o) { return o.text === this.text; }
  toDOM() {
    const d = document.createElement("div");
    d.className = "cm-live-table md";
    d.innerHTML = renderMarkdown(this.text, { interactive: false });
    return d;
  }
}

/* ------------------------------------------------------------ decorations */

const setFocus = StateEffect.define();
const focusField = StateField.define({
  create: () => false,
  update(v, tr) { for (const e of tr.effects) if (e.is(setFocus)) v = e.value; return v; },
});

const WIKI_RE = /(!?)\[\[([^\]\n|#]+)(#[^\]\n|]*)?(?:\|([^\]\n]*))?\]\]/g;
const HIGHLIGHT_RE = /==(?=\S)([^=\n]*?\S)==/g;
const TAG_RE = /(^|[\s(])(#[\p{L}\p{N}_\-/]*[\p{L}_][\p{L}\p{N}_\-/]*)/gu;
const BLOCK_ID_RE = /[ \t]+\^[A-Za-z0-9-]+[ \t]*$/;

function build(state) {
  const focused = state.field(focusField);
  const ranges = state.selection.ranges;
  // something is "active" (shown as source) when the cursor or selection touches it
  const touches = (from, to) => focused && ranges.some((r) => r.from <= to && r.to >= from);
  const doc = state.doc;
  const lineActive = (pos) => { const l = doc.lineAt(pos); return touches(l.from, l.to); };
  const out = [];
  const hide = (from, to) => { if (to > from) out.push(Decoration.replace({}).range(from, to)); };
  const widget = (w, from, to, block = false) => out.push(Decoration.replace({ widget: w, block }).range(from, to));
  const mark = (cls, from, to, attributes) => { if (to > from) out.push(Decoration.mark({ class: cls, attributes }).range(from, to)); };
  const lineCls = (pos, cls) => out.push(Decoration.line({ class: cls }).range(doc.lineAt(pos).from));
  const eachLine = (from, to, fn) => { for (let l = doc.lineAt(from); ; l = doc.line(l.number + 1)) { fn(l); if (l.to >= to || l.number >= doc.lines) break; } };
  const skip = []; // code and replaced tables: no wikilinks/tags inside
  const spaceAfter = (pos) => (doc.sliceString(pos, pos + 1) === " " ? 1 : 0);

  const tree = ensureSyntaxTree(state, doc.length, 150) || syntaxTree(state);
  tree.iterate({
    enter(n) {
      const name = n.name;
      const node = n.node;
      let m;
      if ((m = /^ATXHeading(\d)$/.exec(name))) { lineCls(n.from, "cm-h cm-h" + m[1]); return; }
      if ((m = /^SetextHeading(\d)$/.exec(name))) { lineCls(n.from, "cm-h cm-h" + m[1]); return; }
      switch (name) {
        case "HeaderMark": {
          if (/^ATX/.test(node.parent?.name || "") && !lineActive(n.from)) hide(n.from, Math.min(n.to + spaceAfter(n.to), doc.lineAt(n.from).to));
          return;
        }
        case "EmphasisMark": case "StrikethroughMark": {
          const p = node.parent;
          if (p && !touches(p.from, p.to)) hide(n.from, n.to);
          return;
        }
        case "InlineCode": {
          skip.push([n.from, n.to]);
          if (!touches(n.from, n.to)) for (const c of node.getChildren("CodeMark")) hide(c.from, c.to);
          return false;
        }
        case "FencedCode": case "CodeBlock": {
          skip.push([n.from, n.to]);
          const active = touches(n.from, n.to);
          const first = doc.lineAt(n.from), last = doc.lineAt(n.to);
          eachLine(n.from, n.to, (l) => {
            const fence = name === "FencedCode" && (l.number === first.number || (l.number === last.number && /^\s*(```|~~~)/.test(l.text)));
            lineCls(l.from, "cm-codeblock" + (fence ? " cm-codeblock-fence" : "") + (fence && !active ? " cm-fence-hidden" : ""));
            if (fence && !active) hide(l.from, l.to);
          });
          return false;
        }
        case "Blockquote": {
          eachLine(n.from, n.to, (l) => lineCls(l.from, "cm-quote"));
          return;
        }
        case "QuoteMark": {
          if (!lineActive(n.from)) hide(n.from, n.to + spaceAfter(n.to));
          return;
        }
        case "ListMark": {
          const item = node.parent;
          const task = item && item.getChild("Task");
          const marker = task && task.getChild("TaskMarker");
          if (marker) {
            const checked = /x/i.test(doc.sliceString(marker.from, marker.to));
            if (!touches(n.from, marker.to)) widget(new CheckboxWidget(checked, marker.from), n.from, marker.to + spaceAfter(marker.to));
            if (checked) mark("cm-task-done", marker.to, item.to); // the whole item: its details and sub-items too
            return;
          }
          if (item?.parent?.name === "BulletList") {
            if (!touches(n.from, n.to)) widget(new BulletWidget(), n.from, n.to);
          } else mark("cm-live-olnum", n.from, n.to);
          return;
        }
        case "HorizontalRule": {
          if (!lineActive(n.from)) widget(new RuleWidget(), n.from, n.to);
          return;
        }
        case "Link": {
          const marks = node.getChildren("LinkMark");
          const url = node.getChild("URL");
          if (!url || marks.length < 2 || touches(n.from, n.to)) return false;
          const close = marks[1];
          hide(n.from, marks[0].to);
          hide(close.from, n.to);
          mark("cm-live-link", marks[0].to, close.from, { "data-href": doc.sliceString(url.from, url.to) });
          return false;
        }
        case "Image": {
          const marks = node.getChildren("LinkMark");
          const url = node.getChild("URL");
          if (url && marks.length >= 2 && !touches(n.from, n.to)) {
            widget(new ImageWidget(doc.sliceString(url.from, url.to), doc.sliceString(marks[0].to, marks[1].from)), n.from, n.to);
          }
          return false;
        }
        case "Autolink": {
          const url = node.getChild("URL");
          if (url && !touches(n.from, n.to)) {
            hide(n.from, url.from);
            hide(url.to, n.to);
            mark("cm-live-link", url.from, url.to, { "data-href": doc.sliceString(url.from, url.to) });
          }
          return false;
        }
        case "URL": { // a bare link in the text
          if (!touches(n.from, n.to)) mark("cm-live-link", n.from, n.to, { "data-href": doc.sliceString(n.from, n.to) });
          return;
        }
        case "Table": {
          const from = doc.lineAt(n.from).from, to = doc.lineAt(n.to).to;
          skip.push([from, to]);
          if (touches(from, to)) eachLine(from, to, (l) => lineCls(l.from, "cm-table-src"));
          else widget(new TableWidget(doc.sliceString(from, to)), from, to, true);
          return false;
        }
        default:
      }
    },
  });

  // Obsidian extras the Markdown grammar doesn't know: [[links]], ![[embeds]], ==highlights==, #tags, ^block-ids
  const inSkip = (from, to) => skip.some(([a, b]) => from < b && to > a);
  for (let i = 1; i <= doc.lines; i++) {
    const l = doc.line(i);
    const text = l.text;
    if (!text || skip.some(([a, b]) => a <= l.from && b >= l.to)) continue;
    let m;
    WIKI_RE.lastIndex = 0;
    while ((m = WIKI_RE.exec(text))) {
      const from = l.from + m.index, to = from + m[0].length;
      if (inSkip(from, to)) continue;
      const target = m[2].trim();
      if (m[1] && IMG_EXT.test(target)) {
        if (!touches(from, to)) widget(new ImageWidget(target, target), from, to);
        continue;
      }
      if (touches(from, to)) { mark("cm-wikilink-src", from, to); continue; }
      const heading = m[3] || "";
      const textFrom = m[4] !== undefined ? to - 2 - m[4].length : from + 2 + (m[1] ? 1 : 0);
      const textTo = m[4] !== undefined ? to - 2 : (heading && !heading.startsWith("#^") ? to - 2 : from + 2 + (m[1] ? 1 : 0) + m[2].length);
      hide(from, textFrom);
      hide(textTo, to);
      const ok = !!resolveLink(target);
      mark("cm-live-wikilink" + (ok ? "" : " missing"), textFrom, textTo, { "data-link": target });
    }
    HIGHLIGHT_RE.lastIndex = 0;
    while ((m = HIGHLIGHT_RE.exec(text))) {
      const from = l.from + m.index, to = from + m[0].length;
      if (inSkip(from, to)) continue;
      if (touches(from, to)) { mark("cm-highlight", from, to); continue; }
      hide(from, from + 2);
      mark("cm-highlight", from + 2, to - 2);
      hide(to - 2, to);
    }
    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(text))) {
      const from = l.from + m.index + m[1].length, to = from + m[2].length;
      if (!inSkip(from, to) && !/^#{1,6}$/.test(m[2])) mark("cm-tag", from, to);
    }
    const b = BLOCK_ID_RE.exec(text);
    if (b && !inSkip(l.from + b.index, l.to)) {
      if (lineActive(l.from)) mark("cm-blockid", l.from + b.index, l.to);
      else hide(l.from + b.index, l.to);
    }
  }
  return Decoration.set(out, true);
}

const liveField = StateField.define({
  create: (state) => build(state),
  update(deco, tr) {
    if (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(setFocus)) || syntaxTree(tr.state) !== syntaxTree(tr.startState)) return build(tr.state);
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * The live preview extension. onLink(href, isWikilink) opens a rendered link when it is clicked
 * (to edit a link, move the cursor into it with the keyboard or click just next to it).
 */
export function livePreview({ onLink } = {}) {
  return [
    focusField,
    EditorView.focusChangeEffect.of((_state, focusing) => setFocus.of(focusing)),
    liveField,
    EditorView.editorAttributes.of({ class: "cm-live" }),
    EditorView.domEventHandlers({
      mousedown(e) {
        if (e.button !== 0 || !onLink) return false;
        const a = e.target.closest?.(".cm-live-link, .cm-live-wikilink");
        if (!a) return false;
        e.preventDefault();
        onLink(a.getAttribute("data-href") || a.getAttribute("data-link"), a.classList.contains("cm-live-wikilink"));
        return true;
      },
    }),
  ];
}
