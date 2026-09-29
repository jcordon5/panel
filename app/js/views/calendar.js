// Month calendar with meetings and task load; click a day for its details.

import { h, today, addDays, mondayOf, parseISO, iso, isISODate } from "../util.js";
import { icon } from "../icons.js";
import { t, fmtDate, cap, weekdayShortNames, relDay } from "../i18n.js";
import { vault, dayItems, dayTasks, meetingsOn } from "../model.js";
import { taskList, dropZone } from "../tasks.js";
import { pageHeader, btn, iconBtn, section, meetingRow } from "./common.js";
import { newMeetingDialog } from "./dialogs.js";
import { unplaced } from "./today.js";
import { wantEvents, eventsOn } from "../events.js";
import { go, route } from "../nav.js";

let cur = { month: null, sel: null };

export const title = () => t("nav.calendar");

const shiftMonth = (ym, n) => {
  const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1);
  return iso(d).slice(0, 7);
};

export const keys = {
  ArrowLeft: () => go("#/calendar/" + shiftMonth(cur.month, -1)),
  ArrowRight: () => go("#/calendar/" + shiftMonth(cur.month, 1)),
};

export function render(root, r) {
  const tdy = today();
  let sel = isISODate(r.arg) ? r.arg : null;
  const month = sel ? sel.slice(0, 7) : /^\d{4}-\d{2}$/.test(r.arg) ? r.arg : tdy.slice(0, 7);
  if (!sel && month === tdy.slice(0, 7)) sel = tdy;
  cur = { month, sel };
  const v = vault();

  const first = month + "-01";
  const gridStart = mondayOf(first);
  const last = iso(new Date(+month.slice(0, 4), +month.slice(5, 7), 0));
  const gridEnd = addDays(mondayOf(last), 6);
  wantEvents(gridStart, gridEnd);

  root.append(pageHeader({
    title: cap(fmtDate(first, "month")),
    actions: [
      h("div", { class: "btn-group" },
        iconBtn("chevron-left", t("cal.prev"), () => go("#/calendar/" + shiftMonth(month, -1))),
        h("button", { class: "btn", type: "button", onclick: () => go("#/calendar/" + tdy) }, t("date.today")),
        iconBtn("chevron-right", t("cal.next"), () => go("#/calendar/" + shiftMonth(month, 1)))),
      btn(t("meeting.new"), "plus", () => newMeetingDialog({ date: sel || tdy }), "btn-primary"),
    ],
  }));

  const grid = h("div", { class: "cal-grid", role: "grid" });
  for (const n of weekdayShortNames()) grid.append(h("div", { class: "cal-dow", role: "columnheader" }, n));
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
    const inMonth = d.slice(0, 7) === month;
    const ms = meetingsOn(d);
    const evs = eventsOn(d);
    const tasks = dayTasks(d);
    const open = tasks.filter((x) => !x.done).length;
    const wk = [0, 6].includes(parseISO(d).getDay());
    const cell = h("button", {
      type: "button", role: "gridcell",
      class: "cal-cell" + (inMonth ? "" : " out") + (d === tdy ? " is-today" : "") + (d === sel ? " selected" : "") + (wk ? " is-weekend" : "") + (d < tdy ? " is-past" : ""),
      "aria-label": fmtDate(d, "long"),
      onclick: () => go("#/calendar/" + d),
      ondblclick: () => go(route.week(d)),
    },
    h("div", { class: "cal-cell-head" },
      h("span", { class: "cal-num" }, String(+d.slice(8))),
      tasks.length ? h("span", { class: "cal-tasks" + (open ? "" : " complete") + (open && d < tdy ? " overdue" : ""), title: t("cal.tasksTitle", { open, total: tasks.length }) }, open ? String(open) : icon("check", 11)) : null),
    h("div", { class: "cal-events" },
      ms.slice(0, 3).map((m) => h("span", { class: "cal-event", "data-color": m.project ? v.projects.get(m.project)?.color : null }, m.time ? h("b", {}, m.time + " ") : null, m.title)),
      evs.slice(0, Math.max(0, 3 - ms.length)).map((e) => h("span", { class: "cal-event cal-event-ext" }, e.time ? h("b", {}, e.time + " ") : null, e.title)),
      ms.length + evs.length > 3 ? h("span", { class: "cal-more" }, t("cal.more", { n: ms.length + evs.length - 3 })) : null));
    dropZone(cell, { kind: "day", date: d });
    grid.append(cell);
  }

  const panel = h("aside", { class: "cal-panel" });
  if (sel) {
    panel.append(
      h("div", { class: "cal-panel-head" },
        h("div", {}, h("div", { class: "eyebrow" }, relDay(sel)), h("h2", { class: "cal-panel-title" }, cap(fmtDate(sel, "full")))),
        h("a", { class: "btn btn-sm btn-ghost", href: route.week(sel) }, icon("week", 14), t("cal.openWeek"))),
      section(t("cal.plan"), [unplaced(sel), taskList(dayItems(sel), { target: { kind: "day", date: sel }, placeholder: t("task.add") })], {
        icon: "check", actions: [btn(t("meeting.new"), "users", () => newMeetingDialog({ date: sel }), "btn-sm btn-ghost")],
      }));
  }

  root.append(h("div", { class: "cal-layout" }, h("div", { class: "cal-main" }, grid, h("p", { class: "muted small hint-line" }, t("cal.hint"))), panel));
}
