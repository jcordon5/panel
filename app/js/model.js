// Vault model: turns the cached files into docs, projects, meetings, weeks and
// tasks. Everything is derived from the Markdown and memoised per store version.

import { store } from "./store.js";
import { parseDoc } from "./frontmatter.js";
import { basename, dirname, stripExt, fold, weekStart, addDays, isISODate, mondayOf } from "./util.js";
import { agendaRanges, assigneeOf } from "./meeting.js";
import { seriesRule, occursOn } from "./series.js";

export const P = {
  inbox: "inbox.md",
  weeks: "weeks",
  meetings: "meetings",
  projects: "projects",
  notes: "notes",
  templates: "templates",
  assets: "assets",
  people: "people",
  knowledge: "knowledge",
  series: "series",
  sources: "sources",
};

/** Kinds of knowledge notes: a procedure (how to do something), a resource (where something is), a fact. */
export const KNOWLEDGE_KINDS = ["howto", "resource", "fact"];

export const PROJECT_COLORS = ["indigo", "blue", "teal", "green", "amber", "orange", "rose", "violet", "slate"];

const WEEKDAYS = [
  ["lunes", "monday", "lun", "mon"], ["martes", "tuesday", "mar", "tue"], ["miercoles", "wednesday", "mie", "wed"],
  ["jueves", "thursday", "jue", "thu"], ["viernes", "friday", "vie", "fri"], ["sabado", "saturday", "sab", "sat"],
  ["domingo", "sunday", "dom", "sun"],
];

export const TASK_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s+(\S.*)$/;
// A list item that is only a [[link]]: in a day it places a meeting (or note) among the tasks
// "- [[meeting#^id]]" places one action item (a task with a ^id block id) of a meeting or note in a day
export const REF_RE = /^(\s*)[-*+]\s+\[\[([^\]|#\n]+)(#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]\s*$/;
// Obsidian block id at the end of a line: "- [ ] Send the minutes ^a1b2c3"
export const BLOCK_ID_RE = /[ \t]+\^([A-Za-z0-9-]+)[ \t]*$/;
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
  for (const k of ["person", "knowledge", "series", "source"]) if (fm.type === k) return k;
  if (path.startsWith(P.people + "/")) return "person";
  if (path.startsWith(P.knowledge + "/")) return "knowledge";
  if (path.startsWith(P.series + "/")) return "series";
  if (path.startsWith(P.sources + "/")) return "source";
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
  let blockId = null;
  const bm = BLOCK_ID_RE.exec(text);
  if (bm) { blockId = bm[1]; text = text.slice(0, bm.index); }
  const source = text; // what the user edits: time and text, without the block id
  let time = null, timeEnd = null;
  const tm = TIME_RE.exec(text);
  if (tm) { time = tm[1].replace(".", ":"); timeEnd = tm[2] ? tm[2].replace(".", ":") : null; text = text.slice(tm[0].length); }
  const tags = [];
  text.replace(TAG_RE, (_, _p, tag) => { tags.push(tag); return _; });
  const who = assigneeOf(text); // "@Name ..." = waiting on someone else
  return { time, timeEnd, text, tags, blockId, source, who: who ? who.name : null };
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
      const anchor = rm[3] && rm[3].startsWith("#^") ? rm[3].slice(2).trim() : "";
      items.push({ type: "ref", line: i, end: e, raw: l, indent: indentOf(l), target: rm[2].trim(), anchor, details: lines.slice(i + 1, e), text: rm[2].trim(), tags: [], ...extra });
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
    if (!["meeting", "note", "project", "doc", "person", "knowledge"].includes(doc.kind)) continue;
    const lines = store.files.get(doc.path).content.split("\n");
    // in a meeting, the checklist of things to bring up is an agenda, not action items
    const agenda = doc.kind === "meeting" ? agendaRanges(lines, doc.bodyLine) : [];
    for (const tk of allTasks(lines, doc.bodyLine, { path: doc.path, kind: "doc", docKind: doc.kind, date: doc.kind === "meeting" ? doc.date : null, project: doc.project })) {
      if (agenda.some(([a, b]) => tk.line >= a && tk.line < b)) continue;
      docTasks.push(tk);
    }
  }

  // "- [[doc#^id]]" in a day or the inbox: that task of the doc, planned there
  const byBlock = new Map(docTasks.filter((tk) => tk.blockId).map((tk) => [tk.path + "#" + tk.blockId, tk]));
  const containers = [...[...days.values()].map((d) => d.items), inbox.items];
  for (const items of containers) for (const it of items) {
    if (it.type !== "ref" || !it.anchor) continue;
    const tk = it.doc ? byBlock.get(it.doc.path + "#" + it.anchor) : null;
    it.action = tk || null;
    it.done = tk ? tk.done : false;
    if (tk) (tk.planned = tk.planned || []).push(it);
  }

  // project membership of week/inbox tasks by #tag
  const slugByFold = new Map([...projects.keys()].map((s) => [fold(s), s]));
  for (const tk of tasks) {
    const hit = tk.tags.map((tg) => slugByFold.get(fold(tg))).find(Boolean);
    tk.project = hit || null;
  }

  // people: by file name, title and aliases (accent/case-insensitive); unique first names too
  const people = [...docs.values()].filter((d) => d.kind === "person").sort((a, b) => a.title.localeCompare(b.title));
  const personIndex = new Map();
  const firstNames = new Map();
  for (const d of people) {
    for (const k of [stripExt(d.name), d.title, ...toList(d.fm.aliases), typeof d.fm.email === "string" ? d.fm.email : ""]) if (k) personIndex.set(fold(k), d);
    const first = fold(d.title.split(/\s+/)[0]);
    firstNames.set(first, firstNames.has(first) ? null : d);
  }
  for (const [k, d] of firstNames) if (d && !personIndex.has(k)) personIndex.set(k, d);
  for (const tk of [...tasks, ...docTasks]) tk.assignee = tk.who ? personIndex.get(fold(tk.who.replace(/^\[\[|\]\]$/g, ""))) || null : null;

  const knowledge = [...docs.values()].filter((d) => d.kind === "knowledge").sort((a, b) => b.mtime - a.mtime);
  const series = [...docs.values()].filter((d) => d.kind === "series").sort((a, b) => a.title.localeCompare(b.title));
  for (const sd of series) sd.rule = seriesRule(sd.fm, typeof sd.fm.created === "string" ? sd.fm.created.slice(0, 10) : null);
  const sources = [...docs.values()].filter((d) => d.kind === "source").sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const meetings = [...docs.values()].filter((d) => d.kind === "meeting")
    .sort((a, b) => ((b.date || "") + (b.time || "")).localeCompare((a.date || "") + (a.time || "")) || a.title.localeCompare(b.title));
  const notes = [...docs.values()].filter((d) => d.kind === "note");

  return { docs, projects, days, inbox, tasks, docTasks, meetings, notes, weekFiles, byName, byTitle, people, personIndex, knowledge, series, sources };
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
/** Real tasks and planned action items (both have a checkbox). */
export const isTask = (it) => it.type === "task" || !!it.action;
export function dayTasks(date) { return dayItems(date).filter(isTask); }

/** Meetings of a date that are not placed ([[ref]]) in that day's list. */
export function unplacedMeetings(date) {
  const placed = new Set(dayItems(date).filter((i) => i.type === "ref" && i.doc && !i.anchor).map((i) => i.doc.path));
  return meetingsOn(date).filter((m) => !placed.has(m.path));
}

export function meetingsOn(date) {
  return vault().meetings.filter((m) => m.date === date).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
}

/** Open action items of meetings since `since` that are not planned on a day yet. */
export function pendingActions(since) {
  return vault().docTasks.filter((x) => !x.done && !x.planned && !x.who && x.docKind === "meeting" && (!x.date || x.date >= since))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

export function overdueTasks(before) {
  const v = vault();
  const actions = [...v.days.values()].flatMap((d) => d.items).filter((it) => it.action && !it.done);
  return [...v.tasks, ...actions].filter((t) => t.kind === "day" && !t.done && t.date < before)
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

/* ------------------------------------------------------------ people, series, knowledge */

const unlink = (s) => String(s || "").trim().replace(/^@/, "").replace(/^\[\[|\]\]$/g, "").split("|")[0].trim();

/** The person a name refers to ("Ana", "ana-garcia", "[[Ana García]]", an alias or e-mail), or null. */
export function findPerson(name) {
  const k = fold(unlink(name));
  return k ? vault().personIndex.get(k) || null : null;
}

/** Attendees of a meeting or series: [{ name, person }] */
export function attendeesOf(doc) {
  return (doc ? doc.attendees : []).map((a) => ({ name: unlink(a), person: findPerson(a) })).filter((a) => a.name);
}

/** Meetings someone attended, newest first. */
export function meetingsWith(person) {
  return vault().meetings.filter((m) => attendeesOf(m).some((a) => a.person === person));
}

/** Open tasks waiting on someone else ("- [ ] @Name …"); of one person when given. */
export function waitingTasks(person) {
  const v = vault();
  return [...v.tasks, ...v.docTasks].filter((tk) => !tk.done && tk.who && (!person || tk.assignee === person));
}

export const seriesSlug = (sd) => stripExt(sd.name);
export const seriesBySlug = (slug) => vault().series.find((s) => seriesSlug(s) === slug || s.path === slug) || null;

/** The series a meeting belongs to (its `series:` field). */
export function seriesOf(meeting) {
  const s = meeting && meeting.fm.series;
  return typeof s === "string" && s ? seriesBySlug(unlink(s)) : null;
}

/** Sessions (meeting notes) of a series, newest first. */
export function sessionsOf(sd) {
  const slug = seriesSlug(sd);
  return vault().meetings.filter((m) => typeof m.fm.series === "string" && unlink(m.fm.series) === slug);
}

/** Series with a session on `date` whose note does not exist yet. */
export function seriesDue(date) {
  return vault().series.filter((sd) => sd.fm.status !== "paused" && occursOn(sd.rule, date) && !sessionsOf(sd).some((m) => m.date === date))
    .sort((a, b) => String(a.fm.time || "99").localeCompare(String(b.fm.time || "99")));
}

/** Sources (transcripts, emails…) attached to a meeting, waiting to be processed. */
export function sourcesOf(meeting) {
  const k = fold(stripExt(meeting.name));
  return vault().sources.filter((s) => typeof s.fm.meeting === "string" && fold(unlink(s.fm.meeting).split("/").pop()) === k);
}

/**
 * A meeting of the last `days` days that already happened, has notes and hasn't been processed into
 * a summary and tasks yet. (Older meetings — e.g. from before Panel 3 — are processed only on request.)
 */
export function needsProcessing(m, today, days = 14) {
  if (m.kind !== "meeting" || m.fm.processed || !m.date || m.date > today || m.date < addDays(today, -days)) return false;
  if (m.date === today && m.time) { // not before it starts
    const d = new Date(), now = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    if (String(m.time).padStart(5, "0") > now) return false;
  }
  if (sourcesOf(m).length) return true;
  // something written outside the "to discuss" list (which is prepared beforehand)
  const lines = m.body.split("\n");
  const skip = new Set(agendaRanges(lines).flatMap(([a, b]) => Array.from({ length: b - a }, (_, i) => a + i)));
  return lines.some((l, i) => !skip.has(i) && !/^\s*(#.*|[-*+]\s*(\[[ xX]\]\s*)?)?$/.test(l));
}
