// "Stats": how loaded you are — meetings and tasks over the last weeks, and what that says.

import { h, today, storage, addDays } from "../util.js";
import { icon } from "../icons.js";
import { t, fmtDate, cap, weekdayShortNames, lang } from "../i18n.js";
import { projectBySlug, findPerson } from "../model.js";
import { computeStats, WEEK_HOURS, DEFAULT_MEETING_MIN, TASK_MIN } from "../stats.js";
import { go, route } from "../nav.js";
import { pageHeader } from "./common.js";
import { state } from "../state.js";

export const title = () => t("stats.title");

const RANGES = [4, 12, 26];
let weeks = RANGES.includes(+storage("stats.weeks")) ? +storage("stats.weeks") : 12;

const num = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toLocaleString(lang() === "es" ? "es-ES" : "en-GB", { maximumFractionDigits: d });
const hrs = (x) => t("stats.hours", { h: num(x) });

export function render(root) {
  const s = computeStats(today(), weeks);
  const seg = h("div", { class: "segmented", role: "radiogroup", "aria-label": t("stats.range") },
    RANGES.map((n) => h("button", { type: "button", class: n === weeks ? "active" : "", "aria-checked": String(n === weeks), role: "radio",
      onclick: () => { weeks = n; storage("stats.weeks", String(n)); state.render(); } }, t("stats.weeksN", { n }))));
  root.append(pageHeader({
    title: t("stats.title"),
    subtitle: t("stats.subtitle", { from: fmtDate(s.start, "short"), to: fmtDate(addDays(s.weekList[s.weeks].start, -1), "short") }),
    actions: [seg],
  }));
  const tip = tooltip();

  if (!s.totals.weeksUsed) {
    root.append(h("div", { class: "stats-empty" }, icon("stats", 22), h("p", {}, t("stats.empty"))));
    return;
  }

  // --- headline numbers
  const T = s.totals;
  root.append(h("div", { class: "stat-tiles" },
    tile(t("stats.kMeetings"), num(T.meetingsPerWeek), t("stats.perWeek"), compare(T.thisWeek.meetings, T.meetingsPerWeek, t("stats.thisWeekN", { n: T.thisWeek.meetings }))),
    tile(t("stats.kMeetingH"), hrs(T.meetingHPerWeek), t("stats.ofWeek", { pct: Math.round(T.meetingHPerWeek / WEEK_HOURS * 100), h: WEEK_HOURS }), compare(T.thisWeek.meetingH, T.meetingHPerWeek, t("stats.thisWeekH", { h: num(T.thisWeek.meetingH) }))),
    tile(t("stats.kTasks"), num(T.tasksPerDay), t("stats.perWorkday")),
    tile(t("stats.kDone"), T.completion === null ? "—" : Math.round(T.completion * 100) + "%", t("stats.doneHint")),
    tile(t("stats.kFree"), String(T.freeDays), t("stats.freeHint", { n: T.workdays })),
    tile(t("stats.kOverdue"), String(T.overdue), T.waiting ? t("stats.waitingN", { n: T.waiting }) : null, null, () => go(route.today())),
  ));

  // --- what it says
  root.append(h("section", { class: "section stats-insights" },
    h("div", { class: "section-head" }, h("h2", { class: "section-title" }, icon("sparkles", 15), t("stats.insights"))),
    h("ul", { class: "insights" }, s.insights.map(insight))));

  const grid = h("div", { class: "stats-grid" });
  root.append(grid);

  // --- weeks
  const wl = s.weekList;
  const wLabel = (w) => w.current ? t("stats.thisWeek") : fmtDate(w.start, "short");
  grid.append(card(t("stats.cMeetingH"), t("stats.cMeetingHSub"), columns(wl.map((w) => ({
    label: wLabel(w), segs: [{ v: w.meetingH, cls: "s-a" }], muted: w.current,
    tip: `${wLabel(w)} · ${t("stats.meetingsN", { n: w.meetings })} · ${hrs(w.meetingH)}`,
  })), { fmt: (x) => num(x, 0) + " h", avg: T.meetingHPerWeek, avgLabel: t("stats.avg") }), { wide: true, table: weekTable(wl, wLabel) }));

  grid.append(card(t("stats.cTasks"), null, columns(wl.map((w) => ({
    label: wLabel(w), muted: w.current,
    segs: [{ v: w.done, cls: "s-a" }, { v: w.tasks - w.done, cls: "s-b" }],
    tip: `${wLabel(w)} · ${t("stats.tasksDone", { done: w.done, n: w.tasks })}`,
  })), { fmt: (x) => num(x, 0) }), { wide: true, legend: [["s-a", t("stats.lDone")], ["s-b", t("stats.lOpen")]] }));

  // --- weekdays
  const names = weekdayShortNames();
  const prof = s.profile.filter((p) => p.weekday < 5 || p.load > 0.05);
  grid.append(card(t("stats.cWeekday"), t("stats.cWeekdaySub"), bars(prof.map((p) => ({
    label: names[p.weekday], v: p.load, value: hrs(p.load),
    tip: `${names[p.weekday]} · ${hrs(p.meetingH)} ${t("stats.ofMeetings")} · ${t("stats.tasksAvg", { n: num(p.tasks) })}`,
  })))));

  // --- hours of the day
  const first = Math.min(8, ...s.hours.map((n, i) => (n ? i : 24)));
  const last = Math.max(18, ...s.hours.map((n, i) => (n ? i : 0)));
  const hrRange = []; for (let i = first; i <= last; i++) hrRange.push(i);
  grid.append(card(t("stats.cHours"), t("stats.cHoursSub"), columns(hrRange.map((i) => ({
    label: String(i), segs: [{ v: s.hours[i], cls: "s-a" }], tip: `${i}:00–${i + 1}:00 · ${t("stats.meetingsN", { n: s.hours[i] })}`,
  })), { fmt: (x) => num(x, 0), thin: true })));

  // --- every day
  grid.append(card(t("stats.cHeat"), t("stats.cHeatSub", { m: DEFAULT_MEETING_MIN, t: TASK_MIN }), heatmap(s, names), { wide: true }));

  // --- busiest days
  const busiest = s.days.filter((d) => !d.future && d.load > 0).sort((a, b) => b.load - a.load).slice(0, 6);
  if (busiest.length) grid.append(card(t("stats.cBusiest"), null, h("ol", { class: "busy-days" }, busiest.map((d) =>
    h("li", {}, h("a", { href: route.week(d.date) }, cap(fmtDate(d.date, "full"))),
      h("span", { class: "busy-meta" }, t("stats.meetingsN", { n: d.meetings }), " · ", t("stats.tasksN", { n: d.tasks })),
      h("span", { class: "busy-load" }, hrs(d.load)))))));

  // --- projects and people
  if (s.projects.length) {
    const top = s.projects.slice(0, 8);
    grid.append(card(t("stats.cProjects"), t("stats.cProjectsSub"), bars(top.map((p) => {
      const pr = projectBySlug(p.slug);
      return { label: pr ? pr.title : p.slug, color: pr?.color, v: p.total, value: String(p.total), href: route.project(p.slug),
        tip: `${pr ? pr.title : p.slug} · ${t("stats.tasksN", { n: p.tasks })} · ${t("stats.meetingsN", { n: p.meetings })}` };
    }))));
  }
  if (s.people.length) {
    grid.append(card(t("stats.cPeople"), t("stats.cPeopleSub"), bars(s.people.slice(0, 8).map((p) => {
      const person = findPerson(p.name);
      return { label: person ? person.title : p.name, v: p.n, value: String(p.n), href: person ? route.doc(person.path) : null, tip: `${person ? person.title : p.name} · ${t("stats.meetingsN", { n: p.n })}` };
    }))));
  }

  root.append(h("p", { class: "stats-foot" }, t("stats.foot", { m: DEFAULT_MEETING_MIN, t: TASK_MIN })));
  tip.attach(root);
}

/* ------------------------------------------------------------ pieces */

function tile(label, value, sub, extra, onClick) {
  return h(onClick ? "button" : "div", { class: "stat-tile", type: onClick ? "button" : null, onclick: onClick || null },
    h("div", { class: "stat-label" }, label),
    h("div", { class: "stat-value" }, value),
    sub ? h("div", { class: "stat-sub" }, sub) : null,
    extra || null);
}

/** This week against the average: "▲ 30%". */
function compare(now, base, label) {
  if (!base) return h("div", { class: "stat-cmp" }, label);
  const r = now / base - 1;
  const cls = Math.abs(r) < 0.15 ? "same" : r > 0 ? "up" : "down";
  return h("div", { class: "stat-cmp " + cls }, label, cls === "same" ? null : h("span", {}, (r > 0 ? " ▲ " : " ▼ ") + Math.round(Math.abs(r) * 100) + "%"));
}

function insight(x) {
  const ic = { good: "check", warn: "alert", info: "trend" }[x.level];
  const vars = { ...(x.vars || {}) };
  if ("day" in vars) vars.day = weekdayName(vars.day);
  if ("light" in vars) vars.light = weekdayName(vars.light);
  if ("h" in vars) vars.h = num(vars.h);
  if ("from" in vars) { vars.from = fmtDate(vars.from, "short"); vars.to = fmtDate(vars.to, "short"); }
  return h("li", { class: "insight insight-" + x.level }, h("span", { class: "insight-icon", title: t("stats.level." + x.level) }, icon(ic, 14)), h("span", {}, t("stats.in." + x.key, vars)));
}
const weekdayName = (wd) => t("stats.wd" + wd);

function card(title, sub, body, opts = {}) {
  const tbl = opts.table ? h("details", { class: "chart-table" }, h("summary", {}, t("stats.showData")), opts.table) : null;
  return h("section", { class: "chart-card" + (opts.wide ? " wide" : "") },
    h("div", { class: "chart-head" },
      h("div", {}, h("h3", { class: "chart-title" }, title), sub ? h("div", { class: "chart-sub" }, sub) : null),
      opts.legend ? h("div", { class: "chart-legend" }, opts.legend.map(([cls, label]) => h("span", { class: "legend-item" }, h("span", { class: "swatch " + cls }), label))) : null),
    body, tbl);
}

const niceMax = (m) => {
  if (m <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(m));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((x) => x >= m);
};

/** Vertical columns (stacked segments), one per slot, with a hairline grid and an optional average line. */
function columns(data, opts = {}) {
  const max = niceMax(Math.max(...data.map((d) => d.segs.reduce((a, s) => a + s.v, 0)), opts.avg || 0));
  const ticks = [0, max / 2, max];
  const plot = h("div", { class: "cols-plot" },
    ticks.map((v) => h("div", { class: "cols-grid", style: `bottom:${(v / max) * 100}%` }, h("span", {}, opts.fmt ? opts.fmt(v) : num(v)))),
    opts.avg ? h("div", { class: "cols-avg", style: `bottom:${(opts.avg / max) * 100}%` }, h("span", {}, opts.avgLabel + " " + (opts.fmt ? opts.fmt(opts.avg) : num(opts.avg)))) : null,
    h("div", { class: "cols-slots" + (opts.thin ? " thin" : "") }, data.map((d) =>
      h("div", { class: "col-slot" + (d.muted ? " muted" : ""), "data-tip": d.tip, tabindex: "0" },
        h("div", { class: "col-stack" }, d.segs.filter((s) => s.v > 0).map((s) => h("div", { class: "col-seg " + s.cls, style: `height:${(s.v / max) * 100}%` })))))));
  const step = Math.ceil(data.length / 14); // don't crowd the axis
  const axis = h("div", { class: "cols-axis" + (opts.thin ? " thin" : "") }, data.map((d, i) => h("span", {}, i % step === 0 || i === data.length - 1 ? d.label : "")));
  return h("div", { class: "cols" }, plot, axis);
}

/** Horizontal bars with the value at the tip. */
function bars(data) {
  const max = Math.max(...data.map((d) => d.v), 0) || 1;
  return h("div", { class: "hbars" }, data.map((d) => h("div", { class: "hbar", "data-tip": d.tip, tabindex: "0" },
    d.href ? h("a", { class: "hbar-label", href: d.href }, d.label) : h("span", { class: "hbar-label" }, d.label),
    h("span", { class: "hbar-track" }, h("span", { class: "hbar-fill" + (d.color ? " is-project" : ""), "data-color": d.color || null, style: `width:${Math.max(2, (d.v / max) * 100)}%` })),
    h("span", { class: "hbar-value" }, d.value))));
}

/** One cell per day (weeks across, weekdays down), darker = more load. */
function heatmap(s, names) {
  const loads = s.days.filter((d) => !d.future && d.load > 0).map((d) => d.load).sort((a, b) => a - b);
  const q = (p) => loads[Math.min(loads.length - 1, Math.floor(p * loads.length))] || 0;
  const cuts = [q(0.25), q(0.5), q(0.75), q(0.9)];
  const level = (l) => (l <= 0 ? 0 : 1 + cuts.filter((c) => l > c).length);
  const rows = s.profile.some((p) => p.weekday >= 5 && p.load > 0) ? 7 : 5;
  const cols = s.weekList.map((w, i) => h("div", { class: "heat-col" }, s.days.slice(i * 7, i * 7 + rows).map((d) =>
    h("a", {
      class: "heat-cell l" + level(d.load) + (d.future ? " future" : "") + (d.isToday ? " today" : ""), href: route.week(d.date), tabindex: "0",
      "data-tip": `${cap(fmtDate(d.date, "full"))} · ${t("stats.meetingsN", { n: d.meetings })} · ${t("stats.tasksN", { n: d.tasks })} · ${hrs(d.load)}${d.future ? " · " + t("stats.planned") : ""}`,
    }))));
  const scale = h("div", { class: "heat-scale" }, t("stats.less"), [0, 1, 2, 3, 4, 5].map((l) => h("span", { class: "heat-cell l" + l })), t("stats.more"));
  return h("div", { class: "heat" },
    h("div", { class: "heat-days" }, names.slice(0, rows).map((n) => h("span", {}, n))),
    h("div", { class: "heat-cols" }, cols),
    scale);
}

function weekTable(wl, label) {
  return h("table", { class: "data-table" },
    h("thead", {}, h("tr", {}, [t("stats.week"), t("stats.lMeetings"), t("stats.lMeetingH"), t("stats.lTasks"), t("stats.lDone")].map((x) => h("th", {}, x)))),
    h("tbody", {}, wl.map((w) => h("tr", {}, h("td", {}, label(w)), h("td", {}, String(w.meetings)), h("td", {}, num(w.meetingH)), h("td", {}, String(w.tasks)), h("td", {}, String(w.done))))));
}

/** One tooltip for every [data-tip] of the page (mouse and keyboard). */
function tooltip() {
  const el = h("div", { class: "chart-tip", role: "tooltip" });
  const show = (target) => {
    el.textContent = target.dataset.tip;
    el.classList.add("show");
    const b = target.getBoundingClientRect();
    const w = el.offsetWidth, hgt = el.offsetHeight;
    const x = Math.min(window.innerWidth - w - 8, Math.max(8, b.left + b.width / 2 - w / 2));
    const y = b.top - hgt - 8 < 8 ? b.bottom + 8 : b.top - hgt - 8;
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    target.classList.add("tip-on");
  };
  const hide = (target) => { el.classList.remove("show"); target?.classList.remove("tip-on"); };
  return {
    attach(root) {
      document.body.querySelectorAll(":scope > .chart-tip").forEach((x) => x.remove());
      document.body.append(el);
      let cur = null;
      const over = (e) => {
        const tg = e.target.closest?.("[data-tip]");
        if (tg === cur) return;
        hide(cur); cur = tg;
        if (tg && root.contains(tg)) show(tg);
      };
      root.addEventListener("mouseover", over);
      root.addEventListener("mouseleave", () => { hide(cur); cur = null; });
      root.addEventListener("focusin", over);
      root.addEventListener("focusout", () => { hide(cur); cur = null; });
      // the tooltip leaves with the page
      window.addEventListener("hashchange", () => el.remove(), { once: true });
    },
  };
}
