// Building blocks shared by several views.

import { h, today, fold } from "../util.js";
import { icon } from "../icons.js";
import { t, fmtDate, relDay, relTime, cap, weekdayName } from "../i18n.js";
import { projectBySlug, vault, needsProcessing } from "../model.js";
import { route } from "../nav.js";
import { excerpt, renderMarkdown } from "../markdown.js";

export function pageHeader({ title, subtitle, eyebrow, actions = [], left = null }) {
  return h("header", { class: "page-head" },
    h("div", { class: "page-head-text" },
      eyebrow ? h("div", { class: "eyebrow" }, eyebrow) : null,
      h("div", { class: "page-title-row" }, left, h("h1", { class: "page-title" }, title)),
      subtitle ? h("div", { class: "page-subtitle" }, subtitle) : null),
    actions.length ? h("div", { class: "page-actions" }, actions) : null);
}

export function btn(label, ic, onClick, cls = "") {
  return h("button", { class: "btn " + cls, type: "button", onclick: onClick }, ic ? icon(ic, 15) : null, label ? h("span", {}, label) : null);
}
export function iconBtn(ic, label, onClick, cls = "") {
  return h("button", { class: "icon-btn " + cls, type: "button", "aria-label": label, title: label, onclick: onClick }, icon(ic, 17));
}

export function section(title, content, opts = {}) {
  return h("section", { class: "section " + (opts.cls || "") },
    h("div", { class: "section-head" },
      h("h2", { class: "section-title" }, opts.icon ? icon(opts.icon, 15) : null, title, opts.count !== undefined ? h("span", { class: "section-count" }, String(opts.count)) : null),
      opts.actions ? h("div", { class: "section-actions" }, opts.actions) : null),
    content);
}

export function projectChip(slug, opts = {}) {
  const p = projectBySlug(slug);
  if (!p) return null;
  return h("a", { class: "chip chip-project", href: route.project(slug), "data-color": p.color, onclick: (e) => e.stopPropagation() },
    h("span", { class: "dot", "data-color": p.color }), h("span", { class: "chip-text" }, p.title));
}

function openActions(path) {
  return vault().docTasks.filter((x) => x.path === path && !x.done).length;
}

/** A meeting as a list row (date block + title + meta). */
export function meetingRow(m, opts = {}) {
  const n = openActions(m.path);
  const future = m.date && m.date > today();
  return h("a", { class: "row meeting-row" + (future ? " future" : ""), href: route.doc(m.path) },
    h("div", { class: "date-block" + (m.date === today() ? " is-today" : "") },
      h("span", { class: "date-block-day" }, m.date ? String(+m.date.slice(8, 10)) : "–"),
      h("span", { class: "date-block-month" }, m.date ? fmtDate(m.date, "short").replace(/^\d+\s*(de\s)?/, "") : "")),
    h("div", { class: "row-main" },
      h("div", { class: "row-title" }, m.title),
      h("div", { class: "row-meta" },
        m.date ? h("span", {}, cap(relDay(m.date))) : null,
        m.time ? h("span", { class: "meta-time" }, icon("clock", 12), m.time) : null,
        m.attendees.length ? h("span", { class: "meta-people" }, icon("users", 12), m.attendees.slice(0, 3).join(", ") + (m.attendees.length > 3 ? " +" + (m.attendees.length - 3) : "")) : null,
        opts.hideProject ? null : projectChip(m.project, { short: true }))),
    needsProcessing(m, today()) ? h("span", { class: "badge badge-ai", title: t("mtg.unprocessedHint") }, icon("sparkles", 12)) : null,
    n ? h("span", { class: "badge", title: t("meeting.openActions", { n }) }, icon("list-checks", 12), String(n)) : null);
}

/** Card with rendered preview of a note. */
export function noteCard(d) {
  const { body } = bodyWithoutTitle(d);
  return h("a", { class: "card note-card" + (d.pinned ? " pinned" : ""), href: route.doc(d.path) },
    h("div", { class: "card-title" }, d.pinned ? icon("pin", 13, "pin-icon") : null, d.title),
    h("div", { class: "card-preview md md-mini", html: renderMarkdown(body.slice(0, 1200)) }),
    h("div", { class: "card-foot" },
      h("span", {}, relTime(d.mtime)),
      d.project ? projectChip(d.project, { short: true }) : null));
}

export function docRow(d) {
  return h("a", { class: "row doc-row", href: route.doc(d.path) },
    h("span", { class: "row-icon" }, icon(d.kind === "meeting" ? "users" : "file", 16)),
    h("div", { class: "row-main" },
      h("div", { class: "row-title" }, d.title),
      h("div", { class: "row-meta" }, h("span", {}, excerpt(d.body, 90) || d.path))),
    h("span", { class: "row-aside" }, relTime(d.mtime)));
}

export function progress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return h("div", { class: "progress", role: "progressbar", "aria-valuenow": String(pct), "aria-valuemin": "0", "aria-valuemax": "100" },
    h("div", { class: "progress-bar", style: { width: pct + "%" } }));
}

/** Body without a leading "# Title" that just repeats the title; offset = file line of the first kept line. */
export function bodyWithoutTitle(doc) {
  const lines = doc.body.split("\n");
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length && /^#\s+/.test(lines[i])) {
    const h1 = lines[i].replace(/^#\s+/, "").replace(/\s+#*\s*$/, "").trim();
    if (fold(h1) === fold(doc.title) || fold(h1).startsWith(fold(doc.title))) {
      return { body: lines.slice(i + 1).join("\n"), offset: doc.bodyLine + i + 1 };
    }
  }
  return { body: doc.body, offset: doc.bodyLine };
}

/* ------------------------------------------------------------ series */

/** "Weekdays", "Every 2 weeks: Tuesday and Thursday", "Every month, on the first Monday"… */
export function describeRule(rule) {
  if (!rule) return "";
  const names = (days) => {
    const ws = days.map((i) => weekdayName(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"][i]));
    return ws.length > 1 ? ws.slice(0, -1).join(", ") + " " + t("common.and") + " " + ws[ws.length - 1] : ws[0] || "";
  };
  const n = rule.interval;
  switch (rule.repeat) {
    case "weekdays": return t("series.desc.weekdays");
    case "daily": return n > 1 ? t("series.desc.everyNDays", { n }) : t("series.desc.daily");
    case "weekly": return (n > 1 ? t("series.desc.everyNWeeks", { n }) : t("series.desc.weekly")) + ": " + names(rule.days);
    case "monthly": {
      const every = n > 1 ? t("series.desc.everyNMonths", { n }) : t("series.desc.monthly");
      if (!rule.nth) return every + ", " + t("series.desc.onDay", { d: rule.start ? +rule.start.slice(8) : "?" });
      return every + ", " + t("series.desc.onNth", { n: t("series.nth." + (rule.nth === -1 ? "last" : rule.nth)), day: names(rule.days) });
    }
    default: return "";
  }
}
