// Task UI: rows, lists with drag & drop, inline editing, menus, quick add.

import { h, today, addDays, mondayOf } from "./util.js";
import { icon } from "./icons.js";
import { t, relDay, fmtDate } from "./i18n.js";
import { renderInline, renderMarkdown } from "./markdown.js";
import { vault, projectBySlug, docTitle, findPerson, meetingStatus } from "./model.js";
import { decompose, compose } from "./taskparts.js";
import { blockText } from "./ops.js";
import * as A from "./actions.js";
import { menu, modal, field, toast, errorToast, autoGrow } from "./ui.js";
import { state, setBusy } from "./state.js";
import { go, route } from "./nav.js";
import { undo } from "./store.js";
import { personChip, peoplePicker, timeField } from "./picker.js";

const keyOf = (task) => task.path + "\u0000" + task.raw;

export async function run(promise, msg) {
  try {
    await promise;
    if (msg) toast(msg, { action: { label: t("common.undo"), fn: doUndo } });
  } catch (e) {
    if (e instanceof A.TaskGone) toast(t("err.taskGone"), { error: true });
    else errorToast(e);
  }
}

export async function doUndo() {
  try {
    const label = await undo();
    toast(label ? t("undo.done", { what: label }) : t("undo.nothing"));
  } catch (e) { errorToast(e); }
}

const movable = (task) => task.kind === "day" || task.kind === "inbox";
// a task written in a meeting or note: it can be planned on a day without leaving its document
const plannable = (task) => task.type === "task" && task.kind === "doc";

function planMsg(target) {
  return t("task.planned", { date: (target.kind === "day" ? relDay(target.date) : t("nav.inbox")).toLowerCase() });
}

/* ------------------------------------------------------------ row */

export function taskRow(task, opts = {}) {
  const ref = opts.ref || null; // this row is a "- [[doc#^id]]" line of a day plan showing `task`
  const detailsOpen = !opts.compact || state.expanded.has(keyOf(task));
  const hasDetails = task.details.some((l) => l.trim());
  const proj = task.project ? projectBySlug(task.project) : null;
  const el = h("div", {
    class: "task" + (task.done ? " done" : "") + (opts.compact ? " compact" : "") + (ref ? " is-action" : "") + (proj ? " has-project" : ""),
    "data-color": proj ? proj.color : null,
    draggable: (ref ? movable(ref) : movable(task) || plannable(task)) && opts.draggable !== false ? "true" : null,
  });
  el._task = ref || task;

  const check = h("button", {
    class: "task-check", type: "button", role: "checkbox", "aria-checked": String(task.done),
    "aria-label": task.done ? t("task.markUndone") : t("task.markDone"),
    onclick: (e) => {
      e.stopPropagation();
      el.classList.toggle("done", !task.done);
      check.classList.add("pop");
      run(A.toggleTask(task, !task.done));
    },
  }, icon("check", 12));

  const title = h("div", { class: "task-title" });
  if (task.time) title.append(h("span", { class: "chip chip-time" }, task.time + (task.timeEnd ? "–" + task.timeEnd : "")));
  // "@Name …": a task someone else has to do (you are waiting on them)
  const who = task.who ? /^@(?:\[\[[^\]]+\]\]|\S+)\s*[:,-]?\s*/.exec(task.text) : null;
  if (who) title.append(personChip(task.who, { person: task.assignee }), " ");
  let shown = who ? task.text.slice(who[0].length) : task.text;
  // the project shows as a coloured chip and border, not as "#slug" in the text
  if (proj) shown = shown.replace(new RegExp("(^|\\s)#(" + [proj.slug, proj.code].filter(Boolean).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?=\\s|$)", "gi"), "$1").trim();
  title.append(h("span", { class: "task-text", html: renderInline(shown) }));
  title.addEventListener("click", (e) => {
    if (e.target.closest("a, button, input")) return;
    startEdit(el, task);
  });

  const meta = [];
  const at = ref || task;
  if (opts.showDate && at.date) {
    const overdue = at.kind === "day" && !task.done && at.date < today();
    meta.push(h("button", { class: "chip chip-date" + (overdue ? " overdue" : ""), type: "button", onclick: (e) => { e.stopPropagation(); go(route.week(at.date)); } }, icon("calendar", 12), relDay(at.date)));
  }
  const plan = !ref && task.planned && task.planned[0];
  if (plan) {
    meta.push(h("button", { class: "chip chip-date chip-planned", type: "button", title: planMsg(plan), onclick: (e) => { e.stopPropagation(); go(plan.kind === "day" ? route.week(plan.date) : route.inbox()); } },
      icon(plan.kind === "day" ? "calendar" : "inbox", 12), plan.kind === "day" ? relDay(plan.date) : t("nav.inbox")));
  }
  if (proj && !opts.hideProject) {
    meta.push(h("a", { class: "chip chip-project", href: route.project(proj.slug), "data-color": proj.color, onclick: (e) => e.stopPropagation() },
      h("span", { class: "dot", "data-color": proj.color }), h("span", { class: "chip-text" }, proj.title)));
  }
  if ((opts.showSource || ref) && task.kind === "doc") {
    meta.push(h("button", { class: "chip chip-source", type: "button", onclick: (e) => { e.stopPropagation(); go(route.doc(task.path)); } }, icon(task.docKind === "meeting" ? "users" : "file", 12), h("span", { class: "chip-text" }, docTitle(task.path))));
  }
  if (opts.showSource && task.kind === "inbox") meta.push(h("span", { class: "chip" }, icon("inbox", 12), t("nav.inbox")));
  if (hasDetails && opts.compact) {
    const n = task.details.filter((l) => l.trim()).length;
    meta.push(h("button", {
      class: "chip chip-toggle", type: "button", "aria-expanded": String(detailsOpen),
      onclick: (e) => { e.stopPropagation(); const k = keyOf(task); state.expanded.has(k) ? state.expanded.delete(k) : state.expanded.add(k); el.replaceWith(taskRow(task, opts)); },
    }, icon(detailsOpen ? "chevron-down" : "chevron-right", 12), String(n)));
  }

  const main = h("div", { class: "task-main" }, title,
    meta.length ? h("div", { class: "task-meta" }, meta) : null,
    hasDetails && detailsOpen ? h("div", { class: "task-details md", html: renderMarkdown(task.details.join("\n"), { path: task.path, lineOffset: task.line + 1 }) }) : null);

  const more = h("button", { class: "icon-btn task-more", type: "button", "aria-label": t("common.more"), onclick: (e) => { e.stopPropagation(); taskMenu(more, task, el, ref); } }, icon("more", 16));

  el.append(check, main, more);
  el.addEventListener("contextmenu", (e) => { e.preventDefault(); taskMenu({ x: e.clientX, y: e.clientY }, task, el, ref); });
  return el;
}

/* ------------------------------------------------------------ inline edit */

export function startEdit(el, task) {
  if (el.classList.contains("editing")) return;
  el.classList.add("editing");
  el.draggable = false;
  setBusy(true);
  const main = el.querySelector(".task-main");
  const original = blockText(task);
  const ta = h("textarea", { class: "task-edit", rows: "1", spellcheck: "true", "aria-label": t("task.edit") });
  ta.value = original;
  const hint = h("div", { class: "task-edit-hint" }, t("task.editHint"));
  main.replaceChildren(ta, hint);
  autoGrow(ta);
  ta.focus();
  const firstEnd = original.indexOf("\n");
  ta.setSelectionRange(firstEnd < 0 ? original.length : firstEnd, firstEnd < 0 ? original.length : firstEnd);
  let finished = false;
  const finish = async (save) => {
    if (finished) return;
    finished = true;
    const val = ta.value;
    el.classList.remove("editing");
    if (save && val !== original) {
      if (!val.trim()) await run(A.deleteTask(task), t("task.deleted"));
      else await run(A.updateTask(task, val));
    }
    setBusy(false);
    if (!save || val === original) state.render();
  };
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); finish(true); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); }
    else if (e.key === "Tab") {
      e.preventDefault();
      const s = ta.selectionStart, v = ta.value, ls = v.lastIndexOf("\n", s - 1) + 1;
      if (ls === 0) return; // the title line cannot be indented
      if (e.shiftKey) {
        if (v.slice(ls, ls + 2) === "  ") { ta.setRangeText("", ls, ls + 2, "end"); }
      } else ta.setRangeText("  ", ls, ls, "end");
      ta.dispatchEvent(new Event("input"));
    }
  });
  ta.addEventListener("blur", () => finish(true));
}

/* ------------------------------------------------------------ menus */

export function taskMenu(anchor, task, el, ref = null) {
  const items = [];
  const subject = ref || task; // what moves: the task itself, or its link in a day plan
  const where = (task.planned && task.planned[0]) || subject;
  let send = null;
  if (movable(subject)) {
    items.push({ header: t("task.moveTo") });
    send = (target) => run(A.moveTask(subject, target), t("task.moved"));
  } else if (plannable(task)) {
    items.push({ header: t("task.planFor") });
    send = (target) => run(A.planAction(task, target), planMsg(target));
  }
  if (send) {
    const tdy = today();
    const nextMon = addDays(mondayOf(tdy), 7);
    const on = (d) => where.kind === "day" && where.date === d;
    if (!on(tdy)) items.push({ label: t("date.today"), icon: "sun", onClick: () => send({ kind: "day", date: tdy }) });
    if (!on(addDays(tdy, 1))) items.push({ label: t("date.tomorrow"), icon: "arrow-right", hint: relDay(addDays(tdy, 1)) === t("date.tomorrow") ? fmtDate(addDays(tdy, 1), "weekdayShort") : "", onClick: () => send({ kind: "day", date: addDays(tdy, 1) }) });
    items.push({ label: t("date.nextWeek"), icon: "week", hint: fmtDate(nextMon, "short"), onClick: () => send({ kind: "day", date: nextMon }) });
    if (where.kind !== "inbox") items.push({ label: t("nav.inbox"), icon: "inbox", onClick: () => send({ kind: "inbox" }) });
    items.push({ label: t("task.pickDate"), icon: "calendar", onClick: () => pickDate((where.kind === "day" && where.date) || tdy, (d) => send({ kind: "day", date: d })) });
    if (ref || where !== subject) items.push({ label: t("task.unplan"), icon: "x", hint: t("task.unplanHint"), onClick: () => run(A.unplanAction(ref || where), t("task.unplanned")) });
    items.push("-");
  }
  items.push({ label: t("task.details"), icon: "settings", hint: t("task.detailsHint"), onClick: () => taskDialog(task) });
  items.push({ label: t("common.edit"), icon: "pencil", hint: t("task.clickText"), onClick: () => el && startEdit(el, task) });
  items.push({ label: task.done ? t("task.markUndone") : t("task.markDone"), icon: "check", onClick: () => run(A.toggleTask(task, !task.done)) });
  if (movable(task)) items.push({ label: t("task.duplicate"), icon: "copy", onClick: () => run(A.duplicateTask(task)) });
  items.push({ label: t("task.openFile"), icon: "file", onClick: () => go(route.doc(task.path)) });
  items.push("-");
  items.push({ label: t("common.delete"), icon: "trash", danger: true, onClick: () => run(A.deleteTask(task), t("task.deleted")) });
  menu(anchor, items, { align: "end" });
}

/* ------------------------------------------------------------ task parts (project, person, tags, time) */

const isProjectTag = (tag) => !!projectBySlug(tag) || !!projectBySlug(tag.toLowerCase());

/** "@Ana" when the first name is enough to find the person, "@[[Ana García]]" otherwise. */
export function whoToken(name) {
  const p = findPerson(name);
  const first = (p ? p.title : name).split(/\s+/)[0];
  if (p && findPerson(first) === p) return "@" + first;
  return /\s/.test(p ? p.title : name) ? `@[[${p ? p.title : name}]]` : "@" + name;
}

function projectOptions(selected) {
  const projects = [...vault().projects.values()].filter((p) => p.status !== "done" || p.slug === selected).sort((a, b) => a.title.localeCompare(b.title));
  return h("select", { class: "input" }, h("option", { value: "" }, t("quick.noProject")),
    projects.map((p) => h("option", { value: p.slug, selected: p.slug === selected }, p.title)));
}

/** The fields shared by the task dialog and quick add: project, person, tags. */
function partFields(parts) {
  const proj = projectOptions(parts.project);
  const who = peoplePicker(parts.who ? [parts.who] : [], { placeholder: t("task.whoPh"), single: true });
  const tags = h("input", { class: "input", type: "text", value: parts.tags.join(", "), placeholder: t("task.tagsPh") });
  return {
    els: [h("div", { class: "field-row" }, field(t("common.project"), proj), field(t("task.who"), who.el, t("task.whoHint"))), field(t("common.tags"), tags)],
    get: () => ({ project: proj.value, who: who.get().slice(-1)[0] || "", tags: tags.value.split(",").map((x) => x.trim().replace(/^#/, "")).filter(Boolean) }),
  };
}

/** Edit a task with fields instead of syntax: text, time, project, who it is for, tags. */
export function taskDialog(task) {
  const parts = decompose(task.source ?? task.text, isProjectTag);
  const text = h("input", { class: "input input-lg", type: "text", value: parts.text, autofocus: true });
  const time = timeField(parts.time);
  const more = partFields(parts);
  modal({
    title: t("task.details"),
    body: [field(t("task.text"), text), field(t("common.time"), time), ...more.els, h("p", { class: "field-hint" }, t("task.syntaxHint"))],
    actions: [{ label: t("common.cancel") }, {
      label: t("common.save"), primary: true, onClick: async () => {
        if (!text.value.trim()) { text.focus(); return false; }
        const line = compose({ ...parts, ...more.get(), time: time.value, timeEnd: time.value === parts.time ? parts.timeEnd : "", text: text.value }, whoToken);
        const rest = blockText(task).split("\n").slice(1);
        await run(A.updateTask(task, [line, ...rest].join("\n")), t("task.updated"));
      },
    }],
  });
}

export function pickDate(initial, onPick) {
  const input = h("input", { type: "date", class: "input", value: initial || today(), required: true });
  const quick = h("div", { class: "quick-dates" }, [0, 1, 2, 3, 4, 5, 6].map((n) => {
    const d = addDays(today(), n);
    return h("button", { type: "button", class: "btn btn-sm", onclick: () => { input.value = d; } }, relDay(d));
  }));
  modal({
    title: t("task.pickDate"),
    body: [quick, field(t("common.date"), input)],
    actions: [{ label: t("common.cancel") }, { label: t("task.move"), primary: true, onClick: () => { if (!input.value) return false; onPick(input.value); } }],
  });
}

/* ------------------------------------------------------------ drag & drop */

let dragging = null;
let indicator = null;

function clearDrop() {
  indicator?.remove();
  document.querySelectorAll(".drop-over").forEach((x) => x.classList.remove("drop-over"));
}

document.addEventListener("dragstart", (e) => {
  const pill = e.target.closest?.(".meeting-pill[draggable=true]");
  if (pill && pill._meeting) {
    dragging = { meeting: pill._meeting, el: pill };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", pill._meeting.title);
    document.body.classList.add("is-dragging");
    return;
  }
  const el = e.target.closest?.(".task[draggable=true]");
  if (!el || !el._task) return;
  dragging = { task: el._task, el };
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", el._task.text);
  setTimeout(() => el.classList.add("dragging"), 0);
  document.body.classList.add("is-dragging");
});
document.addEventListener("dragend", () => {
  dragging?.el.classList.remove("dragging");
  dragging = null;
  clearDrop();
  document.body.classList.remove("is-dragging");
});

function dropIndex(list, y) {
  const rows = [...list.querySelectorAll(":scope > .task")].filter((r) => r !== dragging.el);
  let i = 0;
  for (const r of rows) {
    const b = r.getBoundingClientRect();
    if (y > b.top + b.height / 2) i++; else break;
  }
  return { i, rows };
}

document.addEventListener("dragover", (e) => {
  if (!dragging) return;
  const list = e.target.closest?.(".task-list[data-drop]");
  const zone = !list && e.target.closest?.("[data-drop-zone]");
  if (!list && !zone) { clearDrop(); return; }
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  if (zone) {
    clearDrop();
    zone.classList.add("drop-over");
    return;
  }
  document.querySelectorAll(".drop-over").forEach((x) => x !== list && x.classList.remove("drop-over"));
  list.classList.add("drop-over");
  const { i, rows } = dropIndex(list, e.clientY);
  indicator = indicator || h("div", { class: "drop-indicator" });
  if (i < rows.length) list.insertBefore(indicator, rows[i]);
  else {
    const after = rows.length ? rows[rows.length - 1] : null;
    const addRow = list.querySelector(":scope > .task-add");
    if (after) after.after(indicator);
    else if (addRow) list.insertBefore(indicator, addRow);
    else list.append(indicator);
  }
});

document.addEventListener("drop", (e) => {
  if (!dragging) return;
  const list = e.target.closest?.(".task-list[data-drop]");
  const zone = !list && e.target.closest?.("[data-drop-zone]");
  const target = list?._target || zone?._target;
  if (!target) return;
  e.preventDefault();
  const { task, meeting } = dragging;
  const index = list ? dropIndex(list, e.clientY).i : Infinity;
  clearDrop();
  if (plannable(task)) {
    run(A.planAction(task, target, index), planMsg(target));
    return;
  }
  const meetingDoc = meeting || (task.type === "ref" && !task.anchor && task.doc && task.doc.kind === "meeting" ? task.doc : null);
  if (meetingDoc) {
    if (target.kind !== "day") { toast(t("meeting.onlyDays"), { error: true }); return; }
    const moved = meetingDoc.date !== target.date;
    run(A.dropMeeting(meetingDoc.path, task || null, target, index), moved ? t("meeting.rescheduled", { date: relDay(target.date) }) : null);
    return;
  }
  run(A.moveTask(task, target, index), zone ? t("task.moved") : null);
});

export function dropZone(el, target) {
  el.setAttribute("data-drop-zone", "");
  el._target = target;
  return el;
}

/* ------------------------------------------------------------ meetings / links inside a list */

/** A "- [[meeting]]" line of a day list, shown as a meeting row among the tasks. */
export function refRow(item, opts = {}) {
  if (item.action) return taskRow(item.action, { ...opts, ref: item });
  const d = item.doc;
  const isMeeting = d && d.kind === "meeting" && !item.anchor;
  const p = d && d.project ? projectBySlug(d.project) : null;
  const el = h("div", {
    class: "task ref-row" + (isMeeting ? " is-meeting" : "") + (d && !item.anchor ? "" : " missing") + (opts.compact ? " compact" : ""),
    draggable: movable(item) && opts.draggable !== false ? "true" : null,
    "data-color": p ? p.color : null,
    title: d ? d.path : item.target,
  });
  el._task = item;
  // today's meetings open in meeting mode, the rest as documents
  const open = () => { if (d) go(isMeeting && d.date === today() && !d.fm.processed ? route.meet(d.path) : route.doc(d.path)); };
  const more = h("button", { class: "icon-btn task-more", type: "button", "aria-label": t("common.more"), onclick: (e) => {
    e.stopPropagation();
    menu(more, [
      d ? { label: t("common.open"), icon: "file", onClick: open } : null,
      isMeeting ? { label: t("meeting.unplace"), icon: "x", hint: t("meeting.unplaceHint"), onClick: () => run(A.deleteTask(item)) } : { label: t("common.delete"), icon: "trash", danger: true, onClick: () => run(A.deleteTask(item), t("task.deleted")) },
    ], { align: "end" });
  } }, icon("more", 16));
  el.append(
    h("span", { class: "ref-icon" }, icon(isMeeting ? "users" : d ? "file" : "link", 13)),
    h("div", { class: "task-main", onclick: open },
      h("div", { class: "task-title" },
        isMeeting && d.time ? h("span", { class: "chip chip-time" }, d.time) : null,
        isMeeting ? statusIcon(d) : null,
        h("span", { class: "task-text" }, (d ? d.title : item.target) + (item.anchor ? " · " + t("task.actionGone") : ""))),
      !opts.compact && isMeeting && (d.attendees.length || p) ? h("div", { class: "task-meta" },
        d.attendees.length ? h("span", { class: "chip" }, icon("users", 12), d.attendees.slice(0, 3).join(", ")) : null,
        p ? h("span", { class: "chip chip-project", "data-color": p.color }, h("span", { class: "dot", "data-color": p.color }), h("span", { class: "chip-text" }, p.title)) : null) : null),
    more);
  return el;
}

/** Meeting of a day that is not placed in its list yet: drag it in between tasks. */
/** A small icon with where a meeting stands: not held yet, notes waiting for your AI, processed. */
export function statusIcon(m) {
  const st = meetingStatus(m, today());
  if (!st) return null;
  const ic = { upcoming: "clock", pending: "sparkles", processed: "check" }[st];
  return h("span", { class: "mstatus mstatus-" + st, title: t("mstatus." + st) }, icon(ic, 12));
}

export function meetingPill(m, color) {
  const el = h("a", { class: "meeting-pill", href: route.doc(m.path), draggable: "true", "data-color": color, title: t("meeting.dragHint") },
    m.time ? h("span", { class: "meeting-pill-time" }, m.time) : icon("users", 12), statusIcon(m), h("span", { class: "meeting-pill-title" }, m.title));
  el._meeting = m;
  return el;
}

/** A session of a recurring meeting whose note doesn't exist yet: one click creates it and opens meeting mode. */
export function seriesPill(sd, date, color) {
  return h("button", {
    class: "meeting-pill series-pill", type: "button", "data-color": color, title: t("series.pillHint"),
    onclick: async () => {
      try { go(route.meet(await A.createSession(sd, date))); } catch (e) { errorToast(e); }
    },
  }, sd.fm.time ? h("span", { class: "meeting-pill-time" }, String(sd.fm.time)) : icon("clock", 12), h("span", { class: "meeting-pill-title" }, sd.title), icon("clock", 11, "series-mark"));
}

/** Event from an external calendar without notes yet: one click creates the meeting note. */
export function eventPill(ev) {
  const label = ev.allDay ? t("event.allDay") : ev.time;
  return h("button", {
    class: "meeting-pill event-pill", type: "button",
    title: t("event.takeNotes") + (ev.location ? " · " + ev.location : "") + (ev.attendees.length ? "\n" + ev.attendees.join(", ") : ""),
    onclick: async () => {
      try {
        const path = await A.createMeeting({ title: ev.title, date: ev.date, time: ev.allDay ? "" : ev.time, attendees: ev.attendees, calendarId: ev.uid, location: ev.location });
        go(route.edit(path));
      } catch (e) { errorToast(e); }
    },
  }, h("span", { class: "meeting-pill-time" }, label), h("span", { class: "meeting-pill-title" }, ev.title), icon("pencil", 12, "event-pen"));
}

/* ------------------------------------------------------------ list */

/**
 * items: tasks (+ optional {type:"divider"}); opts:
 *  target      container for drops/new tasks ({kind:"day",date} | {kind:"inbox"})
 *  add         show the "Add task" row (default: when target given)
 *  compact, showDate, showSource, draggable, empty (text)
 */
export function taskList(items, opts = {}) {
  const list = h("div", { class: "task-list" + (opts.compact ? " compact" : "") });
  if (opts.target) { list.setAttribute("data-drop", ""); list._target = opts.target; }
  for (const it of items) {
    if (it.type === "divider") list.append(h("div", { class: "task-divider" }, it.text));
    else if (it.type === "ref") list.append(refRow(it, opts));
    else list.append(taskRow(it, opts));
  }
  if (!items.length && opts.empty) list.append(h("div", { class: "task-empty" }, opts.empty));
  if (opts.target && opts.add !== false) list.append(addRow(opts.target, opts.placeholder));
  return list;
}

export function addRow(target, placeholder) {
  const key = "add:" + JSON.stringify(target);
  const input = h("input", { class: "task-add-input", type: "text", placeholder: placeholder || t("task.add"), "data-focus-key": key, "aria-label": t("task.add"), enterkeyhint: "done" });
  const submit = async (texts) => {
    state.focusKey = key;
    input.value = "";
    await run(A.addTask(target, texts));
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing && input.value.trim()) { e.preventDefault(); submit([input.value]); }
    if (e.key === "Escape") input.blur();
  });
  input.addEventListener("paste", (e) => {
    const txt = e.clipboardData?.getData("text") || "";
    if (!txt.includes("\n")) return;
    e.preventDefault();
    const lines = txt.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, "").trim()).filter(Boolean);
    submit(lines);
  });
  return h("div", { class: "task-add" }, icon("plus", 15), input);
}

/* ------------------------------------------------------------ quick add */

export function quickAdd(defaults = {}) {
  const v = vault();
  const text = h("textarea", { class: "input input-lg", rows: "2", placeholder: t("quick.placeholder"), autofocus: true });
  autoGrow(text, 240);
  let when = defaults.date ? "date" : defaults.inbox ? "inbox" : "today";
  const dateInput = h("input", { type: "date", class: "input input-sm", value: defaults.date || addDays(today(), 1) });
  const opts = [
    ["today", t("date.today"), "sun"],
    ["tomorrow", t("date.tomorrow"), "arrow-right"],
    ["inbox", t("nav.inbox"), "inbox"],
    ["date", t("task.pickDate"), "calendar"],
  ];
  const seg = h("div", { class: "segmented", role: "radiogroup" });
  const paint = () => {
    seg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.v === when));
    dateInput.style.display = when === "date" ? "" : "none";
  };
  for (const [val, label, ic] of opts) {
    seg.append(h("button", { type: "button", "data-v": val, onclick: () => { when = val; paint(); if (val === "date") dateInput.focus(); else text.focus(); } }, icon(ic, 14), label));
  }
  const more = partFields({ project: defaults.project || "", who: defaults.who || "", tags: [] });
  paint();
  const save = () => {
    const lines = text.value.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) { text.focus(); return false; }
    const extra = more.get();
    const withTag = lines.map((l) => {
      const p = decompose(l, isProjectTag);
      return compose({ ...p, project: p.project || extra.project, who: p.who || extra.who, tags: [...new Set([...p.tags, ...extra.tags])] }, whoToken);
    });
    const target = when === "inbox" ? { kind: "inbox" } : { kind: "day", date: when === "today" ? today() : when === "tomorrow" ? addDays(today(), 1) : dateInput.value || today() };
    run(A.addTask(target, withTag), withTag.length > 1 ? t("quick.addedMany", { n: withTag.length }) : t("quick.added"));
  };
  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (save() !== false) m.close(); }
  });
  const m = modal({
    title: t("quick.title"),
    className: "modal-quick",
    body: [text, h("div", { class: "field-hint" }, t("quick.hint")), h("div", { class: "quick-row" }, seg, dateInput), ...more.els],
    actions: [{ label: t("common.cancel") }, { label: t("quick.add"), primary: true, onClick: save }],
  });
}

export { projectBySlug };
