// Small DOM, string and date helpers shared by the whole app.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Tiny element builder: h("div", {class: "x", onclick: fn}, "text", child, [more])
 * - `html` sets innerHTML (only for trusted/escaped strings)
 * - `on*` attributes become event listeners
 * - false / null / undefined children are skipped
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") {
        for (const [sk, sv] of Object.entries(v)) sk.startsWith("--") ? el.style.setProperty(sk, sv) : (el.style[sk] = sv);
      }
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "value") el.value = v;
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false || c === true) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function slugify(s, max = 60) {
  return String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/, "") || "untitled";
}

/** lowercase + no accents: for forgiving search */
export function fold(s) {
  return String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export function basename(path) { return path.split("/").pop(); }
export function dirname(path) { const i = path.lastIndexOf("/"); return i < 0 ? "" : path.slice(0, i); }
export function stripExt(name) { return name.replace(/\.md$/i, ""); }

/** Resolve a relative path (../img.png) against a directory inside the vault */
export function joinPath(dir, rel) {
  const out = dir ? dir.split("/") : [];
  for (const part of rel.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop(); else out.push(part);
  }
  return out.join("/");
}
export function relativePath(fromDir, to) {
  const a = fromDir ? fromDir.split("/") : [], b = to.split("/");
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...Array(a.length - i).fill(".."), ...b.slice(i)].join("/");
}

export function storage(key, value) {
  try {
    if (value === undefined) { const v = localStorage.getItem("panel." + key); return v === null ? undefined : JSON.parse(v); }
    localStorage.setItem("panel." + key, JSON.stringify(value));
  } catch (e) { /* private mode, blocked storage... */ }
  return value;
}

/* ------------------------------------------------------------------ dates */
// Everything works with local "YYYY-MM-DD" strings to avoid timezone bugs.

export function iso(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
export function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
export function isISODate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !!parseISO(s); }
export function today() { return iso(new Date()); }
export function addDays(isoStr, n) { const d = parseISO(isoStr); d.setDate(d.getDate() + n); return iso(d); }
export function diffDays(a, b) { return Math.round((parseISO(a) - parseISO(b)) / 86400000); }
export function mondayOf(isoStr) { const d = parseISO(isoStr); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); }
export function weekdayIndex(isoStr) { return (parseISO(isoStr).getDay() + 6) % 7; } // 0 = Monday

export function isoWeek(isoStr) {
  const d = parseISO(isoStr);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { year: t.getUTCFullYear(), week: Math.ceil(((t - y0) / 86400000 + 1) / 7) };
}
export function weekId(isoStr) {
  const { year, week } = isoWeek(isoStr);
  return year + "-W" + String(week).padStart(2, "0");
}
export function weekStart(id) {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(id || "");
  if (!m) return null;
  return addDays(mondayOf(m[1] + "-01-04"), (+m[2] - 1) * 7);
}
export function monthId(isoStr) { return isoStr.slice(0, 7); }

export function nowTime() {
  const d = new Date();
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
