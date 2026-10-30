// Creation / properties dialogs for meetings, series, people, knowledge, notes and projects.

import { h, today, nowTime, isISODate, storage, addDays } from "../util.js";
import { icon } from "../icons.js";
import { t, fmtDate, weekdayName } from "../i18n.js";
import { vault, PROJECT_COLORS, KNOWLEDGE_KINDS } from "../model.js";
import * as A from "../actions.js";
import { modal, field, errorToast, toast, closeModals } from "../ui.js";
import { go, route } from "../nav.js";
import { peoplePicker, timeField, listPicker, teamNames } from "../picker.js";
import { seriesRule, weekday, DAY_KEYS, nextOccurrence } from "../series.js";

function projectSelect(selected, { allowNone = true } = {}) {
  const projects = [...vault().projects.values()].sort((a, b) => a.title.localeCompare(b.title));
  return h("select", { class: "input" },
    allowNone ? h("option", { value: "" }, t("quick.noProject")) : null,
    projects.map((p) => h("option", { value: p.slug, selected: p.slug === selected }, p.title + (p.status === "done" ? " ✓" : ""))));
}

const splitList = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
const listText = (v) => (Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v));

/** <select> of the templates of a kind (only when there is more than one). */
function templateField(kind) {
  const list = A.listTemplates(kind);
  if (list.length < 2) return { el: null, get: () => undefined };
  const last = storage("tpl." + kind);
  const sel = h("select", { class: "input" }, list.map((tp) => h("option", { value: tp.path, selected: tp.path === last }, tp.label)));
  const edit = h("a", { class: "link-btn", href: "#", onclick: (e) => { e.preventDefault(); closeModals(); go(route.edit(sel.value)); } }, icon("pencil", 12), t("tpl.edit"));
  return { el: field(t("tpl.label"), sel, edit), get: () => { storage("tpl." + kind, sel.value); return sel.value; } };
}

/* ------------------------------------------------------------ recurrence */

/** Repeat rule editor. initial: a rule from seriesRule() (or nothing); dateInput: the start date field. */
function recurrenceField(initial, dateInput, { allowNone = false } = {}) {
  const r = initial || { repeat: allowNone ? "" : "weekly", days: [], interval: 1, nth: null, until: null };
  const repeat = h("select", { class: "input" },
    allowNone ? h("option", { value: "" }, t("series.none")) : null,
    ["weekdays", "daily", "weekly", "monthly"].map((k) => h("option", { value: k, selected: r.repeat === k }, t("series.repeat." + k))));
  let days = new Set(r.days && r.days.length ? r.days : [weekday(dateInput.value || today())]);
  const dayBtns = h("div", { class: "day-toggles", role: "group" }, DAY_KEYS.map((k, i) => h("button", {
    type: "button", class: "day-toggle", "data-i": String(i), title: weekdayName(addDays("2026-11-02", i)),
    onclick: () => { days.has(i) && days.size > 1 ? days.delete(i) : days.add(i); paint(); },
  }, t("series.dayShort." + k))));
  const interval = h("input", { class: "input input-auto", type: "number", min: "1", max: "12", value: String(r.interval || 1) });
  const monthly = h("select", { class: "input" });
  const until = h("input", { class: "input", type: "date", value: r.until || "" });
  const box = h("div", { class: "recurrence" });
  const note = h("div", { class: "field-hint" });
  function paint() {
    const k = repeat.value;
    const start = dateInput.value || today();
    dayBtns.querySelectorAll("button").forEach((b) => b.classList.toggle("active", days.has(+b.dataset.i)));
    const nthOf = Math.ceil(+start.slice(8) / 7);
    const last = addDays(start, 7).slice(5, 7) !== start.slice(5, 7);
    const sel = monthly.value || (r.nth ? "nth" : "date");
    monthly.replaceChildren(
      h("option", { value: "date", selected: sel === "date" }, t("series.monthlyDate", { d: +start.slice(8) })),
      h("option", { value: "nth", selected: sel === "nth" }, t("series.monthlyNth", { n: t("series.nth." + Math.min(nthOf, 4)), day: weekdayName(start) })),
      last ? h("option", { value: "last", selected: sel === "last" }, t("series.monthlyNth", { n: t("series.nth.last"), day: weekdayName(start) })) : "");
    box.replaceChildren(...(k ? [
      k === "weekly" ? field(t("series.days"), dayBtns) : null,
      k === "monthly" ? field(t("series.monthlyOn"), monthly) : null,
      k !== "weekdays" ? h("div", { class: "field-row" },
        field(t("series.every." + k), h("div", { class: "inline-input" }, interval, h("span", { class: "muted small" }, t("series.unit." + k)))),
        field(t("series.until"), until, t("series.untilHint"))) : field(t("series.until"), until, t("series.untilHint")),
    ].filter(Boolean) : []));
    const rule = get();
    const next = rule ? nextOccurrence(seriesRule({ ...rule, days: rule.days.map((i) => DAY_KEYS[i]) }, start), start) : null;
    note.textContent = next ? t("series.nextOn", { date: fmtDate(next, "long") }) : "";
  }
  function get() {
    const k = repeat.value;
    if (!k) return null;
    const start = dateInput.value || today();
    const m = monthly.value || "date";
    return {
      repeat: k, start,
      days: k === "weekly" ? [...days].sort() : k === "monthly" && m !== "date" ? [weekday(start)] : [],
      interval: k === "weekdays" ? 1 : Math.max(1, +interval.value || 1),
      nth: k === "monthly" && m !== "date" ? (m === "last" ? -1 : Math.min(Math.ceil(+start.slice(8) / 7), 4)) : null,
      until: until.value || null,
    };
  }
  repeat.addEventListener("change", paint);
  monthly.addEventListener("change", paint);
  interval.addEventListener("input", paint);
  dateInput.addEventListener("change", () => { if (repeat.value === "weekly" && days.size === 1) days = new Set([weekday(dateInput.value || today())]); paint(); });
  paint();
  return { repeatEl: repeat, el: h("div", {}, box, note), get, paint };
}

/* ------------------------------------------------------------ meetings */

export function newMeetingDialog(defaults = {}) {
  const title = h("input", { class: "input input-lg", type: "text", placeholder: t("meeting.titlePh"), required: true, autofocus: true });
  const date = h("input", { class: "input", type: "date", value: defaults.date || today(), required: true });
  const time = timeField(defaults.time || "");
  const proj = projectSelect(defaults.project);
  const people = peoplePicker(defaults.attendees || []);
  const tpl = templateField("meeting");
  const rec = recurrenceField(null, date, { allowNone: true });
  const nowBtn = h("button", { class: "link-btn", type: "button", onclick: () => { date.value = today(); time.value = nowTime(); } }, icon("clock", 12), t("meeting.now"));
  modal({
    title: t("meeting.new"),
    body: [
      field(t("common.title"), title),
      h("div", { class: "field-row" }, field(t("common.date"), date), field(t("common.time"), time, nowBtn)),
      field(t("meeting.attendees"), people.el, t("meeting.attendeesHint")),
      field(t("series.repeatLabel"), rec.repeatEl), rec.el,
      field(t("common.project"), proj),
      tpl.el,
    ],
    actions: [{ label: t("common.cancel") }, {
      label: t("meeting.create"), primary: true, onClick: async () => {
        if (!title.value.trim()) { title.focus(); return false; }
        if (!isISODate(date.value)) { date.focus(); return false; }
        const rule = rec.get();
        let path;
        if (rule) {
          // a recurring meeting: the series, and the note of its first session
          const sp = await A.createSeries({ title: title.value, rule, time: time.value, attendees: people.get(), project: proj.value, template: tpl.get() });
          const sd = vault().series.find((x) => x.path === sp);
          const first = nextOccurrence(sd.rule, date.value);
          if (!first) { go(route.doc(sp)); return; }
          path = await A.createSession(sd, first);
          toast(t("series.created"));
        } else {
          path = await A.createMeeting({ title: title.value, date: date.value, time: time.value, project: proj.value, attendees: people.get(), template: tpl.get() });
        }
        go(route.meet(path));
      },
    }],
  });
}

/** Create or edit a recurring meeting. */
export function seriesDialog(sd = null) {
  const fm = sd ? sd.fm : {};
  const title = h("input", { class: "input input-lg", type: "text", value: sd ? sd.title : "", placeholder: t("meeting.titlePh"), autofocus: !sd });
  const start = h("input", { class: "input", type: "date", value: sd && sd.rule.start ? sd.rule.start : today() });
  const time = timeField(typeof fm.time === "string" ? fm.time : "");
  const people = peoplePicker(sd ? sd.attendees : []);
  const proj = projectSelect(typeof fm.project === "string" ? fm.project : "");
  const rec = recurrenceField(sd ? sd.rule : null, start);
  const paused = h("input", { type: "checkbox", checked: fm.status === "paused" });
  modal({
    title: sd ? t("series.edit") : t("series.new"),
    body: [
      field(t("common.title"), title),
      h("div", { class: "field-row" }, field(t("series.start"), start), field(t("common.time"), time)),
      field(t("series.repeatLabel"), rec.repeatEl), rec.el,
      field(t("series.attendees"), people.el, t("series.attendeesHint")),
      field(t("common.project"), proj),
      sd ? h("label", { class: "check-field" }, paused, h("span", {}, t("series.paused"))) : null,
    ],
    actions: [{ label: t("common.cancel") }, {
      label: sd ? t("common.save") : t("series.create"), primary: true, onClick: async () => {
        if (!title.value.trim()) { title.focus(); return false; }
        const rule = rec.get();
        if (!sd) {
          const sp = await A.createSeries({ title: title.value, rule, time: time.value, attendees: people.get(), project: proj.value });
          go(route.doc(sp));
          return;
        }
        const up = { ...A.seriesFm(rule), time: time.value || null, attendees: people.get(), project: proj.value || null, status: paused.checked ? "paused" : null };
        if (title.value.trim() !== sd.title) up.title = title.value.trim();
        await A.setProps(sd.path, up);
        toast(t("props.saved"));
      },
    }],
  });
}

/* ------------------------------------------------------------ people and knowledge */

export function newPersonDialog(defaults = {}) {
  const name = h("input", { class: "input input-lg", type: "text", value: defaults.name || "", placeholder: t("person.namePh"), autofocus: true });
  const role = h("input", { class: "input", type: "text", placeholder: t("person.rolePh") });
  const team = listPicker([], { suggest: teamNames, placeholder: t("person.teamsPh"), label: t("person.teams") });
  const email = h("input", { class: "input", type: "email", placeholder: "nombre@empresa.com" });
  modal({
    title: t("person.new"),
    body: [field(t("common.name"), name), h("div", { class: "field-row" }, field(t("person.role"), role), field(t("person.teams"), team.el)), field(t("person.email"), email)],
    actions: [{ label: t("common.cancel") }, {
      label: t("person.create"), primary: true, onClick: async () => {
        if (!name.value.trim()) { name.focus(); return false; }
        const path = await A.createPerson({ name: name.value, role: role.value, team: team.get(), email: email.value });
        if (defaults.onCreated) defaults.onCreated(path); else go(route.doc(path));
      },
    }],
  });
}

export function newKnowledgeDialog(defaults = {}) {
  const title = h("input", { class: "input input-lg", type: "text", placeholder: t("know.titlePh"), autofocus: true });
  let kind = defaults.kind || "howto";
  const seg = h("div", { class: "segmented", role: "radiogroup" }, KNOWLEDGE_KINDS.map((k) => h("button", {
    type: "button", "data-v": k, class: k === kind ? "active" : "",
    onclick: (e) => { kind = k; seg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === e.currentTarget)); },
  }, icon(KIND_ICON[k], 14), t("know.kind." + k))));
  const proj = projectSelect(defaults.project);
  modal({
    title: t("know.new"),
    body: [field(t("common.title"), title), field(t("know.kindLabel"), seg, t("know.kindHint")), field(t("common.project"), proj)],
    actions: [{ label: t("common.cancel") }, {
      label: t("know.create"), primary: true, onClick: async () => {
        if (!title.value.trim()) { title.focus(); return false; }
        const path = await A.createKnowledge({ title: title.value, kind, project: proj.value });
        go(route.edit(path));
      },
    }],
  });
}

export const KIND_ICON = { howto: "list-checks", resource: "link", fact: "note" };

export function newNoteDialog(defaults = {}) {
  const title = h("input", { class: "input input-lg", type: "text", placeholder: t("note.titlePh"), autofocus: true });
  const proj = projectSelect(defaults.project);
  const pin = h("input", { type: "checkbox", checked: !!defaults.pinned });
  const tpl = templateField("note");
  modal({
    title: t("note.new"),
    body: [
      field(t("common.title"), title),
      field(t("common.project"), proj, t("note.projectHint")),
      tpl.el,
      h("label", { class: "check-field" }, pin, h("span", {}, t("note.pinLabel"))),
    ],
    actions: [{ label: t("common.cancel") }, {
      label: t("note.create"), primary: true, onClick: async () => {
        const path = await A.createNote({ title: title.value, project: proj.value, pinned: pin.checked, template: tpl.get() });
        go(route.edit(path));
      },
    }],
  });
}

function colorPicker(selected) {
  let value = selected || PROJECT_COLORS[Math.floor(Math.random() * 8)];
  const wrap = h("div", { class: "color-picker", role: "radiogroup" });
  const paint = () => wrap.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.color === value));
  for (const c of PROJECT_COLORS) {
    wrap.append(h("button", { type: "button", class: "swatch", "data-color": c, "aria-label": c, onclick: () => { value = c; paint(); } }));
  }
  paint();
  return { el: wrap, get: () => value };
}

export function newProjectDialog() {
  const name = h("input", { class: "input input-lg", type: "text", placeholder: t("project.namePh"), autofocus: true });
  const desc = h("textarea", { class: "input", rows: "3", placeholder: t("project.descPh") });
  const code = h("input", { class: "input input-code", type: "text", placeholder: t("project.codePh"), maxlength: "16" });
  const color = colorPicker();
  modal({
    title: t("project.new"),
    body: [field(t("common.name"), name), h("div", { class: "field-row" }, field(t("project.code"), code, t("project.codeHint")), field(t("common.color"), color.el)), field(t("common.description"), desc)],
    actions: [{ label: t("common.cancel") }, {
      label: t("project.create"), primary: true, onClick: async () => {
        if (!name.value.trim()) { name.focus(); return false; }
        const slug = await A.createProject({ name: name.value, color: color.get(), description: desc.value, code: code.value.trim() });
        go(route.project(slug));
      },
    }],
  });
}

/** Edit frontmatter-backed properties of any document. */
export function propertiesDialog(doc, onDone) {
  const title = h("input", { class: "input input-lg", type: "text", value: doc.title });
  const fields = [field(t("common.title"), title)];
  let date, time, proj, people, tags, pin, status, color, teams, extra = {};
  if (doc.kind === "meeting") {
    date = h("input", { class: "input", type: "date", value: doc.date || today() });
    time = timeField(doc.time || "");
    people = peoplePicker(doc.attendees);
    fields.push(h("div", { class: "field-row" }, field(t("common.date"), date), field(t("common.time"), time)));
    fields.push(field(t("meeting.attendees"), people.el));
  }
  const text = (k, label, ph) => { extra[k] = h("input", { class: "input", type: "text", value: listText(doc.fm[k]), placeholder: ph || "" }); fields.push(field(label, extra[k])); };
  if (doc.kind === "person") {
    text("role", t("person.role"), t("person.rolePh"));
    teams = listPicker([doc.fm.team, doc.fm.teams].flatMap((x) => (Array.isArray(x) ? x : String(x || "").split(","))).map((x) => String(x).trim()).filter(Boolean),
      { suggest: teamNames, placeholder: t("person.teamsPh"), label: t("person.teams") });
    fields.push(field(t("person.teams"), teams.el, t("person.teamsHint")));
    text("org", t("person.org"));
    text("email", t("person.email"));
    text("phone", t("person.phone"));
    text("aliases", t("person.aliases"), t("person.aliasesPh"));
    text("ask_for", t("person.askFor"), t("person.askForPh"));
  }
  if (doc.kind === "knowledge") {
    extra.kind = h("select", { class: "input" }, KNOWLEDGE_KINDS.map((k) => h("option", { value: k, selected: (doc.fm.kind || "fact") === k }, t("know.kind." + k))));
    fields.push(field(t("know.kindLabel"), extra.kind));
    people = peoplePicker(Array.isArray(doc.fm.people) ? doc.fm.people : []);
    fields.push(field(t("know.people"), people.el, t("know.peopleHint")));
    text("source", t("know.source"), t("know.sourcePh"));
  }
  if (doc.kind === "knowledge") {
    proj = projectSelect(doc.project);
    fields.push(field(t("common.project"), proj));
  }
  if (doc.kind === "meeting" || doc.kind === "note" || doc.kind === "doc") {
    proj = projectSelect(doc.project);
    fields.push(field(t("common.project"), proj, doc.kind !== "meeting" ? t("props.moveHint") : null));
  }
  if (doc.kind === "note") {
    pin = h("input", { type: "checkbox", checked: doc.pinned });
    fields.push(h("label", { class: "check-field" }, pin, h("span", {}, t("note.pinLabel"))));
  }
  if (doc.kind === "project") {
    status = h("select", { class: "input" }, ["active", "paused", "done"].map((s) => h("option", { value: s, selected: (doc.fm.status || "active") === s }, t("project.status." + s))));
    color = colorPicker(doc.fm.color);
    extra.code = h("input", { class: "input input-code", type: "text", value: listText(doc.fm.code), placeholder: t("project.codePh"), maxlength: "16" });
    fields.push(h("div", { class: "field-row" }, field(t("project.statusLabel"), status), field(t("project.code"), extra.code, t("project.codeHint"))), field(t("common.color"), color.el));
  }
  tags = h("input", { class: "input", type: "text", value: doc.tags.join(", "), placeholder: t("props.tagsPh") });
  fields.push(field(t("common.tags"), tags));

  modal({
    title: t("props.title"),
    body: fields,
    actions: [{ label: t("common.cancel") }, {
      label: t("common.save"), primary: true, onClick: async () => {
        const up = {};
        if (title.value.trim() && title.value.trim() !== doc.title) up.title = title.value.trim();
        if (date && date.value && date.value !== doc.date) up.date = date.value;
        if (time && time.value !== (doc.time || "")) up.time = time.value || null;
        if (people && doc.kind === "meeting" && people.get().join("|") !== doc.attendees.join("|")) up.attendees = people.get();
        if (people && doc.kind === "knowledge") up.people = people.get();
        for (const [k, el] of Object.entries(extra)) {
          const listy = ["aliases", "ask_for"].includes(k);
          const v = listy ? splitList(el.value) : el.value.trim();
          if ((listy ? v.join(", ") : v) !== listText(doc.fm[k])) up[k] = listy ? v : v || null;
        }
        if (teams) {
          const v = teams.get(), was = [doc.fm.team, doc.fm.teams].flatMap((x) => (Array.isArray(x) ? x : String(x || "").split(","))).map((x) => String(x).trim()).filter(Boolean);
          if (v.join("|") !== was.join("|")) { up.team = v.length > 1 ? v : v[0] || ""; if (doc.fm.teams !== undefined) up.teams = null; }
        }
        if (proj && (proj.value || null) !== (doc.project || null)) up.project = proj.value || null;
        if (pin && pin.checked !== doc.pinned) up.pinned = pin.checked ? true : null;
        if (status && status.value !== (doc.fm.status || "active")) up.status = status.value;
        if (color && color.get() !== doc.fm.color) up.color = color.get();
        if (tags.value !== doc.tags.join(", ")) up.tags = splitList(tags.value).length ? splitList(tags.value) : null;
        if (!Object.keys(up).length) return;
        try {
          const np = await A.setProps(doc.path, up);
          toast(t("props.saved"));
          onDone?.(np);
        } catch (e) { errorToast(e); return false; }
      },
    }],
  });
}
