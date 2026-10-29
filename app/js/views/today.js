// "Today": the daily dashboard.

import { h, today, addDays } from "../util.js";
import { icon } from "../icons.js";
import { t, fmtDate, cap, relDay, relTime } from "../i18n.js";
import { vault, dayItems, dayTasks, overdueTasks, meetingsOn, unplacedMeetings, pendingActions, isTask, seriesDue, needsProcessing, waitingTasks } from "../model.js";
import { taskList, run, quickAdd, meetingPill, eventPill, seriesPill } from "../tasks.js";
import { wantEvents, eventsOn } from "../events.js";
import * as A from "../actions.js";
import { pageHeader, section, btn, meetingRow, progress } from "./common.js";
import { newMeetingDialog } from "./dialogs.js";
import { route } from "../nav.js";
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

  // --- aside: upcoming, waiting on others, meeting actions, inbox, recent
  const upcoming = h("div", { class: "upcoming" });
  for (let i = 1; i <= 6; i++) {
    const day = addDays(d, i);
    const dt = dayTasks(day);
    const ms = [...meetingsOn(day), ...eventsOn(day)];
    if (!dt.length && !ms.length) continue;
    upcoming.append(h("a", { class: "upcoming-day", href: route.week(day) },
      h("div", { class: "upcoming-head" }, h("span", { class: "upcoming-name" }, relDay(day)), h("span", { class: "upcoming-date" }, fmtDate(day, "short"))),
      h("div", { class: "upcoming-body" },
        ms.map((m) => h("div", { class: "upcoming-item" }, icon("users", 12), (m.time ? m.time + " · " : "") + m.title)),
        dt.length ? h("div", { class: "upcoming-item muted" }, icon("check", 12), t("today.tasksCount", { n: dt.filter((x) => !x.done).length })) : null)));
  }
  aside.append(section(t("today.upcoming"), upcoming.childElementCount ? upcoming : h("div", { class: "muted small pad" }, t("today.upcomingEmpty")), { icon: "calendar" }));

  // waiting on others, oldest first
  const waiting = waitingTasks().sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));
  if (waiting.length) {
    aside.append(section(t("today.waiting"), taskList(waiting.slice(0, 10), { compact: true, showDate: true, showSource: true }), { icon: "clock", count: waiting.length }));
  }

  // not planned yet: drag them into the day, or use their menu
  const actions = pendingActions(addDays(d, -30));
  if (actions.length) {
    aside.append(section(t("today.meetingActions"), taskList(actions.slice(0, 12), { compact: true, showSource: true }), { icon: "list-checks", count: actions.length }));
  }

  const inboxOpen = v.inbox.items.filter((x) => isTask(x) && !x.done);
  if (inboxOpen.length) {
    aside.append(section(t("nav.inbox"), taskList(inboxOpen.slice(0, 8), { compact: true }), {
      icon: "inbox", count: inboxOpen.length,
      actions: [h("a", { class: "btn btn-sm btn-ghost", href: route.inbox() }, t("common.seeAll"))],
    }));
  }

  const recent = [...v.docs.values()].filter((x) => !["week", "inbox", "template"].includes(x.kind))
    .sort((a, b) => b.mtime - a.mtime).slice(0, 6);
  if (recent.length) {
    aside.append(section(t("today.recent"), h("div", { class: "mini-list" }, recent.map((x) =>
      h("a", { class: "mini-item", href: route.doc(x.path) }, icon(x.kind === "meeting" ? "users" : x.kind === "project" ? "folder" : "file", 14),
        h("span", { class: "mini-title" }, x.title), h("span", { class: "mini-aside" }, relTime(x.mtime))))), { icon: "clock" }));
  }

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
