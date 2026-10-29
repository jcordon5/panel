// Recurring meetings ("series"): when a series happens. Pure functions, no I/O.
//
// A series is series/<slug>.md with frontmatter:
//   repeat:   daily | weekdays | weekly | monthly
//   days:     [mon, thu]        weekly: which weekdays (default: the weekday of `start`)
//   interval: 2                 every N days / weeks / months (default 1)
//   nth:      1 | 2 | 3 | 4 | -1   monthly on the Nth (or last) weekday in `days` instead of the same date
//   start:    2026-11-02        first day (default: when it was created)
//   until:    2027-06-30        last day (optional)
//   skip:     [2026-12-24]      cancelled sessions (optional)
//   time, attendees, project, template: copied into every session

import { addDays, mondayOf, isISODate } from "./util.js";

const DAY_NAMES = [
  ["mon", "monday", "lun", "lunes", "l"], ["tue", "tuesday", "mar", "martes", "m"], ["wed", "wednesday", "mie", "miercoles", "x"],
  ["thu", "thursday", "jue", "jueves", "j"], ["fri", "friday", "vie", "viernes", "v"], ["sat", "saturday", "sab", "sabado", "s"],
  ["sun", "sunday", "dom", "domingo", "d"],
];
export const DAY_KEYS = DAY_NAMES.map((d) => d[0]);

const fold = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const list = (v) => (Array.isArray(v) ? v : typeof v === "string" && v.trim() ? v.split(",") : []).map((x) => String(x).trim()).filter(Boolean);
const dayIndex = (s) => DAY_NAMES.findIndex((names) => names.includes(fold(s)));
/** 0 = Monday … 6 = Sunday */
export const weekday = (date) => (new Date(date + "T12:00:00").getDay() + 6) % 7;
const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);

/** Normalised rule from a series' frontmatter (and its creation date as a fallback start). */
export function seriesRule(fm, fallbackStart) {
  const repeat = ["daily", "weekdays", "weekly", "monthly"].includes(fold(fm.repeat || "")) ? fold(fm.repeat) : "weekly";
  const start = isISODate(String(fm.start || "")) ? String(fm.start) : fallbackStart;
  let days = list(fm.days).map(dayIndex).filter((d) => d >= 0);
  if (!days.length) days = repeat === "weekdays" ? [0, 1, 2, 3, 4] : start ? [weekday(start)] : [0];
  if (repeat === "weekdays") days = [0, 1, 2, 3, 4];
  const interval = Math.max(1, parseInt(fm.interval, 10) || 1);
  const nth = parseInt(fm.nth, 10);
  return {
    repeat, days: [...new Set(days)].sort(), interval, start,
    nth: [1, 2, 3, 4, -1].includes(nth) ? nth : null,
    until: isISODate(String(fm.until || "")) ? String(fm.until) : null,
    skip: new Set(list(fm.skip).filter(isISODate)),
  };
}

/** Does the series have a session on `date`? */
export function occursOn(rule, date) {
  if (!rule.start || date < rule.start || (rule.until && date > rule.until) || rule.skip.has(date)) return false;
  const wd = weekday(date);
  switch (rule.repeat) {
    case "daily": return daysBetween(rule.start, date) % rule.interval === 0;
    case "weekdays": return wd < 5;
    case "weekly": {
      if (!rule.days.includes(wd)) return false;
      const weeks = Math.round(daysBetween(mondayOf(rule.start), mondayOf(date)) / 7);
      return weeks % rule.interval === 0;
    }
    case "monthly": {
      const [sy, sm] = rule.start.split("-").map(Number);
      const [y, m, d] = date.split("-").map(Number);
      const months = (y - sy) * 12 + (m - sm);
      if (months % rule.interval !== 0) return false;
      if (!rule.nth) return d === +rule.start.slice(8);
      if (wd !== rule.days[0]) return false;
      if (rule.nth === -1) return addDays(date, 7).slice(5, 7) !== date.slice(5, 7);
      return Math.ceil(d / 7) === rule.nth;
    }
    default: return false;
  }
}

/** Session dates between from and to (inclusive). */
export function occurrences(rule, from, to, max = 400) {
  const out = [];
  for (let d = from; d <= to && out.length < max; d = addDays(d, 1)) if (occursOn(rule, d)) out.push(d);
  return out;
}

/** Next session on or after `from` (searching a year ahead). */
export function nextOccurrence(rule, from) {
  for (let i = 0, d = from; i < 400; i++, d = addDays(d, 1)) if (occursOn(rule, d)) return d;
  return null;
}

/** Frontmatter for a rule edited in the series dialog. */
export function ruleToFm({ repeat, days, interval, nth, start, until }) {
  return {
    repeat,
    days: repeat === "weekly" || (repeat === "monthly" && nth) ? days.map((i) => DAY_KEYS[i]) : null,
    interval: interval > 1 ? interval : null,
    nth: repeat === "monthly" && nth ? nth : null,
    start, until: until || null,
  };
}
