// People: who is who, what they can help with, what they owe you. Plus the names that appear
// in your meetings without a card yet (one click creates it).

import { h, fold, today } from "../util.js";
import { icon } from "../icons.js";
import { t, relTime, relDay } from "../i18n.js";
import { vault, findPerson, findTeam, attendeesOf, waitingTasks, meetingsWith, teamsOf } from "../model.js";
import { route } from "../nav.js";
import { pageHeader, btn, section } from "./common.js";
import { newPersonDialog } from "./dialogs.js";
import { avatar } from "../picker.js";
import { emptyState, errorToast, toast } from "../ui.js";
import * as A from "../actions.js";

let q = "";
let org = ""; // organisation filter

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

export function render(root) {
  const v = vault();
  root.append(pageHeader({
    title: t("nav.people"),
    subtitle: t("people.subtitle", { n: v.people.length }),
    actions: [btn(t("person.new"), "plus", () => newPersonDialog(), "btn-primary")],
  }));
  const search = h("input", { class: "input", type: "search", placeholder: t("people.searchPh"), value: q, "data-focus-key": "people-q" });
  const body = h("div", {});
  search.addEventListener("input", () => { q = search.value; paint(); });
  // filter by organisation (only when people have one)
  const orgs = [...new Set(v.people.map((p) => String(p.fm.org || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (org && !orgs.includes(org)) org = "";
  const orgSel = orgs.length ? h("select", { class: "input input-auto", "aria-label": t("person.org"), onchange: (e) => { org = e.target.value; paint(); } },
    h("option", { value: "" }, t("people.allOrgs")), orgs.map((o) => h("option", { value: o, selected: org === o }, o))) : null;
  root.append(h("div", { class: "toolbar" }, search, orgSel), body);

  function paint() {
    const k = fold(q.trim());
    const people = v.people.filter((p) => !org || String(p.fm.org || "").trim() === org).filter((p) => !k || fold([p.title, p.fm.role, teamsOf(p).join(" "), p.fm.org, p.fm.email, ...list(p.fm.aliases), ...list(p.fm.ask_for), p.body].join(" ")).includes(k));
    body.replaceChildren();
    if (!v.people.length) body.append(emptyState("users", t("people.emptyTitle"), t("people.emptyText"), btn(t("person.new"), "plus", () => newPersonDialog(), "btn-primary")));
    else if (!people.length) body.append(emptyState("search", t("people.noMatch")));
    // grouped by team (or organisation)
    const groups = new Map();
    for (const p of people) { // someone in two teams shows in both
      const gs = teamsOf(p).length ? teamsOf(p) : [String(p.fm.org || "").trim() || t("people.noTeam")];
      for (const g of gs) {
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(p);
      }
    }
    const keys = [...groups.keys()].sort((a, b) => (a === t("people.noTeam")) - (b === t("people.noTeam")) || a.localeCompare(b));
    for (const g of keys) body.append(section(g, h("div", { class: "cards people-cards" }, groups.get(g).map(personCard)), { count: groups.get(g).length }));

    const unknown = !k && !org ? unknownPeople() : [];
    if (unknown.length) {
      body.append(section(t("people.unknown"), h("div", {},
        h("p", { class: "muted small" }, t("people.unknownHint")),
        h("div", { class: "unknown-people" }, unknown.slice(0, 40).map((u) => h("div", { class: "unknown-person" },
          avatar(u.name, "avatar-sm"), h("span", { class: "unknown-name" }, u.name),
          h("span", { class: "muted small" }, t("people.seen", { n: u.count })),
          h("button", { class: "btn btn-sm", type: "button", onclick: async () => {
            try { await A.createPerson({ name: u.name }); toast(t("person.created", { name: u.name })); } catch (e) { errorToast(e); }
          } }, icon("plus", 13), t("people.createCard")))))), { icon: "users", count: unknown.length }));
    }
  }
  paint();
}
