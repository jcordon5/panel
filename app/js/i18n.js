// Translations (es / en) and locale-aware date formatting.

import { parseISO, today, addDays, diffDays, storage, iso } from "./util.js";
import { STRINGS } from "./strings.js";

export const LANGS = { es: "Español", en: "English" };

let current = storage("lang") || ((navigator.language || "es").toLowerCase().startsWith("es") ? "es" : "en");
if (!LANGS[current]) current = "en";

export function lang() { return current; }
export function setLang(l) {
  if (!LANGS[l]) return;
  current = l;
  storage("lang", l);
  if (typeof document !== "undefined") document.documentElement.lang = l;
}

/** t("key", {n: 3, name: "x"}) — {placeholders}; *_one / *_other plural forms */
export function t(key, vars) {
  const dict = STRINGS[current] || STRINGS.en;
  let s;
  if (vars && typeof vars.n === "number") s = dict[key + (vars.n === 1 ? "_one" : "_other")];
  if (s === undefined) s = dict[key];
  if (s === undefined) s = STRINGS.en[key];
  if (s === undefined) return key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : "{" + k + "}")) : s;
}

const locale = () => (current === "es" ? "es-ES" : "en-GB");

const FORMATS = {
  long: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  full: { weekday: "long", day: "numeric", month: "long" },
  medium: { day: "numeric", month: "short", year: "numeric" },
  short: { day: "numeric", month: "short" },
  dayMonth: { day: "numeric", month: "long" },
  month: { month: "long", year: "numeric" },
  monthName: { month: "long" },
  weekday: { weekday: "long" },
  weekdayShort: { weekday: "short" },
};

export function fmtDate(iso, style = "medium") {
  const d = parseISO(iso);
  if (!d) return iso || "";
  return new Intl.DateTimeFormat(locale(), FORMATS[style] || FORMATS.medium).format(d).replace(/\.$/, "");
}

export function weekdayName(iso, short = false) {
  return fmtDate(iso, short ? "weekdayShort" : "weekday");
}

export function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

/** "Today", "Tomorrow", "Yesterday", "Friday", "3 Oct" */
export function relDay(iso) {
  const n = diffDays(iso, today());
  if (n === 0) return t("date.today");
  if (n === 1) return t("date.tomorrow");
  if (n === -1) return t("date.yesterday");
  if (n > 1 && n < 7) return cap(weekdayName(iso));
  const d = parseISO(iso);
  return fmtDate(iso, d.getFullYear() === new Date().getFullYear() ? "short" : "medium");
}

export function relTime(ms) {
  if (!ms) return "";
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" });
  const s = (ms - Date.now()) / 1000;
  const abs = Math.abs(s);
  if (abs < 60) return t("time.now");
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(s / 86400), "day");
  return fmtDate(iso(new Date(ms)), "medium");
}

export function weekdayShortNames() {
  const monday = "2024-01-01"; // a Monday
  return [0, 1, 2, 3, 4, 5, 6].map((i) => cap(weekdayName(addDays(monday, i), true)));
}
