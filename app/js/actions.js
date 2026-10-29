// High-level operations (tasks, meetings, notes, projects). Each one is a
// single undoable transaction over one or more Markdown files.

import { store, mutate, transaction, content, create, remove, move, exists } from "./store.js";
import { parseDoc, setFm } from "./frontmatter.js";
import { P, vault, weekPath, TASK_RE, BLOCK_ID_RE, resolveLink, containerItems } from "./model.js";
import { split, join, findTask, toggleLine, extractBlock, buildBlock, touch, locate, insertInto, weekTemplate, inboxTemplate, ensureDay } from "./ops.js";
import { t, fmtDate, weekdayName } from "./i18n.js";
import { slugify, today, mondayOf, weekId, dirname, basename, stripExt } from "./util.js";
import { findSection, meetingSections, SECTION_ORDER } from "./meeting.js";
import { ruleToFm } from "./series.js";

export class TaskGone extends Error {}

export function targetPath(target) {
  if (target.kind === "inbox") return P.inbox;
  return weekPath(weekId(target.date));
}

function prepare(text, target, path) {
  let lines = split(text ?? (target.kind === "inbox" ? inboxTemplate() : weekTemplate(mondayOf(target.date))));
  if (target.kind === "day") lines = ensureDay(lines, target.date, path);
  return lines;
}

function insertBlock(text, target, path, block, index) {
  let lines = prepare(text, target, path);
  const range = locate(lines, target, path);
  lines = insertInto(lines, range, block, index);
  return touch(join(lines));
}

/* ------------------------------------------------------------ tasks */

export async function addTask(target, text, index = Infinity) {
  const texts = Array.isArray(text) ? text : [text];
  const blocks = texts.map((s) => s.trim()).filter(Boolean).map((s) => buildBlock(s));
  if (!blocks.length) return;
  const path = targetPath(target);
  await transaction(t("undo.add"), () => mutate(path, (cur) => {
    let out = cur;
    blocks.forEach((b, n) => { out = insertBlock(out, target, path, b, index === Infinity ? Infinity : index + n); });
    return out;
  }));
}

export async function toggleTask(task, done) {
  await transaction(t("undo.toggle"), () => mutate(task.path, (text) => {
    const lines = split(text);
    const i = findTask(lines, task.line, task.raw);
    if (i < 0) throw new TaskGone();
    lines[i] = toggleLine(lines[i], done);
    return touch(join(lines));
  }));
}

/** Toggle a checkbox rendered from Markdown (notes, meetings...). */
export async function toggleLineAt(path, line, done) {
  const raw = split(content(path))[line];
  if (raw === undefined || !TASK_RE.test(raw)) return;
  await toggleTask({ path, line, raw }, done);
}

export async function updateTask(task, text) {
  if (!text.trim()) return deleteTask(task);
  await transaction(t("undo.edit"), () => mutate(task.path, (cur) => {
    const lines = split(cur);
    const i = findTask(lines, task.line, task.raw);
    if (i < 0) throw new TaskGone();
    const { lines: rest } = extractBlock(lines, i);
    const ind = " ".repeat(task.indent || 0);
    const block = buildBlock(text, task.done).map((l) => (l ? ind + l : l));
    if (task.blockId && !BLOCK_ID_RE.test(block[0])) block[0] += " ^" + task.blockId; // keep links from day plans
    return touch(join([...rest.slice(0, i), ...block, ...rest.slice(i)]));
  }));
}

function removeLine(item) {
  return mutate(item.path, (cur) => {
    const lines = split(cur);
    const i = findTask(lines, item.line, item.raw);
    if (i < 0) throw new TaskGone();
    return touch(join(extractBlock(lines, i).lines));
  });
}

export async function deleteTask(task) {
  await transaction(t("undo.delete"), async () => {
    await removeLine(task);
    for (const r of task.planned || []) await removeLine(r).catch(() => {}); // its places in day plans go too
  });
}

/** Take a planned action item out of the day plan (the task stays in its meeting). */
export async function unplanAction(ref) {
  await transaction(t("undo.unplan"), () => removeLine(ref));
}

/**
 * Plan a task that lives in a meeting or note on a day (or in the inbox): the task stays where it was
 * written, gets a ^block-id, and the day gets "- [[meeting#^id]]". Already planned: that link moves.
 */
export async function planAction(task, target, index = Infinity) {
  const placed = (task.planned || [])[0];
  if (placed) return moveTask(placed, target, index);
  await transaction(t("undo.plan"), async () => {
    let id = task.blockId;
    if (!id) {
      const used = content(task.path) || "";
      do id = Math.random().toString(36).slice(2, 8); while (used.includes("^" + id));
      await mutate(task.path, (cur) => {
        const lines = split(cur);
        const i = findTask(lines, task.line, task.raw);
        if (i < 0) throw new TaskGone();
        lines[i] = lines[i].replace(/\s+$/, "") + " ^" + id;
        return touch(join(lines));
      });
    }
    const dst = targetPath(target);
    await mutate(dst, (cur) => insertBlock(cur, target, dst, [`- [[${linkTarget(task.path)}#^${id}]]`], index));
  });
}

export async function duplicateTask(task) {
  await transaction(t("undo.add"), () => mutate(task.path, (cur) => {
    const lines = split(cur);
    const i = findTask(lines, task.line, task.raw);
    if (i < 0) throw new TaskGone();
    const end = i + 1 + task.details.length;
    const copy = lines.slice(i, end).map((l, n) => (n === 0 ? toggleLine(l, false) : l));
    return touch(join([...lines.slice(0, end), ...copy, ...lines.slice(end)]));
  }));
}

async function moveOne(task, target, index) {
  const dst = targetPath(target);
  if (task.path === dst) {
    return mutate(dst, (cur) => {
      let lines = split(cur);
      const i = findTask(lines, task.line, task.raw);
      if (i < 0) throw new TaskGone();
      const ex = extractBlock(lines, i);
      return insertBlock(join(ex.lines), target, dst, ex.block, index);
    });
  }
  const srcLines = split(content(task.path));
  const i = findTask(srcLines, task.line, task.raw);
  if (i < 0) throw new TaskGone();
  const { block } = extractBlock(srcLines, i);
  await mutate(dst, (cur) => insertBlock(cur, target, dst, block, index));
  await mutate(task.path, (cur) => {
    const lines = split(cur);
    const j = findTask(lines, task.line, task.raw);
    return j < 0 ? null : touch(join(extractBlock(lines, j).lines));
  });
}

export async function moveTask(task, target, index = Infinity) {
  await transaction(t("undo.move"), () => moveOne(task, target, index));
}

/** Move several tasks (e.g. overdue -> today) keeping their order. */
export async function moveTasks(tasks, target) {
  await transaction(t("undo.move"), async () => {
    for (const task of tasks) {
      // refresh line numbers: earlier moves may have shifted them
      const lines = split(content(task.path));
      const i = findTask(lines, task.line, task.raw);
      if (i < 0) continue;
      await moveOne({ ...task, line: i }, target, Infinity);
    }
  });
}

/* ------------------------------------------------------------ documents */

export function uniquePath(dir, base) {
  let p = `${dir}/${base}.md`, n = 2;
  while (exists(p)) p = `${dir}/${base}-${n++}.md`;
  return p;
}

function fill(tpl, vars, fmVals = {}) {
  let out = tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(vars[k] ?? ""));
  // re-serialise frontmatter values properly (quotes, lists) and drop empty keys
  const d = parseDoc(out);
  if (d.hasFm) {
    const upd = {};
    for (const [k, v] of Object.entries(d.fm)) {
      if (k in fmVals) upd[k] = fmVals[k];
      else if (v === "") upd[k] = null;
    }
    for (const [k, v] of Object.entries(upd)) {
      if (v === "" || v === null || v === undefined || (Array.isArray(v) && !v.length && k !== "attendees")) upd[k] = null;
    }
    out = setFm(out, upd);
  }
  return out;
}

function template(name, fallback, chosen) {
  const custom = content(chosen || `${P.templates}/${name}.md`) || content(`${P.templates}/${name}.md`);
  return custom && custom.trim() ? custom : fallback;
}

/**
 * Templates of a kind ("meeting", "note"): templates/meeting.md is the default,
 * templates/meeting-*.md (or any template with `type: meeting`) are extra ones.
 */
export function listTemplates(kind) {
  const out = [];
  for (const d of vault().docs.values()) {
    if (d.kind !== "template") continue;
    const name = stripExt(d.name);
    const isKind = name === kind || name.startsWith(kind + "-") || d.fm.type === kind;
    if (!isKind) continue;
    const isDefault = name === kind;
    const label = isDefault ? t("tpl.default") : (name.startsWith(kind + "-") ? name.slice(kind.length + 1) : name).replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());
    out.push({ path: d.path, name, label, isDefault });
  }
  return out.sort((a, b) => (b.isDefault - a.isDefault) || a.label.localeCompare(b.label));
}

/** templates/<kind>.md, created from the built-in template when missing. */
export async function ensureDefaultTemplate(kind) {
  const path = `${P.templates}/${kind}.md`;
  if (content(path) === null) {
    await transaction(t("undo.create"), () => create(path, kind === "meeting" ? builtinMeetingTemplate() : builtinNoteTemplate()));
  }
  return path;
}

/** Copy a template (or the built-in one) to templates/<kind>-<name>.md */
export async function createTemplate(kind, label) {
  const base = kind + "-" + slugify(label || t("tpl.new"), 40);
  const path = uniquePath(P.templates, base);
  const src = template(kind, kind === "meeting" ? builtinMeetingTemplate() : builtinNoteTemplate());
  await transaction(t("undo.create"), () => create(path, src));
  return path;
}

export function builtinMeetingTemplate() {
  return ["---", "type: meeting", "title: {{title}}", "date: {{date}}", "time: {{time}}", "project: {{project}}",
    "attendees: [{{attendees}}]", "created: {{today}}", "updated: {{today}}", "---", "", "# {{title}}", "",
    ...["agenda", "notes", "tasks", "decisions"].flatMap((k) => [`## ${t("mtg." + k)}`, "", ""])].join("\n");
}
export function builtinNoteTemplate() {
  return ["---", "type: note", "title: {{title}}", "created: {{today}}", "updated: {{today}}", "---", "", "# {{title}}", "", ""].join("\n");
}
export function builtinProjectTemplate() {
  return ["---", "type: project", "title: {{title}}", "status: active", "color: {{color}}", "created: {{today}}", "updated: {{today}}", "---", "",
    "# {{title}}", "", "{{description}}", "", `## ${t("tpl.goals")}`, "", "", `## ${t("tpl.links")}`, "", ""].join("\n");
}

/* ------------------------------------------------------------ meetings in the day plan */

/** Shortest [[link]] that points to `path`. */
function linkTarget(path) {
  const base = stripExt(basename(path));
  return resolveLink(base) === path ? base : stripExt(path);
}

/** "- [[name]]" line that places a meeting in a day list */
export function refLine(path) {
  return `- [[${linkTarget(path)}]]`;
}

/** Every [[ref]] (in week files / inbox) that points to `path`. */
function refsTo(path) {
  const v = vault();
  const out = [];
  for (const day of v.days.values()) for (const it of day.items) if (it.type === "ref" && it.doc && it.doc.path === path) out.push(it);
  for (const it of v.inbox.items) if (it.type === "ref" && it.doc && it.doc.path === path) out.push(it);
  return out;
}

/** Put a meeting into its day list, before the first item that happens later. */
async function placeMeeting(path, date, time, index) {
  if (!date) return;
  const target = { kind: "day", date };
  const wp = targetPath(target);
  const line = refLine(path);
  await mutate(wp, (cur) => {
    let lines = prepare(cur, target, wp);
    const range = locate(lines, target, wp);
    const items = containerItems(lines, range.start, range.end, {}, range.dividerMin).filter((i) => i.type === "task" || i.type === "ref");
    if (items.some((i) => i.type === "ref" && i.raw.trim() === line)) return cur;
    let at = index ?? Infinity;
    if (index === undefined && time) {
      const v = vault();
      const norm = (x) => String(x).replace(".", ":").padStart(5, "0");
      const times = items.map((i) => (i.type === "ref" ? !i.anchor && v.docs.get(resolveLink(i.target) || "")?.time : i.time) || null);
      const k = times.findIndex((tm) => tm && norm(tm) > norm(time));
      let last = -1;
      times.forEach((tm, n) => { if (tm && norm(tm) <= norm(time)) last = n; });
      if (k >= 0) at = k;
      else if (last >= 0) at = last + 1; // right after what happens before it
    }
    return touch(join(insertInto(lines, range, [line], at)));
  });
}

/** Drag & drop of a meeting (placed ref or unplaced pill) into a day list. */
export async function dropMeeting(meetingPath, refItem, target, index) {
  if (target.kind !== "day") return false;
  const doc = vault().docs.get(meetingPath);
  if (!doc) return false;
  await transaction(t("undo.move"), async () => {
    if (refItem) await moveOne(refItem, target, index);
    else await placeMeeting(meetingPath, target.date, doc.time, index);
    if (doc.date !== target.date) await setProps(meetingPath, { date: target.date });
  });
  return true;
}

export async function createMeeting({ title, date, time, project, attendees, template: tplPath, calendarId, location, series, agenda }) {
  title = title.trim() || t("meeting.untitled");
  date = date || today();
  const dir = project ? `${P.projects}/${project}/meetings` : P.meetings;
  const path = uniquePath(dir, `${date}-${slugify(title, 50)}`);
  const text = fill(template("meeting", builtinMeetingTemplate(), tplPath), {
    title, date, time: time || "", project: project || "", today: today(),
    attendees: (attendees || []).join(", "), weekday: weekdayName(date), dateLong: fmtDate(date, "long"),
  }, { title, date, time: time || null, project: project || null, attendees: attendees || [] });
  let text2 = text;
  if (calendarId || location || series) text2 = setFm(text, { location: location || null, calendar_id: calendarId || null, series: series || null });
  if (agenda && agenda.length) text2 = sectionInsert(text2, "agenda", agenda.map((a) => `- [ ] ${a}`));
  await transaction(t("undo.create"), async () => {
    await create(path, text2);
    await placeMeeting(path, date, time || null);
  });
  return path;
}

export async function createNote({ title, project, pinned, body, template: tplPath }) {
  title = title.trim() || t("note.untitled") + " " + today();
  const dir = project ? `${P.projects}/${project}` : P.notes;
  const path = uniquePath(dir, slugify(title, 60));
  let text = fill(template("note", builtinNoteTemplate(), tplPath), { title, today: today(), date: today(), project: project || "" }, { title });
  if (pinned) text = setFm(text, { pinned: true });
  if (body) text = text.replace(/\n*$/, "\n\n" + body.trim() + "\n");
  await transaction(t("undo.create"), () => create(path, text));
  return path;
}

export async function createProject({ name, color, description }) {
  name = name.trim();
  let slug = slugify(name, 40), n = 2;
  while (exists(`${P.projects}/${slug}`) || vault().projects.has(slug)) slug = slugify(name, 40) + "-" + n++;
  const text = fill(template("project", builtinProjectTemplate()), { title: name, color: color || "", description: description || "", today: today() }, { title: name, color: color || null })
    .replace(/\n{3,}/g, "\n\n");
  await transaction(t("undo.create"), () => create(`${P.projects}/${slug}/README.md`, text));
  return slug;
}

/** Update frontmatter; meetings/notes are moved when date or project change. */
export async function setProps(path, updates) {
  const doc = vault().docs.get(path);
  const refs = doc && doc.kind === "meeting" ? refsTo(path) : [];
  let newPath = path;
  await transaction(t("undo.edit"), async () => {
    await mutate(path, (cur) => touch(setFm(cur, updates)));
    if (!doc) return;
    const project = "project" in updates ? updates.project || null : doc.project;
    const date = updates.date || doc.date;
    const title = updates.title || doc.title;
    let dir = doc.dir;
    if (doc.kind === "meeting") dir = project ? `${P.projects}/${project}/meetings` : P.meetings;
    else if (doc.kind === "note" || doc.kind === "doc") {
      if ("project" in updates && project !== doc.project) dir = project ? `${P.projects}/${project}` : P.notes;
    }
    let base = basename(path).replace(/\.md$/, "");
    if (doc.kind === "meeting" && (updates.date || updates.title) && /^\d{4}-\d{2}-\d{2}/.test(base)) base = `${date}-${slugify(title, 50)}`;
    if (dir !== doc.dir || base !== basename(path).replace(/\.md$/, "")) {
      newPath = uniquePath(dir, base);
      newPath = await move(path, newPath);
    }
    if (doc.kind !== "meeting") return;
    // keep the meeting's place in the day plan: rename refs, follow date changes
    // (planned action items keep their day: only the link is renamed)
    const line = refLine(newPath);
    const stay = refs.filter((r) => r.anchor || r.kind !== "day" || r.date === date);
    for (const r of refs) {
      await mutate(r.path, (cur) => {
        const lines = split(cur);
        const i = findTask(lines, r.line, r.raw);
        if (i < 0) return null;
        if (r.anchor) lines[i] = " ".repeat(r.indent) + `- [[${linkTarget(newPath)}#^${r.anchor}]]`;
        else if (stay.includes(r)) lines[i] = " ".repeat(r.indent) + line;
        else lines.splice(i, 1);
        return touch(join(lines));
      });
    }
    if (updates.date && !stay.some((r) => !r.anchor)) await placeMeeting(newPath, date, updates.time ?? doc.time);
  });
  return newPath;
}

export async function deleteDoc(path) {
  const refs = refsTo(path);
  await transaction(t("undo.delete"), async () => {
    for (const r of refs) {
      await mutate(r.path, (cur) => {
        const lines = split(cur);
        const i = findTask(lines, r.line, r.raw);
        if (i < 0) return null;
        lines.splice(i, 1);
        return touch(join(lines));
      });
    }
    await remove(path);
  });
}

export async function deleteProject(slug) {
  await transaction(t("undo.delete"), () => remove(`${P.projects}/${slug}`));
}

export async function saveBody(path, body) {
  // used by quick edits (not the editor): keeps frontmatter
  await transaction(t("undo.edit"), () => mutate(path, (cur) => {
    const d = parseDoc(cur);
    const fmPart = d.hasFm ? cur.slice(0, cur.length - d.body.length) : "";
    return touch(fmPart + body);
  }));
}

export async function writeFileRaw(path, text, label) {
  await transaction(label || t("undo.edit"), () => mutate(path, () => text));
}

export { dirname };

/* ------------------------------------------------------------ meeting sections */

/** Add "## <section>" where it belongs (agenda, notes, tasks, decisions order). */
function addSection(lines, kind, bodyLine) {
  const secs = meetingSections(lines, bodyLine).filter((x) => x.kind);
  const after = secs.find((x) => SECTION_ORDER.indexOf(x.kind) > SECTION_ORDER.indexOf(kind));
  const at = after ? after.head : lines.length;
  const block = [`## ${t("mtg." + kind)}`, ""];
  const before = at > 0 && lines[at - 1].trim() ? [""] : [];
  const tail = after ? [""] : [];
  return [...lines.slice(0, at), ...before, ...block, ...tail, ...lines.slice(at)];
}

/** Text with new lines appended to a section of a meeting (created if missing). */
export function sectionInsert(text, kind, newLines) {
  const { bodyLine } = parseDoc(text);
  let lines = split(text);
  while (lines.length > 1 && lines[lines.length - 1] === "" && lines[lines.length - 2] === "") lines.pop();
  let sec = findSection(lines, kind, bodyLine);
  if (!sec) { lines = addSection(lines, kind, bodyLine); sec = findSection(lines, kind, bodyLine); }
  let at = sec.head;
  for (let i = sec.start; i < sec.end; i++) if (lines[i].trim()) at = i;
  let insert = newLines;
  if (at === sec.head) { // empty section: "## Heading", blank line, items
    if (lines[at + 1] === "" && at + 1 < sec.end) at++;
    else insert = ["", ...insert];
  }
  const out = [...lines.slice(0, at + 1), ...insert, ...lines.slice(at + 1)];
  const next = at + 1 + insert.length;
  if (next < out.length && /^#{1,6}\s/.test(out[next])) out.splice(next, 0, "");
  return out.join("\n");
}

/** Add lines to a section of a meeting note. */
export async function addToSection(path, kind, newLines) {
  await transaction(t("undo.add"), () => mutate(path, (cur) => touch(join(split(sectionInsert(cur, kind, newLines))))));
}

/** Replace one line (found by its text near `line`); an empty text removes it. */
export async function setLine(path, line, raw, text) {
  await transaction(text ? t("undo.edit") : t("undo.delete"), () => mutate(path, (cur) => {
    const lines = split(cur);
    const i = findTask(lines, line, raw);
    if (i < 0) throw new TaskGone();
    if (text) lines[i] = text; else lines.splice(i, 1);
    return touch(join(lines));
  }));
}

/* ------------------------------------------------------------ people, knowledge, series */

function entityText(type, title, fm, body = "") {
  return setFm(`---\ntype: ${type}\n---\n\n# ${title}\n\n${body}`, { title, ...fm, created: today(), updated: today() });
}

/** people/<name>.md — returns its path. */
export async function createPerson({ name, role, team, org, email }) {
  name = String(name || "").trim();
  if (!name) throw new Error(t("person.nameMissing"));
  const path = uniquePath(P.people, slugify(name, 50));
  await transaction(t("undo.create"), () => create(path, entityText("person", name, {
    role: role || "", team: team || "", org: org || "", email: email || "", aliases: [], ask_for: [],
  })));
  return path;
}

const KNOWLEDGE_BODY = { howto: () => "1. \n", resource: () => "- \n", fact: () => "" };

/** knowledge/<title>.md — a procedure, a resource or a fact. */
export async function createKnowledge({ title, kind = "howto", project, body }) {
  title = String(title || "").trim() || t("know.untitled");
  const path = uniquePath(P.knowledge, slugify(title, 60));
  await transaction(t("undo.create"), () => create(path, entityText("knowledge", title, {
    kind, project: project || null, people: [], source: "", tags: [],
  }, body || (KNOWLEDGE_BODY[kind] || KNOWLEDGE_BODY.fact)())));
  return path;
}

/** series/<title>.md — a recurring meeting. rule: { repeat, days, interval, nth, start, until } */
export async function createSeries({ title, rule, time, attendees, project, template: tpl }) {
  title = String(title || "").trim() || t("meeting.untitled");
  const path = uniquePath(P.series, slugify(title, 50));
  await transaction(t("undo.create"), () => create(path, entityText("series", title, {
    ...ruleToFm(rule), time: time || null, attendees: attendees || [], project: project || null, template: tpl || null,
  }, t("series.bodyHint") + "\n")));
  return path;
}

/**
 * Create the note of a series' session on `date`: same title, time, attendees, project and template,
 * and what was left to bring up (unticked "to discuss" items) in the previous session.
 */
export async function createSession(sd, date) {
  const slug = stripExt(basename(sd.path));
  const prev = vault().meetings.filter((m) => m.fm.series === slug && m.date && m.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
  const agenda = [];
  if (prev) {
    const lines = split(content(prev.path));
    for (const sec of meetingSections(lines, prev.bodyLine).filter((x) => x.kind === "agenda")) {
      for (let i = sec.start; i < sec.end; i++) { const m = /^\s*[-*+]\s+\[ \]\s+(.+)$/.exec(lines[i]); if (m) agenda.push(m[1]); }
    }
  }
  const tpl = typeof sd.fm.template === "string" && sd.fm.template ? (sd.fm.template.endsWith(".md") ? sd.fm.template : `${P.templates}/${sd.fm.template}.md`) : undefined;
  return createMeeting({
    title: sd.title, date, time: typeof sd.fm.time === "string" ? sd.fm.time : "", project: typeof sd.fm.project === "string" ? sd.fm.project : "",
    attendees: sd.attendees, template: tpl, series: slug, agenda,
  });
}

/** Skip one session of a series (adds the date to `skip`). */
export async function skipSession(sd, date) {
  const skip = Array.isArray(sd.fm.skip) ? sd.fm.skip.map(String) : typeof sd.fm.skip === "string" && sd.fm.skip ? sd.fm.skip.split(",").map((x) => x.trim()) : [];
  await transaction(t("undo.edit"), () => mutate(sd.path, (cur) => touch(setFm(cur, { skip: [...new Set([...skip, date])].sort() }))));
}
