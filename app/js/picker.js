// People picker: chips + an input with suggestions from your people, free names allowed,
// and "create person" in place. Also small person bits (avatar, chip) used across views.

import { h, fold } from "./util.js";
import { icon } from "./icons.js";
import { t } from "./i18n.js";
import { vault, findPerson } from "./model.js";
import { route } from "./nav.js";
import * as A from "./actions.js";
import { errorToast, toast } from "./ui.js";

const COLORS = ["indigo", "blue", "teal", "green", "amber", "orange", "rose", "violet"];
const initials = (name) => String(name || "?").replace(/[[\]@]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
const colorOf = (name) => COLORS[[...fold(name)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];

export function avatar(name, size = "") {
  return h("span", { class: "avatar " + size, "data-color": colorOf(name), "aria-hidden": "true" }, initials(name));
}

/** A person (or just a name) as a chip; links to the person's page when there is one. */
export function personChip(name, opts = {}) {
  const p = opts.person !== undefined ? opts.person : findPerson(name);
  const label = p ? p.title : String(name).replace(/^@|\[\[|\]\]/g, "");
  const inner = [avatar(label, "avatar-sm"), h("span", { class: "chip-text" }, label)];
  if (p) return h("a", { class: "chip chip-person", href: route.doc(p.path), title: [p.fm.role, p.fm.team].filter(Boolean).join(" · ") || p.title, onclick: (e) => e.stopPropagation() }, ...inner);
  return h("span", { class: "chip chip-person unknown", title: t("person.notYet") }, ...inner);
}

function matches(q) {
  const k = fold(q.trim());
  const v = vault();
  if (!k) return v.people.slice(0, 8);
  return v.people.map((p) => {
    const hay = [p.title, ...(Array.isArray(p.fm.aliases) ? p.fm.aliases : []), p.fm.team || "", p.fm.role || ""].map(fold);
    const score = hay[0].startsWith(k) ? 0 : hay.some((x) => x.split(/\s+/).some((w) => w.startsWith(k))) ? 1 : hay.some((x) => x.includes(k)) ? 2 : 9;
    return { p, score };
  }).filter((x) => x.score < 9).sort((a, b) => a.score - b.score || a.p.title.localeCompare(b.p.title)).slice(0, 8).map((x) => x.p);
}

/**
 * peoplePicker(["Ana García", "Luis"]) -> { el, get() }  (names as written in the note)
 * opts.onChange(names) is called after every change.
 */
export function peoplePicker(initial = [], opts = {}) {
  let names = [...initial];
  const chips = h("div", { class: "picker-chips" });
  const input = h("input", { class: "picker-input", type: "text", placeholder: opts.placeholder || t("people.pickPh"), autocomplete: "off", "aria-label": t("meeting.attendees") });
  const list = h("div", { class: "picker-list", role: "listbox", hidden: true });
  const el = h("div", { class: "picker", onclick: (e) => { if (e.target === el || e.target === chips) input.focus(); } }, chips, input, list);
  let options = [], active = 0;

  const changed = () => { paintChips(); opts.onChange?.(names); };
  const add = (name) => {
    name = String(name || "").trim();
    if (!name || names.some((n) => fold(n) === fold(name) || (findPerson(n) && findPerson(n) === findPerson(name)))) { input.value = ""; close(); return; }
    names.push(name);
    input.value = "";
    close();
    changed();
  };
  const createAndAdd = async (name) => {
    try {
      await A.createPerson({ name });
      toast(t("person.created", { name }));
      add(name);
    } catch (e) { errorToast(e); }
  };

  function paintChips() {
    chips.replaceChildren(...names.map((n, i) => {
      const p = findPerson(n);
      return h("span", { class: "chip chip-person picker-chip" + (p ? "" : " unknown"), title: p ? [p.fm.role, p.fm.team].filter(Boolean).join(" · ") : t("person.notYet") },
        avatar(p ? p.title : n, "avatar-sm"), h("span", { class: "chip-text" }, p ? p.title : n),
        p ? null : h("button", { class: "chip-x", type: "button", title: t("person.createThis", { name: n }), onclick: (e) => { e.stopPropagation(); names.splice(i, 1); createAndAdd(n); } }, icon("plus", 11)),
        h("button", { class: "chip-x", type: "button", "aria-label": t("common.remove"), onclick: (e) => { e.stopPropagation(); names.splice(i, 1); changed(); input.focus(); } }, icon("x", 11)));
    }));
  }

  function close() { list.hidden = true; options = []; }
  function open() {
    const q = input.value;
    const found = matches(q).filter((p) => !names.some((n) => findPerson(n) === p));
    options = found.map((p) => ({ kind: "person", p }));
    if (q.trim() && !found.some((p) => fold(p.title) === fold(q.trim()))) {
      options.push({ kind: "free", name: q.trim() }, { kind: "create", name: q.trim() });
    }
    if (!options.length) { close(); return; }
    active = Math.min(active, options.length - 1);
    list.replaceChildren(...options.map((o, i) => h("div", {
      class: "picker-opt" + (i === active ? " active" : ""), role: "option",
      onmousedown: (e) => { e.preventDefault(); pick(i); },
    }, o.kind === "person" ? [avatar(o.p.title, "avatar-sm"), h("span", { class: "picker-name" }, o.p.title), h("span", { class: "picker-sub" }, [o.p.fm.role, o.p.fm.team].filter(Boolean).join(" · "))]
      : o.kind === "free" ? [icon("plus", 14), h("span", { class: "picker-name" }, t("people.addName", { name: o.name }))]
        : [icon("users", 14), h("span", { class: "picker-name" }, t("person.createThis", { name: o.name }))])));
    list.hidden = false;
  }
  function pick(i) {
    const o = options[i];
    if (!o) return;
    if (o.kind === "person") add(o.p.title);
    else if (o.kind === "free") add(o.name);
    else createAndAdd(o.name);
  }

  input.addEventListener("input", () => { active = 0; open(); });
  input.addEventListener("focus", open);
  input.addEventListener("blur", () => setTimeout(() => { if (input.value.trim() && opts.addOnBlur !== false) add(input.value); close(); }, 150));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (list.hidden) open(); active = (active + (e.key === "ArrowDown" ? 1 : options.length - 1)) % Math.max(1, options.length); open(); return; }
    if ((e.key === "Enter" || e.key === "Tab") && !list.hidden && options.length && input.value.trim()) { e.preventDefault(); pick(active); return; }
    if (e.key === "Enter" && input.value.trim()) { e.preventDefault(); add(input.value); return; }
    if (e.key === ",") { e.preventDefault(); add(input.value); return; }
    if (e.key === "Backspace" && !input.value && names.length) { names.pop(); changed(); }
    if (e.key === "Escape" && !list.hidden) { e.stopPropagation(); close(); }
  });
  paintChips();
  return { el, get: () => [...names] };
}
