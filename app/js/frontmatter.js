// YAML frontmatter: a forgiving subset parser + a line-preserving editor.
// Only touches the keys you change, so hand-written/Obsidian frontmatter survives.

// v1 (Spanish) keys are read as their v2 equivalents.
const ALIASES = {
  titulo: "title", "título": "title", tipo: "type", fecha: "date", proyecto: "project",
  creado: "created", actualizado: "updated", inicio: "start", asistentes: "attendees",
  etiquetas: "tags", hora: "time", estado: "status",
};
const TYPE_ALIASES = { reunion: "meeting", "reunión": "meeting", nota: "note", notas: "note", semana: "week", tareas: "inbox" };

const FM_RE = /^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/;

/** Split a document: { fm: {key: value}, body, bodyLine (index of first body line), raw } */
export function parseDoc(text) {
  text = text || "";
  const m = FM_RE.exec(text);
  if (!m) return { fm: {}, body: text, bodyLine: 0, hasFm: false };
  const fm = parseYaml(m[1]);
  const bodyLine = m[0].split("\n").length - (m[0].endsWith("\n") ? 1 : 0);
  return { fm, body: text.slice(m[0].length), bodyLine, hasFm: true };
}

function unquote(v) {
  v = v.trim();
  if ((v.startsWith('"') && v.endsWith('"') && v.length > 1)) {
    try { return JSON.parse(v); } catch (e) { return v.slice(1, -1); }
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length > 1) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

function parseScalar(v) {
  v = v.replace(/\s+#.*$/, "").trim();
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return splitInline(inner).map(unquote).filter((s) => s !== "");
  }
  const u = unquote(v);
  if (u === "true") return true;
  if (u === "false") return false;
  return u;
}

function splitInline(s) {
  const out = []; let cur = "", q = null;
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === ",") { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseYaml(src) {
  const out = {};
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^([^\s:#][^:]*?):(?:\s+(.*)|\s*)$/.exec(lines[i]);
    if (!m) continue;
    let key = m[1].trim();
    key = ALIASES[key.toLowerCase()] || key;
    const rest = (m[2] || "").trim();
    let val;
    if (rest === "" || rest === "|" || rest === ">") {
      // block list or block text
      const items = [];
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) {
        i++;
        const li = /^\s*-\s*(.*)$/.exec(lines[i]);
        if (li) items.push(unquote(li[1]));
        else items.push(lines[i].trim());
      }
      val = rest === "" ? (items.length ? items : "") : items.join(rest === "|" ? "\n" : " ");
    } else {
      val = parseScalar(rest);
    }
    if (key === "type" && typeof val === "string") val = TYPE_ALIASES[val.toLowerCase()] || val;
    if (!(key in out) || out[key] === "") out[key] = val;
  }
  return out;
}

function needsQuote(s) {
  return s === "" ? false : /^[\s\-?:,[\]{}#&*!|>'"%@`]|: | #|\s$|^(true|false|null|yes|no|~)$/i.test(s);
}
export function yamlValue(v) {
  if (Array.isArray(v)) {
    return "[" + v.map((x) => { const s = String(x); return /[,[\]]/.test(s) || needsQuote(s) ? JSON.stringify(s) : s; }).join(", ") + "]";
  }
  if (typeof v === "boolean") return String(v);
  const s = String(v ?? "");
  return needsQuote(s) ? JSON.stringify(s) : s;
}

/**
 * Update frontmatter keys in place. `updates` maps key -> value; null/undefined
 * removes the key. Aliased (v1) keys are replaced by their v2 name.
 */
export function setFm(text, updates) {
  text = text || "";
  const m = FM_RE.exec(text);
  let lines = m ? m[1].split("\n") : [];
  const body = m ? text.slice(m[0].length) : text;
  const pending = { ...updates };
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const km = /^([^\s:#][^:]*?):(.*)$/.exec(lines[i]);
    if (!km) { out.push(lines[i]); continue; }
    const raw = km[1].trim();
    const key = ALIASES[raw.toLowerCase()] || raw;
    // swallow block continuation lines that belong to this key
    let j = i;
    while (j + 1 < lines.length && /^\s+/.test(lines[j + 1])) j++;
    if (key in pending) {
      const v = pending[key];
      delete pending[key];
      if (v !== null && v !== undefined) out.push(key + ": " + yamlValue(v));
      i = j;
      continue;
    }
    for (let k = i; k <= j; k++) out.push(lines[k]);
    i = j;
  }
  for (const [k, v] of Object.entries(pending)) if (v !== null && v !== undefined) out.push(k + ": " + yamlValue(v));
  const fmText = "---\n" + out.join("\n") + "\n---\n";
  return fmText + (m ? body : (body.startsWith("\n") ? body : "\n" + body));
}

export function buildDoc(fm, body) {
  const lines = Object.entries(fm).filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => k + ": " + yamlValue(v));
  return "---\n" + lines.join("\n") + "\n---\n\n" + body.replace(/^\n+/, "");
}

export function replaceBody(text, body) {
  const m = FM_RE.exec(text || "");
  return m ? m[0] + body : body;
}
