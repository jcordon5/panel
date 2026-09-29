// Markdown rendering (marked + Obsidian-flavoured extras):
// [[wikilinks]], ![[embeds]], #tags, ==highlights==, > [!callouts], interactive
// task checkboxes mapped to their exact line in the file. Raw HTML is escaped.

import { Marked } from "../vendor/marked.esm.js";
import { esc, dirname, joinPath } from "./util.js";
import { resolveLink, projectBySlug, TASK_RE } from "./model.js";
import { backend } from "./backends.js";

const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
const SAFE_HTML = /^<\/?(br|kbd|sub|sup|u|mark|s|small|b|i|em|strong|hr)\s*\/?>$/i;

let ctx = { dir: "", n: 0 };

function safeUrl(href) {
  const h = String(href || "").trim();
  if (/^(javascript|vbscript|data):/i.test(h) && !/^data:image\/(png|jpe?g|gif|webp);/i.test(h)) return "#";
  return h;
}
const isExternal = (href) => /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");

/** src/href attributes for a vault file: a URL (local server) or a data-asset hook filled in later. */
function assetAttr(path, attr) {
  const url = backend && backend.assetUrl(path);
  if (url) return `${attr}="${esc(url)}"`;
  return `${attr}="${attr === "src" ? "data:," : "#"}" data-asset="${esc(path)}"`;
}

function resolveRelative(href) {
  const clean = decodeURIComponent(href.split("#")[0].split("?")[0]);
  const candidate = joinPath(ctx.dir, clean);
  return resolveLink(candidate) || resolveLink(clean);
}

const wikilink = {
  name: "wikilink",
  level: "inline",
  start(src) { const i = src.indexOf("[["); return i < 0 ? undefined : (i > 0 && src[i - 1] === "!" ? i - 1 : i); },
  tokenizer(src) {
    const m = /^(!?)\[\[([^\]\n|#]+)(#[^\]\n|]*)?(?:\|([^\]\n]*))?\]\]/.exec(src);
    if (m) return { type: "wikilink", raw: m[0], embed: !!m[1], target: m[2].trim(), heading: m[3] || "", alias: (m[4] || "").trim() };
  },
  renderer(tok) {
    const path = resolveLink(tok.target);
    if (tok.embed && (IMG_EXT.test(tok.target) || (path && IMG_EXT.test(path)))) {
      const width = /^\d+$/.test(tok.alias) ? ` width="${tok.alias}"` : "";
      return path ? `<img ${assetAttr(path, "src")} alt="${esc(tok.target)}"${width} loading="lazy">` : `<span class="wikilink missing">${esc(tok.target)}</span>`;
    }
    const label = tok.alias || tok.target.split("/").pop() + (tok.heading || "");
    const cls = path ? "wikilink" : "wikilink missing";
    return `<a href="#" class="${cls}" data-link="${esc(path || "")}" data-target="${esc(tok.target)}">${esc(label)}</a>`;
  },
};

const tag = {
  name: "tag",
  level: "inline",
  start(src) {
    const m = /(^|[\s(])#[\p{L}\p{N}_\-/]*[\p{L}_]/u.exec(src);
    return m ? m.index + m[1].length : undefined;
  },
  tokenizer(src) {
    const m = /^#([\p{L}\p{N}_\-/]*[\p{L}_][\p{L}\p{N}_\-/]*)/u.exec(src);
    if (m) return { type: "tag", raw: m[0], tag: m[1] };
  },
  renderer(tok) {
    const p = projectBySlug(tok.tag) || projectBySlug(tok.tag.toLowerCase());
    const style = p ? ` data-color="${p.color}"` : "";
    return `<a href="#" class="tag${p ? " tag-project" : ""}"${style} data-tag="${esc(tok.tag)}">#${esc(tok.tag)}</a>`;
  },
};

const highlight = {
  name: "highlight",
  level: "inline",
  start(src) { const i = src.indexOf("=="); return i < 0 ? undefined : i; },
  tokenizer(src) {
    const m = /^==(?=\S)([\s\S]*?\S)==/.exec(src);
    if (m) return { type: "highlight", raw: m[0], tokens: this.lexer.inlineTokens(m[1]) };
  },
  renderer(tok) { return `<mark>${this.parser.parseInline(tok.tokens)}</mark>`; },
};

const CALLOUT_ICONS = { note: "✎", info: "ℹ", tip: "✦", success: "✓", question: "?", warning: "!", danger: "⚠", bug: "⚠", example: "❖", quote: "❝", todo: "☐", abstract: "≡", important: "!", caution: "!" };

const renderer = {
  html({ text }) {
    return SAFE_HTML.test(text.trim()) ? text : esc(text);
  },
  checkbox({ checked }) {
    return `<input type="checkbox" class="md-task" data-task="${ctx.n++}"${checked ? " checked" : ""}> `;
  },
  listitem(item) {
    const body = this.parser.parse(item.tokens);
    if (item.task) return `<li class="task-li${item.checked ? " done" : ""}">${body}</li>\n`;
    return `<li>${body}</li>\n`;
  },
  link({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    href = safeUrl(href);
    const tt = title ? ` title="${esc(title)}"` : "";
    if (isExternal(href)) return `<a href="${esc(href)}"${tt} target="_blank" rel="noopener noreferrer">${text}</a>`;
    if (href.startsWith("#")) return `<a href="${esc(href)}"${tt}>${text}</a>`;
    const path = resolveRelative(href);
    if (path && !/\.md$/i.test(path)) return `<a ${assetAttr(path, "href")} target="_blank"${tt}>${text}</a>`;
    return `<a href="#" class="wikilink${path ? "" : " missing"}" data-link="${esc(path || "")}" data-target="${esc(href)}"${tt}>${text}</a>`;
  },
  image({ href, title, text }) {
    href = safeUrl(href);
    const tt = title ? ` title="${esc(title)}"` : "";
    if (!isExternal(href) && !href.startsWith("data:")) {
      const path = resolveRelative(href);
      if (path) return `<img ${assetAttr(path, "src")} alt="${esc(text)}"${tt} loading="lazy">`;
    }
    return `<img src="${esc(href)}" alt="${esc(text)}"${tt} loading="lazy">`;
  },
  code({ text, lang }) {
    const l = (lang || "").split(/\s/)[0];
    return `<div class="code-block"><button class="code-copy" type="button" data-action="copy-code" title="Copy">⧉</button><pre><code${l ? ` class="lang-${esc(l)}"` : ""}>${esc(text)}</code></pre></div>`;
  },
  blockquote({ tokens }) {
    let inner = this.parser.parse(tokens);
    const m = /^<p>\[!(\w+)\]([+-]?)[ \t]*([^\n<]*)(?:<br>\n?|\n|<\/p>)/i.exec(inner);
    if (!m) return `<blockquote>${inner}</blockquote>\n`;
    const type = m[1].toLowerCase();
    const title = m[3].trim() || type[0].toUpperCase() + type.slice(1);
    let rest = inner.slice(m[0].length);
    if (m[0].endsWith("</p>")) rest = rest.replace(/^\s*/, "");
    else rest = "<p>" + rest;
    rest = rest.replace(/^<p>\s*<\/p>/, "");
    const open = m[2] !== "-";
    return `<details class="callout callout-${esc(type)}"${open ? " open" : ""}><summary><span class="callout-icon">${CALLOUT_ICONS[type] || "✎"}</span>${title}</summary><div class="callout-body">${rest}</div></details>\n`;
  },
  table(token) {
    // default table markup, wrapped to scroll horizontally on small screens
    let header = "";
    for (const cell of token.header) header += this.tablecell(cell);
    let body = "";
    for (const row of token.rows) {
      let r = "";
      for (const cell of row) r += this.tablecell(cell);
      body += `<tr>${r}</tr>\n`;
    }
    return `<div class="table-wrap"><table><thead><tr>${header}</tr></thead>${body ? `<tbody>${body}</tbody>` : ""}</table></div>\n`;
  },
};

const md = new Marked({ gfm: true, breaks: true });
md.use({ extensions: [wikilink, tag, highlight], renderer });

/** Line indexes (relative to src) of task items, in document order. */
function taskLines(src) {
  const out = [];
  let fence = null;
  src.split("\n").forEach((l, i) => {
    const f = /^\s*(```|~~~)/.exec(l);
    if (f) { if (!fence) fence = f[1]; else if (f[1] === fence) fence = null; return; }
    if (fence) return;
    const s = l.replace(/^(\s*>\s?)+/, "");
    const m = TASK_RE.exec(s);
    if (m) out.push({ i, done: m[2] !== " " });
  });
  return out;
}

/**
 * Render Markdown to HTML.
 * opts.path: file the source belongs to (links, images, checkboxes)
 * opts.lineOffset: line of `src` inside that file (so checkboxes know their line)
 */
export function renderMarkdown(src, opts = {}) {
  ctx = { dir: opts.path ? dirname(opts.path) : "", n: 0 };
  let html;
  try { html = md.parse(src || ""); } catch (e) { return `<pre>${esc(src)}</pre>`; }
  if (!opts.path || opts.interactive === false) return html.replace(/class="md-task"/g, 'class="md-task" disabled');
  const lines = taskLines(src || "");
  const off = opts.lineOffset || 0;
  let ok = lines.length === ctx.n;
  return html.replace(/<input type="checkbox" class="md-task" data-task="(\d+)"( checked)?>/g, (all, n, checked) => {
    const tl = lines[+n];
    if (!ok || !tl || tl.done !== !!checked) { ok = false; return all.replace('class="md-task"', 'class="md-task" disabled'); }
    return `<input type="checkbox" class="md-task" data-path="${esc(opts.path)}" data-line="${off + tl.i}"${checked || ""}>`;
  });
}

/** Inline-only rendering for task titles and short labels. */
export function renderInline(src) {
  ctx = { dir: "", n: 0 };
  try { return md.parseInline(src || ""); } catch (e) { return esc(src); }
}

/** Plain-text excerpt for cards. */
export function excerpt(src, max = 220) {
  return (src || "")
    .replace(/^---[\s\S]*?\n---\n/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "").replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, "☐ ").replace(/^\s*[-*+>]\s+/gm, "· ")
    .replace(/[*_`~=]{1,3}/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
