// Extra parts of the document page for people, series, meetings and knowledge: their
// properties at a glance and everything related to them (computed, never written to the file).

import { h, today, fold, stripExt } from "../util.js";
import { icon } from "../icons.js";
import { t, relDay, cap } from "../i18n.js";
import {
  vault, attendeesOf, waitingTasks, meetingsWith, seriesOf, sessionsOf, resolveLink, needsProcessing,
  KNOWLEDGE_KINDS, findPerson,
} from "../model.js";
import { occursOn, nextOccurrence } from "../series.js";
import { route, go } from "../nav.js";
import { taskList } from "../tasks.js";
import { section, meetingRow, btn, projectChip, describeRule } from "./common.js";
import { newMeetingDialog, seriesDialog, KIND_ICON } from "./dialogs.js";
import { personChip, avatar } from "../picker.js";
import { knowledgeCard } from "./knowledge.js";
import { errorToast } from "../ui.js";
import * as A from "../actions.js";

const list = (v) => (Array.isArray(v) ? v : typeof v === "string" && v.trim() ? v.split(",").map((x) => x.trim()) : []);

/** Open (creating it if needed) the session of a series on a date, in meeting mode. */
export async function openSession(sd, date) {
  try {
    const existing = sessionsOf(sd).find((m) => m.date === date);
    go(route.meet(existing ? existing.path : await A.createSession(sd, date)));
  } catch (e) { errorToast(e); }
}

/** Chips shown under the title (replace the generic ones for these kinds). */
export function entityChips(doc) {
  const chips = [];
  if (doc.kind === "meeting") {
    const sd = seriesOf(doc);
    if (sd) chips.push(h("a", { class: "chip chip-series", href: route.doc(sd.path) }, icon("clock", 12), sd.title));
    for (const a of attendeesOf(doc)) chips.push(personChip(a.name, { person: a.person }));
    if (doc.fm.processed) chips.push(h("span", { class: "chip chip-ok", title: t("mtg.processedOn", { date: String(doc.fm.processed) }) }, icon("check", 12), t("mtg.processed")));
    else if (needsProcessing(doc, today())) chips.push(h("span", { class: "chip chip-warn", title: t("mtg.unprocessedHint") }, icon("sparkles", 12), t("mtg.unprocessed")));
  }
  if (doc.kind === "series") {
    chips.push(h("span", { class: "chip" }, icon("clock", 12), describeRule(doc.rule) + (doc.fm.time ? " · " + doc.fm.time : "")));
    if (doc.fm.status === "paused") chips.push(h("span", { class: "chip chip-warn" }, t("series.pausedChip")));
    for (const a of attendeesOf(doc)) chips.push(personChip(a.name, { person: a.person }));
  }
  if (doc.kind === "knowledge") {
    const kind = KNOWLEDGE_KINDS.includes(doc.fm.kind) ? doc.fm.kind : "fact";
    chips.push(h("span", { class: "chip know-kind", "data-kind": kind }, icon(KIND_ICON[kind], 12), t("know.kind." + kind)));
    for (const n of list(doc.fm.people)) chips.push(personChip(n));
    const src = typeof doc.fm.source === "string" ? doc.fm.source.trim() : "";
    if (src) {
      const target = resolveLink(src.replace(/^\[\[|\]\]$/g, "").split("|")[0]);
      chips.push(target ? h("a", { class: "chip", href: route.doc(target) }, icon("link", 12), t("know.from", { name: vault().docs.get(target)?.title || src }))
        : /^https?:\/\//.test(src) ? h("a", { class: "chip", href: src, target: "_blank", rel: "noopener" }, icon("external", 12), t("know.sourceLink"))
          : h("span", { class: "chip" }, icon("link", 12), src));
    }
  }
  return chips;
}

/** Primary buttons for the page header. */
export function entityActions(doc) {
  if (doc.kind === "meeting") return [btn(t("mtg.mode"), "users", () => go(route.meet(doc.path)), "btn-primary")];
  if (doc.kind === "person") return [btn(t("meeting.new"), "users", () => newMeetingDialog({ attendees: [doc.title] }))];
  if (doc.kind === "series") {
    const tdy = today();
    const next = occursOn(doc.rule, tdy) ? tdy : nextOccurrence(doc.rule, tdy);
    return [
      btn(t("series.edit"), "settings", () => seriesDialog(doc)),
      next ? btn(next === tdy ? t("series.openToday") : t("series.openNext", { date: relDay(next) }), "users", () => openSession(doc, next), "btn-primary") : null,
    ].filter(Boolean);
  }
  return [];
}

/** A person's profile card (under the title). */
export function personHeader(p) {
  const ask = list(p.fm.ask_for);
  const line = [p.fm.role, p.fm.team, p.fm.org].filter((x) => typeof x === "string" && x.trim());
  return h("div", { class: "profile" },
    avatar(p.title, "avatar-lg"),
    h("div", { class: "profile-main" },
      line.length ? h("div", { class: "profile-line" }, line.join(" · ")) : h("div", { class: "muted small" }, t("person.noRole")),
      h("div", { class: "profile-contact" },
        typeof p.fm.email === "string" && p.fm.email ? h("a", { href: "mailto:" + p.fm.email }, icon("link", 12), " ", p.fm.email) : null,
        typeof p.fm.phone === "string" && p.fm.phone ? h("span", {}, p.fm.phone) : null),
      ask.length ? h("div", { class: "person-ask" }, h("span", { class: "muted small" }, t("person.askShort")), ask.map((x) => h("span", { class: "chip" }, x))) : null));
}

/** Related things, as sections after the document body. */
export function entitySections(doc) {
  const out = [];
  const v = vault();
  if (doc.kind === "person") {
    const owes = waitingTasks(doc);
    if (owes.length) out.push(section(t("person.owesTitle"), taskList(owes, { showSource: true, showDate: true, compact: true }), { icon: "clock", count: owes.length }));
    const ms = meetingsWith(doc);
    const up = ms.filter((m) => m.date && m.date > today()).reverse();
    const past = ms.filter((m) => !m.date || m.date <= today());
    if (up.length) out.push(section(t("meetings.upcoming"), h("div", { class: "rows" }, up.slice(0, 5).map((m) => meetingRow(m))), { icon: "calendar", count: up.length }));
    if (past.length) out.push(section(t("person.meetings"), h("div", { class: "rows" }, past.slice(0, 10).map((m) => meetingRow(m))), { icon: "users", count: past.length }));
    const series = v.series.filter((sd) => attendeesOf(sd).some((a) => a.person === doc));
    if (series.length) out.push(section(t("nav.series"), h("div", { class: "rows" }, series.map(seriesRow)), { icon: "clock", count: series.length }));
    const slug = fold(stripExt(doc.name));
    const know = v.knowledge.filter((k) => list(k.fm.people).some((n) => findPerson(n) === doc) || fold(k.body).includes("[[" + slug));
    if (know.length) out.push(section(t("nav.knowledge"), h("div", { class: "cards know-cards" }, know.map(knowledgeCard)), { icon: "sparkles", count: know.length }));
  }
  if (doc.kind === "series") {
    const sessions = sessionsOf(doc);
    const open = v.docTasks.filter((x) => !x.done && sessions.some((m) => m.path === x.path));
    if (open.length) out.push(section(t("series.openTasks"), taskList(open, { showSource: true, compact: true }), { icon: "list-checks", count: open.length }));
    out.push(section(t("series.sessions"), sessions.length ? h("div", { class: "rows" }, sessions.slice(0, 30).map((m) => meetingRow(m, { hideProject: true })))
      : h("p", { class: "muted small pad" }, t("series.noSessions")), { icon: "users", count: sessions.length }));
  }
  if (doc.kind === "meeting") {
    const sd = seriesOf(doc);
    if (sd) {
      const sessions = sessionsOf(sd);
      const i = sessions.findIndex((m) => m.path === doc.path);
      const prev = sessions[i + 1];
      if (prev) out.push(section(t("mtg.previous"), h("div", { class: "rows" }, meetingRow(prev, { hideProject: true })), { icon: "clock" }));
    }
  }
  return out;
}

export function seriesRow(sd) {
  const tdy = today();
  const next = nextOccurrence(sd.rule, tdy);
  return h("a", { class: "row series-row", href: route.doc(sd.path) },
    h("span", { class: "row-icon" }, icon("clock", 16)),
    h("div", { class: "row-main" },
      h("div", { class: "row-title" }, sd.title),
      h("div", { class: "row-meta" },
        h("span", {}, describeRule(sd.rule) + (sd.fm.time ? " · " + sd.fm.time : "")),
        sd.project ? projectChip(sd.project) : null)),
    h("span", { class: "row-aside" }, sd.fm.status === "paused" ? t("series.pausedChip") : next ? cap(relDay(next)) : "—"),
    h("span", { class: "avatars" }, attendeesOf(sd).slice(0, 4).map((a) => avatar(a.person ? a.person.title : a.name, "avatar-sm"))));
}
