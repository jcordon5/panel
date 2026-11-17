// Workload numbers from the vault: meetings and tasks per day and week, and what they say.
// Everything is computed from the files (days in weeks/, meetings' date/time); nothing is stored.

import { addDays, mondayOf } from "./util.js";
import { vault, isTask, overdueTasks, waitingTasks } from "./model.js";

/** Minutes a meeting is counted for when it doesn't say (`duration:` or `end:` in its properties). */
export const DEFAULT_MEETING_MIN = 45;
/** Minutes a task is counted for in the day's load. */
export const TASK_MIN = 30;
/** A working week, to put meeting hours in proportion. */
export const WEEK_HOURS = 40;

const toMin = (hhmm) => {
  const m = /^(\d{1,2})[:.h](\d{2})/.exec(String(hhmm || "").trim());
  return m ? +m[1] * 60 + +m[2] : null;
};

/** How long a meeting lasts, in minutes. */
export function meetingMinutes(m) {
  const fm = m.fm || {};
  const d = parseFloat(fm.duration);
  if (d > 0) return Math.min(d, 600);
  const s = toMin(m.time), e = toMin(fm.end);
  if (s !== null && e !== null && e > s) return e - s;
  return DEFAULT_MEETING_MIN;
}

const weekday = (date) => (new Date(date + "T12:00:00").getDay() + 6) % 7; // 0 = Monday
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** One day: its meetings, tasks and estimated load in hours. */
function dayStats(date, byDate, v) {
  const items = (v.days.get(date)?.items || []).filter(isTask);
  const done = items.filter((x) => (x.action || x).done).length;
  const meetings = byDate.get(date) || [];
  const mMin = meetings.reduce((a, m) => a + meetingMinutes(m), 0);
  // meetings back to back: the next one starts less than 10 minutes after the previous ends
  const timed = meetings.map((m) => [toMin(m.time), meetingMinutes(m)]).filter(([s]) => s !== null).sort((a, b) => a[0] - b[0]);
  let b2b = 0;
  for (let i = 1; i < timed.length; i++) if (timed[i][0] - (timed[i - 1][0] + timed[i - 1][1]) < 10) b2b++;
  return {
    date, weekday: weekday(date),
    meetings: meetings.length, meetingMin: mMin, b2b,
    tasks: items.length, done, open: items.length - done,
    load: (mMin + items.length * TASK_MIN) / 60,
    hours: timed.map(([s]) => Math.floor(s / 60)),
  };
}

/**
 * weeks: how many full weeks before the current one to look at.
 * Returns days (past weeks + this week), weeks, weekday profile, hours, projects, people and insights.
 */
export function computeStats(today, weeks = 12) {
  const v = vault();
  const thisMon = mondayOf(today);
  const start = addDays(thisMon, -7 * weeks);
  const end = addDays(thisMon, 6);
  const byDate = new Map();
  for (const m of v.meetings) {
    if (!m.date || m.date < start || m.date > end) continue;
    if (!byDate.has(m.date)) byDate.set(m.date, []);
    byDate.get(m.date).push(m);
  }
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push({ ...dayStats(d, byDate, v), future: d > today, isToday: d === today });
  const past = days.filter((d) => d.date < thisMon);
  const current = days.filter((d) => d.date >= thisMon);
  const active = (d) => d.weekday < 5 || d.meetings || d.tasks; // weekends only when something happened

  const weekList = [];
  for (let i = 0; i <= weeks; i++) {
    const ds = days.slice(i * 7, i * 7 + 7);
    weekList.push({
      start: ds[0].date, current: i === weeks,
      meetings: ds.reduce((a, d) => a + d.meetings, 0),
      meetingH: ds.reduce((a, d) => a + d.meetingMin, 0) / 60,
      tasks: ds.reduce((a, d) => a + d.tasks, 0),
      done: ds.reduce((a, d) => a + d.done, 0),
      load: ds.reduce((a, d) => a + d.load, 0),
    });
  }
  const pastWeeks = weekList.filter((w) => !w.current);
  const used = pastWeeks.filter((w) => w.meetings || w.tasks); // weeks before you started using Panel don't count
  const workdays = past.filter((d) => d.weekday < 5 && (d.meetings || d.tasks || used.some((w) => w.start === mondayOf(d.date))));

  // weekday profile (Mon..Sun), over the weeks in use
  const profile = [0, 1, 2, 3, 4, 5, 6].map((wd) => {
    const ds = past.filter((d) => d.weekday === wd && used.some((w) => w.start === mondayOf(d.date)));
    return { weekday: wd, meetingH: avg(ds.map((d) => d.meetingMin / 60)), tasks: avg(ds.map((d) => d.tasks)), load: avg(ds.map((d) => d.load)), n: ds.length };
  });

  // when meetings start
  const hours = new Array(24).fill(0);
  for (const d of past) for (const hr of d.hours) hours[hr]++;

  // projects: tasks and meetings of the period
  const proj = new Map();
  const bump = (slug, k) => { if (!slug) return; const p = proj.get(slug) || { slug, tasks: 0, meetings: 0 }; p[k]++; proj.set(slug, p); };
  for (const d of past) {
    for (const it of (v.days.get(d.date)?.items || []).filter(isTask)) bump(it.type === "task" ? it.project : it.action?.project, "tasks");
    for (const m of byDate.get(d.date) || []) bump(m.project, "meetings");
  }
  const projects = [...proj.values()].map((p) => ({ ...p, total: p.tasks + p.meetings })).sort((a, b) => b.total - a.total);

  // people you meet most
  const ppl = new Map();
  for (const d of past) for (const m of byDate.get(d.date) || []) for (const a of m.attendees) {
    const k = a.replace(/^\[\[|\]\]$/g, "").trim();
    if (k) ppl.set(k, (ppl.get(k) || 0) + 1);
  }
  const people = [...ppl.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);

  const pastTasks = past.reduce((a, d) => a + d.tasks, 0);
  const pastDone = past.reduce((a, d) => a + d.done, 0);
  const totals = {
    weeksUsed: used.length,
    meetingsPerWeek: avg(used.map((w) => w.meetings)),
    meetingHPerWeek: avg(used.map((w) => w.meetingH)),
    tasksPerDay: avg(workdays.map((d) => d.tasks)),
    loadPerWeek: avg(used.map((w) => w.load)),
    completion: pastTasks ? pastDone / pastTasks : null,
    overdue: overdueTasks(today).length,
    waiting: waitingTasks().filter((x) => !x.done).length,
    freeDays: workdays.filter((d) => !d.meetings).length,
    workdays: workdays.length,
    b2bDays: workdays.filter((d) => d.b2b >= 2).length,
    thisWeek: weekList[weeks],
  };

  return { start, end, today, weeks, days, weekList, profile, hours, projects, people, totals, insights: insights({ days, past, current, weekList, used, workdays, profile, totals, today }) };
}

/* ------------------------------------------------------------ what the numbers say */

/** [{ level: "good"|"warn"|"info", key, vars }] — strings in i18n as "stats.in.<key>". */
function insights({ past, current, used, workdays, profile, totals, today }) {
  const out = [];
  if (used.length < 2) { out.push({ level: "info", key: "fewData" }); return out; }
  const base = totals.loadPerWeek;
  // this week, counting what's already planned for the rest of it
  const now = current.reduce((a, d) => a + d.load, 0);
  if (base > 0) {
    const r = now / base;
    if (r >= 1.25) out.push({ level: "warn", key: "weekHeavy", vars: { pct: Math.round((r - 1) * 100) } });
    else if (r <= 0.6 && current.some((d) => d.date >= today)) out.push({ level: "info", key: "weekLight", vars: { pct: Math.round((1 - r) * 100) } });
    else out.push({ level: "good", key: "weekNormal" });
  }
  // the heaviest weekday
  const wd = profile.slice(0, 5).filter((p) => p.n).sort((a, b) => b.load - a.load);
  if (wd.length >= 3 && wd[0].load > 0 && wd[0].load >= wd[wd.length - 1].load * 1.3) out.push({ level: "info", key: "heavyDay", vars: { day: wd[0].weekday, light: wd[wd.length - 1].weekday, h: wd[0].meetingH } });
  // meetings eat the week
  const share = totals.meetingHPerWeek / WEEK_HOURS;
  if (share >= 0.5) out.push({ level: "warn", key: "meetingsHigh", vars: { pct: Math.round(share * 100) } });
  else if (share >= 0.3) out.push({ level: "info", key: "meetingsMid", vars: { pct: Math.round(share * 100) } });
  else if (totals.meetingsPerWeek > 0) out.push({ level: "good", key: "meetingsLow", vars: { pct: Math.round(share * 100) } });
  // planning vs closing
  if (totals.completion !== null) {
    if (totals.completion < 0.6) out.push({ level: "warn", key: "completionLow", vars: { pct: Math.round(totals.completion * 100) } });
    else if (totals.completion >= 0.85) out.push({ level: "good", key: "completionHigh", vars: { pct: Math.round(totals.completion * 100) } });
  }
  if (totals.overdue >= 5) out.push({ level: "warn", key: "overdue", vars: { n: totals.overdue } });
  // days without room to breathe / to focus
  if (totals.b2bDays >= Math.max(2, workdays.length * 0.15)) out.push({ level: "warn", key: "backToBack", vars: { n: totals.b2bDays } });
  const freePerWeek = totals.freeDays / Math.max(1, used.length);
  if (freePerWeek < 0.5 && totals.meetingsPerWeek >= 5) out.push({ level: "warn", key: "noFocusDays" });
  else if (freePerWeek >= 1) out.push({ level: "good", key: "focusDays", vars: { n: totals.freeDays } });
  // underused days
  const med = median(workdays.map((d) => d.load).filter((x) => x > 0));
  const light = workdays.filter((d) => d.load > 0 && d.load < 2).length;
  if (med > 0 && med < 3) out.push({ level: "info", key: "lowLoad", vars: { h: med } });
  else if (light >= workdays.length * 0.3 && workdays.length >= 10) out.push({ level: "info", key: "lightDays", vars: { n: light } });
  if (med >= 7) out.push({ level: "warn", key: "highLoad", vars: { h: med } });
  // the heaviest stretch: two weeks in a row
  let best = null;
  for (let i = 0; i + 1 < used.length; i++) {
    const a = used[i], b = used[i + 1];
    if (mondayOf(addDays(a.start, 7)) !== b.start) continue;
    const l = a.load + b.load;
    if (!best || l > best.l) best = { l, from: a.start, to: addDays(b.start, 4) };
  }
  if (best && base > 0 && best.l / 2 >= base * 1.3) out.push({ level: "info", key: "peak", vars: { from: best.from, to: best.to, pct: Math.round((best.l / 2 / base - 1) * 100) } });
  if (totals.waiting >= 6) out.push({ level: "info", key: "waiting", vars: { n: totals.waiting } });
  return out;
}

export { median, avg, weekday };
