// People: who is who, what they can help with, what they owe you. Plus the names that appear
// in your meetings without a card yet (one click creates it).

import { h, fold, today, storage } from "../util.js";
import { icon } from "../icons.js";
import { t, relTime, relDay } from "../i18n.js";
import { vault, findPerson, findTeam, attendeesOf, waitingTasks, meetingsWith, teamsOf } from "../model.js";
import { route } from "../nav.js";
import { pageHeader, btn } from "./common.js";
import { newPersonDialog } from "./dialogs.js";
import { avatar } from "../picker.js";
import { emptyState, errorToast, toast } from "../ui.js";
import * as A from "../actions.js";

let q = "";
// how the page is organised (remembered): group by team or organisation, the selected group, cards or a list
const view = { by: storage("people.by") || "team", group: "", dense: storage("people.dense") === "1" };
const ALL = "\u0000all", UNKNOWN = "\u0000unknown";

export const title = () => t("nav.people");

const list = (v) => (Array.isArray(v) ? v : typeof v === "string" && v.trim() ? v.split(",").map((x) => x.trim()) : []);

/** Names in meeting attendee lists and @tasks that have no person card yet: [{ name, count, last }] */
export function unknownPeople() {
  const v = vault();
  const seen = new Map();
  const add = (name, date) => {
    const k = fold(name);
    if (!k || findPerson(name) || findTeam(name)) return;
    const cur = seen.get(k) || { name, count: 0, last: "" };
    cur.count++;
    if (date && date > cur.last) cur.last = date;
    seen.set(k, cur);
  };
  for (const m of v.meetings) for (const a of attendeesOf(m)) add(a.name, m.date);
  for (const tk of waitingTasks()) if (!tk.assignee) add(tk.who, tk.date);
  return [...seen.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function personCard(p) {
  const owes = waitingTasks(p).length;
  const met = meetingsWith(p).filter((m) => m.date && m.date <= today());
  const ask = list(p.fm.ask_for);
  return h("a", { class: "card person-card", href: route.doc(p.path) },
    h("div", { class: "person-card-head" }, avatar(p.title),
      h("div", { class: "person-card-name" },
        h("div", { class: "card-title" }, p.title),
        h("div", { class: "muted small" }, [p.fm.role, teamsOf(p).join(", ") || p.fm.org].filter(Boolean).join(" · ") || " "))),
    ask.length ? h("div", { class: "person-ask" }, h("span", { class: "muted small" }, t("person.askShort")), ask.slice(0, 4).map((x) => h("span", { class: "chip" }, x))) : null,
    h("div", { class: "card-foot" },
      met.length ? h("span", {}, icon("users", 12), " ", t("person.lastMet", { when: relDay(met[0].date).toLowerCase() })) : h("span", {}, relTime(p.mtime)),
      owes ? h("span", { class: "badge badge-warn", title: t("person.owesYou", { n: owes }) }, icon("clock", 12), String(owes)) : null));
}

/** A compact row for the list view. */
function personRow(p) {
  const owes = waitingTasks(p).length;
  const org = String(p.fm.org || "").trim();
  return h("a", { class: "person-row", href: route.doc(p.path) }, avatar(p.title, "avatar-sm"),
    h("span", { class: "person-row-name" }, p.title),
    h("span", { class: "person-row-role muted" }, p.fm.role || ""),
    h("span", { class: "person-row-groups" }, teamsOf(p).map((x) => h("span", { class: "chip" }, x)), org ? h("span", { class: "chip chip-org" }, org) : null),
    owes ? h("span", { class: "badge badge-warn", title: t("person.owesYou", { n: owes }) }, icon("clock", 12), String(owes)) : h("span", {}));
}

/** Groups of people by team or organisation; someone in two teams is in both. */
function groupsOf(people, by) {
  const none = by === "org" ? t("people.noOrg") : t("people.noTeam");
  const groups = new Map();
  for (const p of people) {
    const gs = by === "org" ? [String(p.fm.org || "").trim() || none] : teamsOf(p).length ? teamsOf(p) : [none];
    for (const g of gs) { if (!groups.has(g)) groups.set(g, []); groups.get(g).push(p); }
  }
  return [...groups.entries()].sort(([a], [b]) => (a === none) - (b === none) || a.localeCompare(b));
}

export function render(root) {
  const v = vault();
  root.append(pageHeader({
    title: t("nav.people"),
    subtitle: t("people.subtitle", { n: v.people.length }),
    actions: [btn(t("person.new"), "plus", () => newPersonDialog(), "btn-primary")],
  }));
  if (!v.people.length && !unknownPeople().length) {
    root.append(emptyState("users", t("people.emptyTitle"), t("people.emptyText"), btn(t("person.new"), "plus", () => newPersonDialog(), "btn-primary")));
    return;
  }
  const search = h("input", { class: "input", type: "search", placeholder: t("people.searchPh"), value: q, "data-focus-key": "people-q" });
  const byTeam = h("button", { type: "button", onclick: () => setBy("team") }, t("people.byTeam"));
  const byOrg = h("button", { type: "button", onclick: () => setBy("org") }, t("people.byOrg"));
  const cards = h("button", { type: "button", title: t("people.cards"), "aria-label": t("people.cards"), onclick: () => setDense(false) }, icon("grid", 15));
  const rows = h("button", { type: "button", title: t("people.list"), "aria-label": t("people.list"), onclick: () => setDense(true) }, icon("list", 15));
  const nav = h("nav", { class: "people-groups", "aria-label": t("people.groups") });
  const body = h("div", { class: "people-body" });
  search.addEventListener("input", () => { q = search.value; paint(); });
  root.append(h("div", { class: "toolbar" }, search, h("div", { class: "segmented" }, byTeam, byOrg), h("div", { class: "segmented" }, cards, rows)),
    h("div", { class: "people-layout" }, nav, body));

  function setBy(by) { view.by = by; view.group = ""; storage("people.by", by); paint(); }
  function setDense(d) { view.dense = d; storage("people.dense", d ? "1" : "0"); paint(); }

  function paint() {
    byTeam.classList.toggle("active", view.by === "team"); byOrg.classList.toggle("active", view.by === "org");
    cards.classList.toggle("active", !view.dense); rows.classList.toggle("active", view.dense);
    const k = fold(q.trim());
    const people = v.people.filter((p) => !k || fold([p.title, p.fm.role, teamsOf(p).join(" "), p.fm.org, p.fm.email, ...list(p.fm.aliases), ...list(p.fm.ask_for), p.body].join(" ")).includes(k));
    const groups = groupsOf(people, view.by);
    const unknown = unknownPeople();
    if (view.group && view.group !== ALL && view.group !== UNKNOWN && !groups.some(([g]) => g === view.group)) view.group = "";
    if (view.group === UNKNOWN && !unknown.length) view.group = "";
    const sel = view.group || ALL;

    const item = (key, label, n, cls = "") => h("button", { class: "people-group" + (sel === key ? " active" : "") + cls, type: "button", onclick: () => { view.group = key; paint(); } },
      h("span", { class: "people-group-name" }, label), h("span", { class: "people-group-count" }, String(n)));
    nav.replaceChildren(item(ALL, t("people.all"), people.length), ...groups.map(([g, ps]) => item(g, g, ps.length)),
      unknown.length ? item(UNKNOWN, t("people.unknownShort"), unknown.length, " is-unknown") : "");

    body.replaceChildren();
    if (sel === UNKNOWN) { body.append(unknownList(unknown)); return; }
    if (!people.length) { body.append(emptyState("search", t("people.noMatch"))); return; }
    const show = (ps) => (view.dense ? h("div", { class: "person-rows" }, ps.map(personRow)) : h("div", { class: "cards people-cards" }, ps.map(personCard)));
    if (sel !== ALL) {
      const ps = groups.find(([g]) => g === sel)[1];
      body.append(h("h2", { class: "people-group-title" }, sel, h("span", { class: "muted" }, " · " + ps.length)), show(ps));
      return;
    }
    // everyone: each group folded except the first few, so the page doesn't go on forever
    groups.forEach(([g, ps], i) => body.append(h("details", { class: "people-section", open: !!k || groups.length <= 3 || i < 2 },
      h("summary", {}, icon("chevron-right", 14, "people-caret"), h("span", { class: "people-section-name" }, g), h("span", { class: "count" }, String(ps.length)),
        h("span", { class: "people-section-faces" }, ps.slice(0, 6).map((p) => avatar(p.title, "avatar-sm")))),
      show(ps))));
  }

  function unknownList(unknown) {
    return h("div", {},
      h("h2", { class: "people-group-title" }, t("people.unknown")),
      h("p", { class: "muted small" }, t("people.unknownHint")),
      h("div", { class: "unknown-people" }, unknown.slice(0, 80).map((u) => h("div", { class: "unknown-person" },
        avatar(u.name, "avatar-sm"), h("span", { class: "unknown-name" }, u.name),
        h("span", { class: "muted small" }, t("people.seen", { n: u.count })),
        h("button", { class: "btn btn-sm", type: "button", onclick: async () => {
          try { await A.createPerson({ name: u.name }); toast(t("person.created", { name: u.name })); } catch (e) { errorToast(e); }
        } }, icon("plus", 13), t("people.createCard"))))));
  }
  paint();
}
