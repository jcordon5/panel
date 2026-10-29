// "Today": the daily dashboard.

import { h, today, addDays } from "../util.js";
import { icon } from "../icons.js";
import { t, fmtDate, cap, relDay } from "../i18n.js";
import { vault, dayItems, overdueTasks, meetingsOn, unplacedMeetings, pendingActions, isTask, seriesDue, needsProcessing, waitingTasks } from "../model.js";
import { taskList, run, quickAdd, meetingPill, eventPill, seriesPill } from "../tasks.js";
import { wantEvents, eventsOn } from "../events.js";
import * as A from "../actions.js";
import { pageHeader, section, btn, meetingRow, progress } from "./common.js";
import { newMeetingDialog } from "./dialogs.js";
import { route } from "../nav.js";
import { state } from "../state.js";
import { emptyState } from "../ui.js";

export const title = () => t("nav.today");

function greeting() {
  const hr = new Date().getHours();
  return hr < 6 ? t("greet.night") : hr < 13 ? t("greet.morning") : hr < 20 ? t("greet.afternoon") : t("greet.evening");
}

/** Meetings of a day not yet placed in its plan, as draggable pills. */
export function unplaced(date) {
  const ms = unplacedMeetings(date);
  const evs = eventsOn(date);
  const due = seriesDue(date);
  if (!ms.length && !evs.length && !due.length) return null;
  const v = vault();
  return h("div", { class: "unplaced" },
    due.length ? h("div", { class: "unplaced-hint" }, icon("clock", 12), t("series.dueHint")) : null,
    due.length ? h("div", { class: "col-meetings" }, due.map((sd) => seriesPill(sd, date, sd.project ? v.projects.get(sd.project)?.color : null))) : null,
    ms.length ? h("div", { class: "unplaced-hint" }, icon("grip", 12), t("meeting.dragHint")) : null,
    ms.length ? h("div", { class: "col-meetings" }, ms.map((m) => meetingPill(m, m.project ? v.projects.get(m.project)?.color : null))) : null,
    evs.length ? h("div", { class: "unplaced-hint" }, icon("calendar", 12), t("event.hint")) : null,
    evs.length ? h("div", { class: "col-meetings" }, evs.map(eventPill)) : null);
}

export function render(root) {
  const d = today();
  wantEvents(d, addDays(d, 6));
  const v = vault();
  const items = dayItems(d);
  const tasks = items.filter(isTask);
  const done = tasks.filter((x) => x.done).length;
  const overdue = overdueTasks(d);
  const meetings = meetingsOn(d);

  root.append(pageHeader({
    eyebrow: greeting(),
    title: cap(fmtDate(d, "full")),
    subtitle: tasks.length ? t("today.progress", { done, total: tasks.length }) : t("today.nothing"),
    actions: [btn(t("meeting.new"), "users", () => newMeetingDialog()), btn(t("quick.title"), "plus", () => quickAdd(), "btn-primary")],
  }));
  if (tasks.length) root.append(progress(done, tasks.length));

  const main = h("div", { class: "today-main" });
  const aside = h("aside", { class: "today-aside" });
  root.append(h("div", { class: "today-grid" }, main, aside));

  if (overdue.length) {
    main.append(section(t("today.overdue"), taskList(overdue, { showDate: true, draggable: true }), {
      cls: "section-alert", icon: "alert", count: overdue.length,
      actions: [btn(t("today.bringAll"), "arrow-right", () => run(A.moveTasks(overdue, { kind: "day", date: d }), t("today.broughtAll", { n: overdue.length })), "btn-sm")],
    }));
  }

  main.append(section(t("today.tasks"), [
    unplaced(d),
    taskList(items, { target: { kind: "day", date: d }, placeholder: t("today.addPh"), empty: null }),
  ], { icon: "sun", count: tasks.length - done, actions: [btn(t("meeting.new"), "users", () => newMeetingDialog({ date: d }), "btn-sm btn-ghost")] }));

  // --- for your AI: meetings with notes but no summary yet, and captured sources
  // the last two weeks only: older meetings (e.g. from before Panel 3) are processed on request
  const toProcess = v.meetings.filter((m) => m.date >= addDays(d, -14) && needsProcessing(m, d));
  if (toProcess.length || v.sources.length) {
    main.append(section(t("today.toProcess"), [
      h("p", { class: "muted small process-hint" }, icon("sparkles", 13), " ", t("today.toProcessHint")),
      toProcess.length ? h("div", { class: "rows" }, toProcess.slice(0, 8).map((m) => meetingRow(m))) : null,
      v.sources.length ? h("div", { class: "rows" }, v.sources.slice(0, 8).map(sourceRow)) : null,
    ], { icon: "sparkles", count: toProcess.length + v.sources.length, cls: "section-ai" }));
  }

  // --- aside: short lists (5 each, "see all" expands in place)
  const waiting = waitingTasks().sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));
  if (waiting.length) aside.append(shortList("waiting", t("today.waiting"), "clock", waiting, { compact: true, showDate: true, showSource: true }));
  // not planned yet: drag them into the day, or use their menu
  const actions = pendingActions(addDays(d, -30));
  if (actions.length) aside.append(shortList("actions", t("today.meetingActions"), "list-checks", actions, { compact: true, showSource: true }));
  const inboxOpen = v.inbox.items.filter((x) => isTask(x) && !x.done);
  if (inboxOpen.length) aside.append(shortList("inbox", t("nav.inbox"), "inbox", inboxOpen, { compact: true }));

  if (!tasks.length && !overdue.length && !meetings.length && !v.docs.size) {
    main.append(emptyState("sparkles", t("today.emptyTitle"), t("today.emptyText")));
  }
}

function sourceRow(s) {
  return h("a", { class: "row doc-row", href: route.doc(s.path) },
    h("span", { class: "row-icon" }, icon("upload", 16)),
    h("div", { class: "row-main" },
      h("div", { class: "row-title" }, s.title),
      h("div", { class: "row-meta" }, h("span", {}, t("cap.kind." + (s.fm.kind || "note"))), s.date ? h("span", {}, relDay(s.date)) : null)));
}

const expanded = new Set();
const SHORT = 5;

/** A section that shows the first few items and expands in place. */
function shortList(key, title, ic, items, opts) {
  const all = expanded.has(key);
  const more = items.length > SHORT ? h("button", { class: "btn btn-sm btn-ghost show-more", type: "button", onclick: () => { all ? expanded.delete(key) : expanded.add(key); state.render(); } },
    all ? t("common.showLess") : t("common.showAll", { n: items.length })) : null;
  return section(title, [taskList(all ? items : items.slice(0, SHORT), opts), more], { icon: ic, count: items.length });
}
