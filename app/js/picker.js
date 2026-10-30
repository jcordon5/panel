// People picker: chips + an input with suggestions from your people, free names allowed,
// and "create person" in place. Also small person bits (avatar, chip) used across views.

import { h, fold } from "./util.js";
import { icon } from "./icons.js";
import { t } from "./i18n.js";
import { vault, findPerson, findTeam } from "./model.js";
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
  const team = opts.team || (opts.person === undefined && !findPerson(name) ? findTeam(name)?.people : null);
  if (team) return teamChip(name, team);
  const p = opts.person !== undefined ? opts.person : findPerson(name);
  const label = p ? p.title : String(name).replace(/^@|\[\[|\]\]/g, "");
  const inner = [avatar(label, "avatar-sm"), h("span", { class: "chip-text" }, label)];
  if (p) return h("a", { class: "chip chip-person", href: route.doc(p.path), title: [p.fm.role, [].concat(p.fm.team || []).join(", ")].filter(Boolean).join(" · ") || p.title, onclick: (e) => e.stopPropagation() }, ...inner);
  return h("span", { class: "chip chip-person unknown", title: t("person.notYet") }, ...inner);
}

/** A whole team as an attendee ("Equipo IA"): its members on hover. */
export function teamChip(name, people) {
  return h("span", { class: "chip chip-person chip-team", title: people.map((p) => p.title).join(", ") },
    h("span", { class: "avatar avatar-sm team-avatar" }, icon("users", 11)), h("span", { class: "chip-text" }, String(name).replace(/^@|\[\[|\]\]/g, "")),
    h("span", { class: "chip-count" }, String(people.length)));
}

function teamMatches(q) {
  const k = fold(q.trim().replace(/^(equipo|team)\b\s*|\s*\b(equipo|team)$/i, ""));
  return [...vault().teams.values()].filter((tm) => !k || fold(tm.name).includes(k)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 5);
}

function matches(q) {
  const k = fold(q.trim());
  const v = vault();
  if (!k) return v.people.slice(0, 8);
  return v.people.map((p) => {
    const hay = [p.title, ...(Array.isArray(p.fm.aliases) ? p.fm.aliases : []), [].concat(p.fm.team || []).join(" "), p.fm.role || ""].map(fold);
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
    if (opts.single) names = [name]; else names.push(name);
    input.value = "";
    close();
    changed();
  };
  // what's typed but not picked: a half-written name that fits one person is that person ("Luis P")
  const resolve = (q) => {
    q = String(q || "").trim();
    const only = q && !findPerson(q) && !findTeam(q) ? matches(q) : [];
    return only.length === 1 ? only[0].title : q;
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
      const tm = p ? null : findTeam(n);
      if (tm) {
        const c = teamChip(n, tm.people);
        c.classList.add("picker-chip");
        c.append(h("button", { class: "chip-x", type: "button", "aria-label": t("common.remove"), onclick: (e) => { e.stopPropagation(); names.splice(i, 1); changed(); input.focus(); } }, icon("x", 11)));
        return c;
      }
      return h("span", { class: "chip chip-person picker-chip" + (p ? "" : " unknown"), title: p ? [p.fm.role, [].concat(p.fm.team || []).join(", ")].filter(Boolean).join(" · ") : t("person.notYet") },
        avatar(p ? p.title : n, "avatar-sm"), h("span", { class: "chip-text" }, p ? p.title : n),
        p ? null : h("button", { class: "chip-x", type: "button", title: t("person.createThis", { name: n }), onclick: (e) => { e.stopPropagation(); names.splice(i, 1); createAndAdd(n); } }, icon("plus", 11)),
        h("button", { class: "chip-x", type: "button", "aria-label": t("common.remove"), onclick: (e) => { e.stopPropagation(); names.splice(i, 1); changed(); input.focus(); } }, icon("x", 11)));
    }));
  }

  function close() { list.hidden = true; options = []; }
  function open() {
    const q = input.value;
    // teams first, in their own group; people below (a team's name no longer buries it under its members)
    const teams = opts.single ? [] : teamMatches(q).filter((tm) => !names.some((n) => findTeam(n) === tm));
    const found = matches(q).filter((p) => !names.some((n) => findPerson(n) === p));
    options = [...teams.map((tm) => ({ kind: "team", tm })), ...found.map((p) => ({ kind: "person", p }))];
    const exact = (x) => fold(x) === fold(q.trim());
    if (q.trim() && !found.some((p) => exact(p.title)) && !teams.some((tm) => exact(tm.name) || exact(t("team.attendee", { name: tm.name })))) {
      options.push({ kind: "free", name: q.trim() }, { kind: "create", name: q.trim() });
    }
    if (!options.length) { close(); return; }
    active = Math.min(active, options.length - 1);
    const head = (i) => (opts.single ? null
      : i === 0 && options[0].kind === "team" ? h("div", { class: "picker-group" }, t("picker.teams"))
        : options[i].kind === "person" && (i === 0 || options[i - 1].kind !== "person") && teams.length ? h("div", { class: "picker-group" }, t("picker.people")) : null);
    list.replaceChildren(...options.flatMap((o, i) => [head(i), h("div", {
      class: "picker-opt" + (i === active ? " active" : ""), role: "option",
      onmousedown: (e) => { e.preventDefault(); pick(i); },
    }, o.kind === "person" ? [avatar(o.p.title, "avatar-sm"), h("span", { class: "picker-name" }, o.p.title), h("span", { class: "picker-sub" }, [o.p.fm.role, [].concat(o.p.fm.team || []).join(", ")].filter(Boolean).join(" · "))]
      : o.kind === "team" ? [h("span", { class: "avatar avatar-sm team-avatar" }, icon("users", 11)), h("span", { class: "picker-name" }, t("team.attendee", { name: o.tm.name })), h("span", { class: "picker-sub" }, t("team.members", { n: o.tm.people.length }))]
      : o.kind === "free" ? [icon("plus", 14), h("span", { class: "picker-name" }, t("people.addName", { name: o.name }))]
        : [icon("users", 14), h("span", { class: "picker-name" }, t("person.createThis", { name: o.name }))])]).filter(Boolean));
    list.hidden = false;
    place();
  }
  const place = () => placeList(el, list);
  function pick(i) {
    const o = options[i];
    if (!o) return;
    if (o.kind === "person") add(o.p.title);
    else if (o.kind === "team") add(t("team.attendee", { name: o.tm.name }));
    else if (o.kind === "free") add(o.name);
    else createAndAdd(o.name);
  }

  input.addEventListener("input", () => { active = 0; open(); });
  input.addEventListener("focus", open);
  input.addEventListener("blur", () => setTimeout(() => { if (input.value.trim() && opts.addOnBlur !== false) add(resolve(input.value)); close(); }, 150));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (list.hidden) open(); active = (active + (e.key === "ArrowDown" ? 1 : options.length - 1)) % Math.max(1, options.length); open(); return; }
    if ((e.key === "Enter" || e.key === "Tab") && !list.hidden && options.length && input.value.trim()) { e.preventDefault(); pick(active); return; }
    if (e.key === "Enter" && input.value.trim()) { e.preventDefault(); add(input.value); return; }
    if (e.key === ",") { e.preventDefault(); add(input.value); return; }
    if (e.key === "Backspace" && !input.value && names.length) { names.pop(); changed(); }
    if (e.key === "Escape" && !list.hidden) { e.stopPropagation(); close(); }
  });
  paintChips();
  // what is typed but not added yet counts too (people click "Create" right after typing a name)
  const get = () => {
    const v = resolve(input.value);
    if (!v || names.some((n) => fold(n) === fold(v) || (findPerson(n) && findPerson(n) === findPerson(v)))) return [...names];
    return opts.single ? [v] : [...names, v];
  };
  return { el, get };
}

/** Open a picker's list upwards when it would be cut off (a picker at the bottom of a dialog). */
function placeList(el, list) {
  let box = el.parentElement;
  while (box && box !== document.body && !/(auto|scroll|hidden)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
  const lim = box && box !== document.body ? box.getBoundingClientRect() : { top: 0, bottom: innerHeight };
  const r = el.getBoundingClientRect(), need = Math.min(list.scrollHeight, 280) + 8;
  list.classList.toggle("up", lim.bottom - r.bottom < need && r.top - lim.top > lim.bottom - r.bottom);
}

/**
 * Several short values as chips, with suggestions (a person's teams):
 * listPicker(["Finance"], { suggest: () => ["Finance", "Sales"], placeholder }) -> { el, get }
 */
export function listPicker(initial = [], opts = {}) {
  const values = [...initial];
  const chips = h("div", { class: "picker-chips" });
  const input = h("input", { class: "picker-input", type: "text", placeholder: opts.placeholder || "", autocomplete: "off", "aria-label": opts.label || "" });
  const list = h("div", { class: "picker-list", role: "listbox", hidden: true });
  const el = h("div", { class: "picker", onclick: (e) => { if (e.target === el || e.target === chips) input.focus(); } }, chips, input, list);
  let options = [], active = 0;
  const has = (v) => values.some((x) => fold(x) === fold(v));
  const paint = () => chips.replaceChildren(...values.map((v, i) => h("span", { class: "chip picker-chip" }, h("span", { class: "chip-text" }, v),
    h("button", { class: "chip-x", type: "button", "aria-label": t("common.remove"), onclick: (e) => { e.stopPropagation(); values.splice(i, 1); paint(); input.focus(); } }, icon("x", 11)))));
  const close = () => { list.hidden = true; options = []; };
  const add = (v) => { v = String(v || "").trim(); input.value = ""; close(); if (v && !has(v)) { values.push(v); paint(); } };
  const open = () => {
    const q = input.value.trim(), k = fold(q);
    options = (opts.suggest?.() || []).filter((s) => !has(s) && (!k || fold(s).includes(k))).slice(0, 8).map((s) => ({ v: s }));
    if (q && !has(q) && !options.some((o) => fold(o.v) === k)) options.push({ v: q, isNew: true });
    if (!options.length) { close(); return; }
    active = Math.min(active, options.length - 1);
    list.replaceChildren(...options.map((o, i) => h("div", { class: "picker-opt" + (i === active ? " active" : ""), role: "option", onmousedown: (e) => { e.preventDefault(); add(o.v); } },
      o.isNew ? [icon("plus", 14), h("span", { class: "picker-name" }, t("list.addNew", { name: o.v }))] : h("span", { class: "picker-name" }, o.v))));
    list.hidden = false;
    placeList(el, list);
  };
  input.addEventListener("input", () => { active = 0; open(); });
  input.addEventListener("focus", open);
  input.addEventListener("blur", () => setTimeout(() => { if (input.value.trim()) add(input.value); close(); }, 150));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); active = (active + (e.key === "ArrowDown" ? 1 : options.length - 1)) % Math.max(1, options.length); open(); return; }
    if (e.key === "Enter" || e.key === ",") {
      if (!input.value.trim() && e.key === "Enter" && list.hidden) return; // let the dialog submit
      e.preventDefault();
      add(!list.hidden && options[active] ? options[active].v : input.value);
      return;
    }
    if (e.key === "Backspace" && !input.value && values.length) { values.pop(); paint(); }
    if (e.key === "Escape" && !list.hidden) { e.stopPropagation(); close(); }
  });
  paint();
  const get = () => (input.value.trim() && !has(input.value) ? [...values, input.value.trim()] : [...values]);
  return { el, get };
}

/** The teams people are in, for suggestions. */
export const teamNames = () => [...vault().teams.values()].map((tm) => tm.name).sort((a, b) => a.localeCompare(b));

/* ------------------------------------------------------------ time */

/** "930", "9:30", "9.30", "9h30", "9" -> "09:30" / "09:00"; "" -> ""; anything else -> null */
export function normTime(s) {
  const v = String(s || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!v) return "";
  let m = /^(\d{1,2})(?:[:.h,](\d{1,2})?)?$/.exec(v) || (/^(\d{3,4})$/.test(v) ? [v, v.slice(0, -2), v.slice(-2)] : null);
  if (!m) return null;
  const hh = +m[1], mm = m[2] === undefined || m[2] === "" ? 0 : +(m[2].length === 1 ? m[2] + "0" : m[2]);
  return hh < 24 && mm < 60 ? String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0") : null;
}

const SLOTS = Array.from({ length: 4 * 24 }, (_, i) => String(Math.floor(i / 4)).padStart(2, "0") + ":" + String((i % 4) * 15).padStart(2, "0"));

/** A time field: type it any way ("930", "9:30") or pick from a list. Behaves like an input (.value). */
export function timeField(value = "") {
  const input = h("input", { class: "input time-input", type: "text", inputmode: "numeric", autocomplete: "off", placeholder: "09:30", value: normTime(value) || "" });
  const list = h("div", { class: "picker-list time-list", role: "listbox", hidden: true });
  const wrap = h("div", { class: "time-field" }, input, list);
  let opts = [], active = 0;
  const open = () => {
    opts = SLOTS;
    const typed = normTime(input.value);
    active = Math.max(0, opts.findIndex((x) => x >= (typed || "09:00")));
    list.replaceChildren(...opts.map((x, i) => h("div", { class: "picker-opt" + (i === active ? " active" : ""), role: "option", onmousedown: (e) => { e.preventDefault(); pick(x); } }, x)));
    list.hidden = false;
    list.children[active]?.scrollIntoView({ block: "center" });
  };
  const pick = (x) => { input.value = x; list.hidden = true; input.dispatchEvent(new Event("change", { bubbles: true })); };
  input.addEventListener("focus", open);
  input.addEventListener("input", () => { active = 0; open(); });
  input.addEventListener("keydown", (e) => {
    if (list.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : opts.length - 1)) % opts.length;
      input.value = opts[active];
      [...list.children].forEach((c, i) => c.classList.toggle("active", i === active));
      list.children[active]?.scrollIntoView({ block: "nearest" });
    }
    if (e.key === "Enter") { e.preventDefault(); pick(normTime(input.value) || opts[active]); }
    if (e.key === "Escape") { e.stopPropagation(); list.hidden = true; }
  });
  input.addEventListener("blur", () => setTimeout(() => {
    list.hidden = true;
    const n = normTime(input.value);
    input.value = n ?? "";
    wrap.classList.toggle("invalid", n === null);
  }, 120));
  Object.defineProperty(wrap, "value", { get: () => normTime(input.value) || "", set: (v) => { input.value = normTime(v) || ""; } });
  wrap.focus = () => input.focus();
  return wrap;
}
