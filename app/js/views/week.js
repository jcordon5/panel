// Week board: one column per day (+ inbox), drag & drop between them.

import { h, today, addDays, weekId, weekStart, mondayOf, isoWeek } from "../util.js";
import { icon } from "../icons.js";
import { t, fmtDate, weekdayName, cap } from "../i18n.js";
import { vault, dayItems, overdueTasks, unplacedMeetings, weekPath } from "../model.js";
import { taskList, run, dropZone, meetingPill, eventPill } from "../tasks.js";
import { wantEvents, eventsOn } from "../events.js";
import * as A from "../actions.js";
import { pageHeader, btn, iconBtn, progress } from "./common.js";
import { newMeetingDialog } from "./dialogs.js";
import { go, route } from "../nav.js";
import { state, savePrefs, requestRender } from "../state.js";
import { menu } from "../ui.js";

let currentStart = null;
let lastHash = null;

export const title = (r) => t("week.word") + " " + isoWeek(startFrom(r)).week;
export const keys = {
  ArrowLeft: () => go(route.week(addDays(currentStart, -7))),
  ArrowRight: () => go(route.week(addDays(currentStart, 7))),
};

function startFrom(r) {
  return weekStart(r.arg) || mondayOf(r.arg && /^\d{4}-\d{2}-\d{2}$/.test(r.arg) ? r.arg : today());
}

export function leave() { lastHash = null; }

export function render(root, r) {
  const start = startFrom(r);
  currentStart = start;
  wantEvents(start, addDays(start, 6));
  const end = addDays(start, 6);
  const tdy = today();
  const isCurrent = mondayOf(tdy) === start;
  const v = vault();
  const overdue = isCurrent ? overdueTasks(tdy) : [];
  const days = [0, 1, 2, 3, 4].map((i) => addDays(start, i));

  let total = 0, done = 0;
  for (let i = 0; i < 7; i++) for (const x of dayItems(addDays(start, i))) if (x.type === "task") { total++; if (x.done) done++; }

  const nav = h("div", { class: "btn-group" },
    iconBtn("chevron-left", t("week.prev"), () => go(route.week(addDays(start, -7)))),
    h("button", { class: "btn" + (isCurrent ? " active" : ""), type: "button", onclick: () => go(route.week(tdy)) }, t("week.thisWeek")),
    iconBtn("chevron-right", t("week.next"), () => go(route.week(addDays(start, 7)))));

  const more = iconBtn("more", t("common.more"), () => menu(more, [
    { label: state.prefs.weekend ? t("week.hideWeekend") : t("week.showWeekend"), icon: "calendar", onClick: () => { state.prefs.weekend = !state.prefs.weekend; savePrefs(); requestRender(); } },
    { label: state.prefs.inboxColumn ? t("week.hideInbox") : t("week.showInbox"), icon: "inbox", onClick: () => { state.prefs.inboxColumn = !state.prefs.inboxColumn; savePrefs(); requestRender(); } },
    "-",
    { label: t("common.openFile"), icon: "file", disabled: !v.docs.has(weekPath(weekId(start))), onClick: () => go(route.doc(weekPath(weekId(start)))) },
  ], { align: "end" }));

  const actions = [nav];
  if (overdue.length) actions.unshift(btn(t("week.bringOverdue", { n: overdue.length }), "alert", () => run(A.moveTasks(overdue, { kind: "day", date: tdy }), t("today.broughtAll", { n: overdue.length })), "btn-warn"));
  actions.push(more);

  root.append(pageHeader({
    eyebrow: `${fmtDate(start, "short")} – ${fmtDate(end, "medium")}`,
    title: t("week.word") + " " + isoWeek(start).week,
    subtitle: total ? t("week.progress", { done, total }) : t("week.empty"),
    actions,
  }));
  if (total) root.append(progress(done, total));

  const board = h("div", { class: "board" + (state.prefs.inboxColumn ? " with-inbox" : ""), "data-scroll-key": "board", style: { "--cols": String(5 + (state.prefs.weekend ? 1 : 0) + (state.prefs.inboxColumn ? 1 : 0)) } });

  if (state.prefs.inboxColumn) {
    const items = v.inbox.items;
    board.append(h("div", { class: "col col-inbox" },
      dropZone(h("div", { class: "col-head" },
        h("div", { class: "col-title" }, icon("inbox", 15), h("span", {}, t("nav.inbox"))),
        h("span", { class: "col-count" }, String(items.filter((x) => x.type === "task" && !x.done).length))), { kind: "inbox" }),
      h("div", { class: "col-body" }, taskList(items, { target: { kind: "inbox" }, compact: true, placeholder: t("task.addShort") }))));
  }

  const dayParts = (d) => {
    const items = dayItems(d);
    const tasks = items.filter((x) => x.type === "task");
    const doneN = tasks.filter((x) => x.done).length;
    const meetings = unplacedMeetings(d);
    const events = eventsOn(d);
    const isToday = d === tdy;
    const head = dropZone(h("div", { class: "col-head" },
      h("div", { class: "col-date" },
        h("span", { class: "col-dow" }, cap(weekdayName(d, true))),
        h("span", { class: "col-num", title: isToday ? t("date.today") : null }, String(+d.slice(8)))),
      tasks.length ? h("span", { class: "col-count" + (doneN === tasks.length ? " complete" : "") }, `${doneN}/${tasks.length}`) : null,
      h("button", { class: "icon-btn icon-btn-sm col-add-meeting", type: "button", title: t("meeting.newOn"), "aria-label": t("meeting.newOn"), onclick: () => newMeetingDialog({ date: d }) }, icon("users", 14))),
    { kind: "day", date: d });
    return [
      head,
      meetings.length || events.length ? h("div", { class: "col-meetings" },
        meetings.map((m) => meetingPill(m, m.project ? v.projects.get(m.project)?.color : null)), events.map(eventPill)) : null,
      h("div", { class: "col-body" }, taskList(items, { target: { kind: "day", date: d }, compact: true, placeholder: t("task.addShort") })),
    ];
  };
  const stateCls = (d) => (d === tdy ? " is-today" : "") + (d < tdy ? " is-past" : "");

  for (const d of days.slice(0, 5)) {
    board.append(h("div", { class: "col" + stateCls(d) }, dayParts(d)));
  }
  if (state.prefs.weekend) {
    // Saturday + Sunday share one column, like a paper planner
    const [sat, sun] = [addDays(start, 5), addDays(start, 6)];
    board.append(h("div", { class: "col col-weekend" },
      h("div", { class: "col-part" + stateCls(sat) }, dayParts(sat)),
      h("div", { class: "col-part" + stateCls(sun) }, dayParts(sun))));
  }
  root.append(board);
  root.append(h("p", { class: "muted small hint-line" }, icon("grip", 13), t("week.hint")));

  // bring today's column into view: sideways on medium screens, down the page on phones
  const fresh = location.hash !== lastHash; // first render of this route, not a re-render
  lastHash = location.hash;
  if (isCurrent && fresh) setTimeout(() => {
    const col = board.querySelector(".is-today");
    if (!col) return;
    if (innerWidth <= 760) col.scrollIntoView({ block: "start" }); // phones: columns are stacked
    else if (board.scrollWidth > board.clientWidth && board.scrollLeft === 0) board.scrollLeft = Math.max(0, col.offsetLeft - 16);
  });
}
