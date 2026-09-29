// Vault model: turns the cached files into docs, projects, meetings, weeks and
// tasks. Everything is derived from the Markdown and memoised per store version.

import { store } from "./store.js";
import { parseDoc } from "./frontmatter.js";
import { basename, dirname, stripExt, fold, weekStart, addDays, isISODate, mondayOf } from "./util.js";

export const P = {
  inbox: "inbox.md",
  weeks: "weeks",
  meetings: "meetings",
  projects: "projects",
  notes: "notes",
  templates: "templates",
  assets: "assets",
};

export const PROJECT_COLORS = ["indigo", "blue", "teal", "green", "amber", "orange", "rose", "violet", "slate"];

const WEEKDAYS = [
  ["lunes", "monday", "lun", "mon"], ["martes", "tuesday", "mar", "tue"], ["miercoles", "wednesday", "mie", "wed"],
  ["jueves", "thursday", "jue", "thu"], ["viernes", "friday", "vie", "fri"], ["sabado", "saturday", "sab", "sat"],
  ["domingo", "sunday", "dom", "sun"],
];

export const TASK_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s+(\S.*)$/;
// A list item that is only a [[link]]: in a day it places a meeting (or note) among the tasks
export const REF_RE = /^(\s*)[-*+]\s+\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]\s*$/;
export const TAG_RE = /(^|[\s(])#([\p{L}\p{N}_\-/]*[\p{L}_][\p{L}\p{N}_\-/]*)/gu;
const TIME_RE = /^(\d{1,2}[:.]\d{2})(?:\s*[-–]\s*(\d{1,2}(?:[:.]\d{2})?))?\s+/;

export function indentOf(line) {
  const m = /^[ \t]*/.exec(line)[0];
  return m.replace(/\t/g, "    ").length;
}

/* ------------------------------------------------------------ docs */

function humanize(name) {
  let s = stripExt(name).replace(/^\d{4}-\d{2}-\d{2}[-_ ]?/, "").replace(/^\d{6}_(\d+_)?/, "").replace(/[-_]+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : stripExt(name);
}

function dateFromName(name) {
  let m = /^(\d{4}-\d{2}-\d{2})/.exec(name);
  if (m && isISODate(m[1])) return m[1];
  m = /^(\d{2})(\d{2})(\d{2})_/.exec(name);
  if (m) return `20${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

export function kindOf(path, fm) {
  if (path === P.inbox || fm.type === "inbox") return "inbox";
  if (path.startsWith(P.templates + "/")) return "template";
  if (path.startsWith(P.weeks + "/") || fm.type === "week") return "week";
  const pm = /^projects\/([^/]+)\/(.+)$/.exec(path);
  if (pm) {
    if (/^readme\.md$/i.test(pm[2]) || fm.type === "project") return "project";
    if (pm[2].startsWith("meetings/") || fm.type === "meeting") return "meeting";
    return "doc";
  }
  if (path.startsWith(P.meetings + "/") || fm.type === "meeting") return "meeting";
  if (path.startsWith(P.notes + "/") || fm.type === "note") return "note";
  return "doc";
}

function projectOfPath(path) {
  const m = /^projects\/([^/]+)\//.exec(path);
  return m ? m[1] : null;
}

function firstHeading(body) {
  const m = /^#\s+(.+?)\s*#*\s*$/m.exec(body);
  return m ? m[1].trim() : null;
}

function makeDoc(path, file) {
  const parsed = parseDoc(file.content);
  const fm = parsed.fm;
  const name = basename(path);
  const kind = kindOf(path, fm);
  const project = projectOfPath(path) || (typeof fm.project === "string" && fm.project ? fm.project.replace(/^\[\[|\]\]$/g, "") : null);
  const fmTitle = typeof fm.title === "string" && fm.title.trim() ? fm.title.trim() : null;
  let title = fmTitle || firstHeading(parsed.body) || humanize(name);
  if (kind === "project" && !fmTitle && !firstHeading(parsed.body)) title = humanize(projectOfPath(path) || name);
  const date = (typeof fm.date === "string" && isISODate(fm.date.slice(0, 10)) ? fm.date.slice(0, 10) : null) || dateFromName(name);
  return {
    path, name, dir: dirname(path), kind, fm, title, date, project,
    time: typeof fm.time === "string" ? fm.time : "",
    body: parsed.body, bodyLine: parsed.bodyLine,
    // GitHub has no cheap per-file modification time: fall back to the `updated` field
    mtime: file.mtime || (typeof fm.updated === "string" && Date.parse(fm.updated)) || (typeof fm.created === "string" && Date.parse(fm.created)) || 0,
    pinned: fm.pinned === true || fm.pinned === "true",
    tags: toList(fm.tags),
    attendees: toList(fm.attendees),
  };
}

function toList(v) {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v.trim()) return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

/* ------------------------------------------------------------ tasks */

/** First line index after the block that starts at task line i. */
export function blockEnd(lines, i, limit = lines.length) {
  const base = indentOf(lines[i]);
  let j = i + 1;
  while (j < limit) {
    const l = lines[j];
    if (!l.trim()) {
      let k = j + 1;
      while (k < limit && !lines[k].trim()) k++;
      if (k < limit && indentOf(lines[k]) > base) { j = k; continue; }
      break;
    }
    if (indentOf(l) > base) { j++; continue; }
    if (/^\s*([-*+]|\d+[.)])\s|^#{1,6}\s|^\s*>|^\s*(```|~~~)|^(---|\*\*\*|___)\s*$/.test(l)) break;
    j++; // lazy continuation line
  }
  return j;
}

export function parseTaskText(text) {
  let time = null, timeEnd = null;
  const tm = TIME_RE.exec(text);
  if (tm) { time = tm[1].replace(".", ":"); timeEnd = tm[2] ? tm[2].replace(".", ":") : null; text = text.slice(tm[0].length); }
  const tags = [];
  text.replace(TAG_RE, (_, _p, tag) => { tags.push(tag); return _; });
  return { time, timeEnd, text, tags };
}

function makeTask(lines, i, end, extra) {
  const m = TASK_RE.exec(lines[i]);
  const parsed = parseTaskText(m[3]);
  return {
    type: "task", line: i, end, raw: lines[i], indent: indentOf(lines[i]),
    done: m[2] !== " ", text: m[3], ...parsed, fullText: m[3],
    details: lines.slice(i + 1, end),
    ...extra,
  };
}

/**
 * Top-level items (tasks, [[refs]] and dividers) of a container range.
 * dividerMin: heading level from which headings are shown as dividers.
 */
export function containerItems(lines, start, end, extra, dividerMin = 3) {
  const items = [];
  let inFence = false;
  for (let i = start; i < end;) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) { inFence = !inFence; i++; continue; }
    if (inFence) { i++; continue; }
    if (TASK_RE.test(l)) {
      const e = blockEnd(lines, i, end);
      items.push(makeTask(lines, i, e, extra));
      i = e;
      continue;
    }
    const rm = REF_RE.exec(l);
    if (rm) {
      const e = blockEnd(lines, i, end);
      items.push({ type: "ref", line: i, end: e, raw: l, indent: indentOf(l), target: rm[2].trim(), details: lines.slice(i + 1, e), text: rm[2].trim(), tags: [], ...extra });
      i = e;
      continue;
    }
    const hm = /^(#{1,6})\s+(.*)$/.exec(l);
    if (hm && hm[1].length >= dividerMin) items.push({ type: "divider", line: i, text: hm[2].trim() });
    i++;
  }
  return items;
}

/** Every task line of a document (including nested ones), outside code fences. */
export function allTasks(lines, from, extra) {
  const out = [];
  let inFence = false;
  for (let i = from; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) { inFence = !inFence; continue; }
    if (inFence || !TASK_RE.test(l)) continue;
    out.push(makeTask(lines, i, blockEnd(lines, i), extra));
  }
  return out;
}

/* ------------------------------------------------------------ weeks */

export function weekPath(id) { return `${P.weeks}/${id}.md`; }

export function weekStartOf(doc) {
  if (typeof doc.fm.start === "string" && isISODate(doc.fm.start)) return mondayOf(doc.fm.start);
  const m = /(\d{4}-W\d{1,2})/.exec(doc.name);
  if (m) return weekStart(m[1]);
  const d = /(\d{4}-\d{2}-\d{2})/.exec(doc.name);
  return d ? mondayOf(d[1]) : null;
}

/** Day sections of a week file: [{date, head, start, end}] */
export function weekSections(lines, bodyLine, start) {
  const heads = [];
  for (let i = bodyLine; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) heads.push(i);
  }
  const out = [];
  heads.forEach((hIdx, n) => {
    const line = lines[hIdx];
    if (!/^##\s/.test(line)) return;
    const end = n + 1 < heads.length ? heads[n + 1] : lines.length;
    let date = null;
    const dm = /(\d{4}-\d{2}-\d{2})/.exec(line);
    if (dm && isISODate(dm[1])) date = dm[1];
    else if (start) {
      const word = fold(line.replace(/^##\s+/, "")).split(/[\s·,.:-]+/)[0];
      const idx = WEEKDAYS.findIndex((w) => w.includes(word));
      if (idx >= 0) date = addDays(start, idx);
    }
    if (date) out.push({ date, head: hIdx, start: hIdx + 1, end });
  });
  return out;
}

/* ------------------------------------------------------------ derived index */

let memo = { v: -1 };

export function vault() {
  if (memo.v === store.version) return memo;
  memo = build();
  memo.v = store.version;
  return memo;
}

function build() {
  const docs = new Map();
  for (const [path, file] of store.files) docs.set(path, makeDoc(path, file));

  // projects: every folder under projects/, README optional
  const projects = new Map();
  const ensureProject = (slug) => {
    if (!projects.has(slug)) projects.set(slug, { slug, title: humanize(slug), status: "active", color: null, readme: null, path: `${P.projects}/${slug}/README.md`, description: "" });
    return projects.get(slug);
  };
  for (const d of store.dirs) {
    const m = /^projects\/([^/]+)$/.exec(d);
    if (m) ensureProject(m[1]);
  }
  for (const doc of docs.values()) {
    const slug = projectOfPath(doc.path);
    if (!slug) continue;
    const p = ensureProject(slug);
    if (doc.kind === "project" && (!p.readme || /readme\.md$/i.test(doc.path))) {
      p.readme = doc; p.path = doc.path; p.title = doc.title;
      p.status = typeof doc.fm.status === "string" ? doc.fm.status : "active";
      p.color = PROJECT_COLORS.includes(doc.fm.color) ? doc.fm.color : null;
      const para = doc.body.split("\n").find((l) => l.trim() && !/^#|^[-*>|]|^\s*\d+\./.test(l.trim()));
      p.description = typeof doc.fm.description === "string" ? doc.fm.description : (para || "").trim();
    }
  }
  let ci = 0;
  for (const p of [...projects.values()].sort((a, b) => a.slug.localeCompare(b.slug))) {
    if (!p.color) p.color = PROJECT_COLORS[ci++ % (PROJECT_COLORS.length - 1)];
  }

  // wikilink resolution: basename or title (case/accent-insensitive)
  const byName = new Map(), byTitle = new Map();
  for (const d of docs.values()) {
    const k = fold(stripExt(d.name));
    if (!byName.has(k) || d.path.length < byName.get(k).length) byName.set(k, d.path);
    const tk = fold(d.title);
    if (!byTitle.has(tk)) byTitle.set(tk, d.path);
  }
  for (const p of projects.values()) {
    if (!byName.has(fold(p.slug))) byName.set(fold(p.slug), p.path);
  }

  const resolveRef = (it) => {
    if (it.type !== "ref") return;
    const path = resolveIn(it.target, docs, byName, byTitle);
    it.doc = path ? docs.get(path) || null : null;
  };

  // weeks -> day containers, tasks
  const days = new Map(); // date -> { path, date, tasks[], items[] }
  const tasks = [];
  const weekFiles = new Map(); // weekStart -> path
  for (const doc of docs.values()) {
    if (doc.kind !== "week") continue;
    const start = weekStartOf(doc);
    if (start) weekFiles.set(start, doc.path);
    const lines = store.files.get(doc.path).content.split("\n");
    for (const sec of weekSections(lines, doc.bodyLine, start)) {
      const items = containerItems(lines, sec.start, sec.end, { path: doc.path, kind: "day", date: sec.date });
      items.forEach(resolveRef);
      const day = days.get(sec.date) || { date: sec.date, path: doc.path, items: [] };
      day.items.push(...items);
      days.set(sec.date, day);
      for (const it of items) if (it.type === "task") tasks.push(it);
    }
  }

  // inbox
  let inbox = { path: P.inbox, items: [] };
  const inboxDoc = docs.get(P.inbox);
  if (inboxDoc) {
    const lines = store.files.get(P.inbox).content.split("\n");
    inbox.items = containerItems(lines, inboxDoc.bodyLine, lines.length, { path: P.inbox, kind: "inbox" }, 2);
    inbox.items.forEach(resolveRef);
    for (const it of inbox.items) if (it.type === "task") tasks.push(it);
  }

  // tasks living inside meetings / notes / project docs
  const docTasks = [];
  for (const doc of docs.values()) {
    if (!["meeting", "note", "project", "doc"].includes(doc.kind)) continue;
    const lines = store.files.get(doc.path).content.split("\n");
    for (const tk of allTasks(lines, doc.bodyLine, { path: doc.path, kind: "doc", docKind: doc.kind, date: doc.kind === "meeting" ? doc.date : null, project: doc.project })) {
      docTasks.push(tk);
    }
  }

  // project membership of week/inbox tasks by #tag
  const slugByFold = new Map([...projects.keys()].map((s) => [fold(s), s]));
  for (const tk of tasks) {
    const hit = tk.tags.map((tg) => slugByFold.get(fold(tg))).find(Boolean);
    tk.project = hit || null;
  }

  const meetings = [...docs.values()].filter((d) => d.kind === "meeting")
    .sort((a, b) => ((b.date || "") + (b.time || "")).localeCompare((a.date || "") + (a.time || "")) || a.title.localeCompare(b.title));
  const notes = [...docs.values()].filter((d) => d.kind === "note");

  return { docs, projects, days, inbox, tasks, docTasks, meetings, notes, weekFiles, byName, byTitle };
}

function resolveIn(target, docs, byName, byTitle) {
  const t = String(target || "").trim().replace(/\\/g, "/");
  if (!t) return null;
  const withMd = /\.md$/i.test(t) ? t : t + ".md";
  if (docs.has(withMd)) return withMd;
  return byName.get(fold(stripExt(basename(t)))) || byTitle.get(fold(t)) || null;
}

export function resolveLink(target) {
  const v = vault();
  const t = String(target || "").trim().replace(/\\/g, "/");
  if (!t) return null;
  if (store.others.has(t)) return t;
  return resolveIn(t, v.docs, v.byName, v.byTitle) || findAsset(t);
}

function findAsset(name) {
  const k = fold(basename(name));
  for (const p of store.others.keys()) if (fold(basename(p)) === k) return p;
  return null;
}

export function docTitle(path) {
  const d = vault().docs.get(path);
  return d ? d.title : humanize(basename(path));
}

export function projectBySlug(slug) { return slug ? vault().projects.get(slug) || null : null; }

export function dayItems(date) {
  const d = vault().days.get(date);
  return d ? d.items : [];
}
export function dayTasks(date) { return dayItems(date).filter((i) => i.type === "task"); }

/** Meetings of a date that are not placed ([[ref]]) in that day's list. */
export function unplacedMeetings(date) {
  const placed = new Set(dayItems(date).filter((i) => i.type === "ref" && i.doc).map((i) => i.doc.path));
  return meetingsOn(date).filter((m) => !placed.has(m.path));
}

export function meetingsOn(date) {
  return vault().meetings.filter((m) => m.date === date).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
}

export function overdueTasks(before) {
  return vault().tasks.filter((t) => t.kind === "day" && !t.done && t.date < before)
    .sort((a, b) => a.date.localeCompare(b.date) || a.line - b.line);
}

export function projectTasks(slug) {
  const v = vault();
  return [
    ...v.tasks.filter((t) => t.project === slug),
    ...v.docTasks.filter((t) => t.project === slug),
  ];
}

export function backlinks(path) {
  const v = vault();
  const target = v.docs.get(path);
  if (!target) return [];
  const names = new Set([fold(stripExt(target.name)), fold(target.title)]);
  const out = [];
  for (const d of v.docs.values()) {
    if (d.path === path) continue;
    const body = d.body;
    let hit = false;
    body.replace(/\[\[([^\]|#\n]+)/g, (_, n) => { if (names.has(fold(stripExt(basename(n.trim()))))) hit = true; return _; });
    if (!hit && body.includes(basename(path))) hit = new RegExp("\\]\\([^)]*" + basename(path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\)").test(body);
    if (hit) out.push(d);
  }
  return out;
}
