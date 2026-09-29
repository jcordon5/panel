// "Today": the daily dashboard.

import { h, today, addDays } from "../util.js";
import { icon } from "../icons.js";
import { t, fmtDate, cap, relDay, relTime } from "../i18n.js";
import { vault, dayItems, dayTasks, overdueTasks, meetingsOn, unplacedMeetings } from "../model.js";
import { taskList, run, quickAdd, meetingPill, eventPill } from "../tasks.js";
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
  if (!ms.length && !evs.length) return null;
  const v = vault();
  return h("div", { class: "unplaced" },
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
  const tasks = items.filter((x) => x.type === "task");
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

  // --- aside: upcoming, meeting actions, inbox, recent
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

  const cutoff = addDays(d, -30);
  const actions = v.docTasks.filter((x) => !x.done && x.docKind === "meeting" && (!x.date || x.date >= cutoff))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (actions.length) {
    aside.append(section(t("today.meetingActions"), taskList(actions.slice(0, 12), { compact: true, showSource: true }), { icon: "list-checks", count: actions.length }));
  }

  const inboxOpen = v.inbox.items.filter((x) => x.type === "task" && !x.done);
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
