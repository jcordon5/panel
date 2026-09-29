// Creation / properties dialogs for meetings, notes and projects.

import { h, today, nowTime, isISODate, storage } from "../util.js";
import { icon } from "../icons.js";
import { t } from "../i18n.js";
import { vault, PROJECT_COLORS } from "../model.js";
import * as A from "../actions.js";
import { modal, field, errorToast, toast, closeModals } from "../ui.js";
import { go, route } from "../nav.js";

function projectSelect(selected, { allowNone = true } = {}) {
  const projects = [...vault().projects.values()].sort((a, b) => a.title.localeCompare(b.title));
  return h("select", { class: "input" },
    allowNone ? h("option", { value: "" }, t("quick.noProject")) : null,
    projects.map((p) => h("option", { value: p.slug, selected: p.slug === selected }, p.title + (p.status === "done" ? " ✓" : ""))));
}

const splitList = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

/** <select> of the templates of a kind (only when there is more than one). */
function templateField(kind) {
  const list = A.listTemplates(kind);
  if (list.length < 2) return { el: null, get: () => undefined };
  const last = storage("tpl." + kind);
  const sel = h("select", { class: "input" }, list.map((tp) => h("option", { value: tp.path, selected: tp.path === last }, tp.label)));
  const edit = h("a", { class: "link-btn", href: "#", onclick: (e) => { e.preventDefault(); closeModals(); go(route.edit(sel.value)); } }, icon("pencil", 12), t("tpl.edit"));
  return { el: field(t("tpl.label"), sel, edit), get: () => { storage("tpl." + kind, sel.value); return sel.value; } };
}

export function newMeetingDialog(defaults = {}) {
  const title = h("input", { class: "input input-lg", type: "text", placeholder: t("meeting.titlePh"), required: true, autofocus: true });
  const date = h("input", { class: "input", type: "date", value: defaults.date || today(), required: true });
  const time = h("input", { class: "input", type: "time", value: defaults.time || "" });
  const proj = projectSelect(defaults.project);
  const people = h("input", { class: "input", type: "text", placeholder: t("meeting.attendeesPh") });
  const tpl = templateField("meeting");
  const nowBtn = h("button", { class: "link-btn", type: "button", onclick: () => { date.value = today(); time.value = nowTime(); } }, icon("clock", 12), t("meeting.now"));
  modal({
    title: t("meeting.new"),
    body: [
      field(t("common.title"), title),
      h("div", { class: "field-row" }, field(t("common.date"), date), field(t("common.time"), time, nowBtn)),
      field(t("common.project"), proj),
      field(t("meeting.attendees"), people, t("meeting.attendeesHint")),
      tpl.el,
    ],
    actions: [{ label: t("common.cancel") }, {
      label: t("meeting.create"), primary: true, onClick: async () => {
        if (!title.value.trim()) { title.focus(); return false; }
        if (!isISODate(date.value)) { date.focus(); return false; }
        const path = await A.createMeeting({ title: title.value, date: date.value, time: time.value, project: proj.value, attendees: splitList(people.value), template: tpl.get() });
        go(route.edit(path));
      },
    }],
  });
}

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
  const color = colorPicker();
  modal({
    title: t("project.new"),
    body: [field(t("common.name"), name), field(t("common.color"), color.el), field(t("common.description"), desc)],
    actions: [{ label: t("common.cancel") }, {
      label: t("project.create"), primary: true, onClick: async () => {
        if (!name.value.trim()) { name.focus(); return false; }
        const slug = await A.createProject({ name: name.value, color: color.get(), description: desc.value });
        go(route.project(slug));
      },
    }],
  });
}

/** Edit frontmatter-backed properties of any document. */
export function propertiesDialog(doc, onDone) {
  const title = h("input", { class: "input input-lg", type: "text", value: doc.title });
  const fields = [field(t("common.title"), title)];
  let date, time, proj, people, tags, pin, status, color;
  if (doc.kind === "meeting") {
    date = h("input", { class: "input", type: "date", value: doc.date || today() });
    time = h("input", { class: "input", type: "time", value: doc.time || "" });
    people = h("input", { class: "input", type: "text", value: doc.attendees.join(", "), placeholder: t("meeting.attendeesPh") });
    fields.push(h("div", { class: "field-row" }, field(t("common.date"), date), field(t("common.time"), time)));
    fields.push(field(t("meeting.attendees"), people));
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
    fields.push(field(t("project.statusLabel"), status), field(t("common.color"), color.el));
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
        if (people && people.value !== doc.attendees.join(", ")) up.attendees = splitList(people.value);
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
