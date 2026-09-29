// Task UI: rows, lists with drag & drop, inline editing, menus, quick add.

import { h, today, addDays, mondayOf, fold } from "./util.js";
import { icon } from "./icons.js";
import { t, relDay, fmtDate } from "./i18n.js";
import { renderInline, renderMarkdown } from "./markdown.js";
import { vault, projectBySlug, docTitle } from "./model.js";
import { blockText } from "./ops.js";
import * as A from "./actions.js";
import { menu, modal, field, toast, errorToast, autoGrow } from "./ui.js";
import { state, setBusy } from "./state.js";
import { go, route } from "./nav.js";
import { undo } from "./store.js";

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

/* ------------------------------------------------------------ row */

export function taskRow(task, opts = {}) {
  const detailsOpen = !opts.compact || state.expanded.has(keyOf(task));
  const hasDetails = task.details.some((l) => l.trim());
  const el = h("div", {
    class: "task" + (task.done ? " done" : "") + (opts.compact ? " compact" : ""),
    draggable: movable(task) && opts.draggable !== false ? "true" : null,
  });
  el._task = task;

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
  title.append(h("span", { class: "task-text", html: renderInline(task.text) }));
  title.addEventListener("click", (e) => {
    if (e.target.closest("a, button, input")) return;
    startEdit(el, task);
  });

  const meta = [];
  if (opts.showDate && task.date) {
    const overdue = task.kind === "day" && !task.done && task.date < today();
    meta.push(h("button", { class: "chip chip-date" + (overdue ? " overdue" : ""), type: "button", onclick: (e) => { e.stopPropagation(); go(route.week(task.date)); } }, icon("calendar", 12), relDay(task.date)));
  }
  if (opts.showSource && task.kind === "doc") {
    meta.push(h("button", { class: "chip chip-source", type: "button", onclick: (e) => { e.stopPropagation(); go(route.doc(task.path)); } }, icon(task.docKind === "meeting" ? "users" : "file", 12), docTitle(task.path)));
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

  const more = h("button", { class: "icon-btn task-more", type: "button", "aria-label": t("common.more"), onclick: (e) => { e.stopPropagation(); taskMenu(more, task, el); } }, icon("more", 16));

  el.append(check, main, more);
  el.addEventListener("contextmenu", (e) => { e.preventDefault(); taskMenu({ x: e.clientX, y: e.clientY }, task, el); });
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

export function taskMenu(anchor, task, el) {
  const items = [];
  if (movable(task)) {
    const tdy = today();
    const nextMon = addDays(mondayOf(tdy), 7);
    items.push({ header: t("task.moveTo") });
    if (!(task.kind === "day" && task.date === tdy)) items.push({ label: t("date.today"), icon: "sun", onClick: () => run(A.moveTask(task, { kind: "day", date: tdy }), t("task.moved")) });
    if (!(task.kind === "day" && task.date === addDays(tdy, 1))) items.push({ label: t("date.tomorrow"), icon: "arrow-right", hint: relDay(addDays(tdy, 1)) === t("date.tomorrow") ? fmtDate(addDays(tdy, 1), "weekdayShort") : "", onClick: () => run(A.moveTask(task, { kind: "day", date: addDays(tdy, 1) }), t("task.moved")) });
    items.push({ label: t("date.nextWeek"), icon: "week", hint: fmtDate(nextMon, "short"), onClick: () => run(A.moveTask(task, { kind: "day", date: nextMon }), t("task.moved")) });
    if (task.kind !== "inbox") items.push({ label: t("nav.inbox"), icon: "inbox", onClick: () => run(A.moveTask(task, { kind: "inbox" }), t("task.moved")) });
    items.push({ label: t("task.pickDate"), icon: "calendar", onClick: () => pickDate(task.date || tdy, (d) => run(A.moveTask(task, { kind: "day", date: d }), t("task.moved"))) });
    items.push("-");
  }
  items.push({ label: t("common.edit"), icon: "pencil", hint: t("task.clickText"), onClick: () => el && startEdit(el, task) });
  items.push({ label: task.done ? t("task.markUndone") : t("task.markDone"), icon: "check", onClick: () => run(A.toggleTask(task, !task.done)) });
  if (movable(task)) items.push({ label: t("task.duplicate"), icon: "copy", onClick: () => run(A.duplicateTask(task)) });
  items.push({ label: t("task.openFile"), icon: "file", onClick: () => go(route.doc(task.path)) });
  items.push("-");
  items.push({ label: t("common.delete"), icon: "trash", danger: true, onClick: () => run(A.deleteTask(task), t("task.deleted")) });
  menu(anchor, items, { align: "end" });
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
  const meetingDoc = meeting || (task.type === "ref" && task.doc && task.doc.kind === "meeting" ? task.doc : null);
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
  const d = item.doc;
  const isMeeting = d && d.kind === "meeting";
  const p = d && d.project ? projectBySlug(d.project) : null;
  const el = h("div", {
    class: "task ref-row" + (isMeeting ? " is-meeting" : "") + (d ? "" : " missing") + (opts.compact ? " compact" : ""),
    draggable: movable(item) && opts.draggable !== false ? "true" : null,
    "data-color": p ? p.color : null,
    title: d ? d.path : item.target,
  });
  el._task = item;
  const open = () => { if (d) go(route.doc(d.path)); };
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
        h("span", { class: "task-text" }, d ? d.title : item.target)),
      !opts.compact && isMeeting && (d.attendees.length || p) ? h("div", { class: "task-meta" },
        d.attendees.length ? h("span", { class: "chip" }, icon("users", 12), d.attendees.slice(0, 3).join(", ")) : null,
        p ? h("span", { class: "chip chip-project", "data-color": p.color }, h("span", { class: "dot", "data-color": p.color }), h("span", { class: "chip-text" }, p.title)) : null) : null),
    more);
  return el;
}

/** Meeting of a day that is not placed in its list yet: drag it in between tasks. */
export function meetingPill(m, color) {
  const el = h("a", { class: "meeting-pill", href: route.doc(m.path), draggable: "true", "data-color": color, title: t("meeting.dragHint") },
    m.time ? h("span", { class: "meeting-pill-time" }, m.time) : icon("users", 12), h("span", { class: "meeting-pill-title" }, m.title));
  el._meeting = m;
  return el;
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
  const projects = [...v.projects.values()].filter((p) => p.status !== "done").sort((a, b) => a.title.localeCompare(b.title));
  const proj = h("select", { class: "input input-sm" }, h("option", { value: "" }, t("quick.noProject")),
    projects.map((p) => h("option", { value: p.slug, selected: p.slug === defaults.project }, p.title)));
  paint();
  const save = () => {
    const lines = text.value.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) { text.focus(); return false; }
    const tag = proj.value ? " #" + proj.value : "";
    const withTag = lines.map((l) => (tag && !fold(l).includes(fold(tag.trim())) ? l + tag : l));
    const target = when === "inbox" ? { kind: "inbox" } : { kind: "day", date: when === "today" ? today() : when === "tomorrow" ? addDays(today(), 1) : dateInput.value || today() };
    run(A.addTask(target, withTag), withTag.length > 1 ? t("quick.addedMany", { n: withTag.length }) : t("quick.added"));
  };
  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (save() !== false) m.close(); }
  });
  const m = modal({
    title: t("quick.title"),
    className: "modal-quick",
    body: [text, h("div", { class: "field-hint" }, t("quick.hint")), h("div", { class: "quick-row" }, seg, dateInput), projects.length ? field(t("common.project"), proj) : null],
    actions: [{ label: t("common.cancel") }, { label: t("quick.add"), primary: true, onClick: save }],
  });
}

export { projectBySlug };
