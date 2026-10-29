// Meeting mode: one screen to be in a meeting without scrolling up and down a document.
//
//   left    what you want to bring up (tick it when discussed) + context: what is still
//           open from the previous session and what the attendees owe you
//   middle  notes: type a line and press Enter; "!" makes it a task for you, "@Name" a task
//           for someone, ">" a decision, "?" an open question
//   right   tasks and decisions, filled as you type
//
// Everything is written straight into the meeting's Markdown file, in normal sections that
// also read well in any editor. "Finish" lets you plan your tasks in one go.

import { h, today, addDays, mondayOf } from "../util.js";
import { icon } from "../icons.js";
import { t, relDay, fmtDate, cap } from "../i18n.js";
import { vault, attendeesOf, seriesOf, sessionsOf, waitingTasks, BLOCK_ID_RE } from "../model.js";
import { meetingSections, quickNote } from "../meeting.js";
import { renderInline } from "../markdown.js";
import { content } from "../store.js";
import { state, setBusy } from "../state.js";
import { route, go } from "../nav.js";
import { run, taskList, pickDate } from "../tasks.js";
import { projectChip } from "./common.js";
import { personChip, peoplePicker } from "../picker.js";
import { modal, emptyState, toast } from "../ui.js";
import * as A from "../actions.js";
import { captureDialog } from "./capture.js";
import { sourcesOf } from "../model.js";

export const title = (r) => vault().docs.get(r.arg)?.title || t("mtg.mode");

const drafts = new Map(); // half-typed text survives re-renders
let editingPeople = false;
let scrollNotes = false;

const ITEM = /^(\s*)[-*+]\s+(?:\[([ xX])\]\s+)?(.*)$/;

/** Items of every section of one kind: [{ line, raw, text, done?, indent }] */
function itemsOf(lines, secs, kind) {
  const out = [];
  for (const sec of secs.filter((s) => s.kind === kind)) {
    for (let i = sec.start; i < sec.end; i++) {
      const l = lines[i];
      if (!l.trim() || /^#{1,6}\s/.test(l)) continue;
      const m = ITEM.exec(l);
      if (m) out.push({ line: i, raw: l, indent: m[1].length, check: m[2] !== undefined, done: !!m[2] && m[2] !== " ", text: m[3], lead: l.slice(0, l.length - m[3].length) });
      else out.push({ line: i, raw: l, indent: 0, check: false, done: false, text: l.trim(), lead: "" });
    }
  }
  return out;
}

export function render(root, r) {
  const path = r.arg;
  const doc = vault().docs.get(path);
  if (!doc || doc.kind !== "meeting") { root.append(emptyState("users", t("doc.notFound"), path)); return; }
  const text = content(path) || "";
  const lines = text.split("\n");
  const secs = meetingSections(lines, doc.bodyLine);
  const sd = seriesOf(doc);
  const people = attendeesOf(doc);

  /* ---------- header */
  const picker = editingPeople ? peoplePicker(doc.attendees, { onChange: (names) => run(A.setProps(path, { attendees: names })) }) : null;
  root.append(h("div", { class: "meet-head" },
    h("div", { class: "meet-title-row" },
      h("div", {},
        h("div", { class: "eyebrow" }, cap(relDay(doc.date || today())) + (doc.time ? " · " + doc.time : ""),
          sd ? h("a", { class: "chip chip-series", href: route.doc(sd.path) }, icon("clock", 12), sd.title) : null,
          doc.project ? projectChip(doc.project) : null),
        h("h1", { class: "page-title" }, doc.title)),
      h("div", { class: "page-actions" },
        h("button", { class: "btn btn-ghost", type: "button", title: t("cap.forMeetingHint"), onclick: () => captureDialog({ meeting: path }) }, icon("upload", 15), h("span", {}, t("cap.forMeeting"))),
        h("a", { class: "btn btn-ghost", href: route.doc(path), title: t("mtg.openNote") }, icon("file", 15), h("span", {}, t("mtg.openNote"))),
        h("button", { class: "btn btn-primary", type: "button", onclick: () => finishDialog(path) }, icon("check", 15), h("span", {}, t("mtg.finish"))))),
    h("div", { class: "meet-people" },
      picker ? picker.el : people.map((a) => personChip(a.name, { person: a.person })),
      h("button", { class: "btn btn-sm btn-ghost", type: "button", onclick: () => { editingPeople = !editingPeople; state.render(); } },
        icon(editingPeople ? "check" : "pencil", 13), editingPeople ? t("common.done") : people.length ? t("mtg.editPeople") : t("mtg.addPeople")),
      sourcesOf(doc).map((s) => h("a", { class: "chip chip-source-file", href: route.doc(s.path), title: t("cap.attached") }, icon("upload", 12), s.title)))));

  /* ---------- columns */
  const agenda = itemsOf(lines, secs, "agenda");
  const notes = itemsOf(lines, secs, "notes");
  const tasks = itemsOf(lines, secs, "tasks");
  const decisions = itemsOf(lines, secs, "decisions");
  const summary = itemsOf(lines, secs, "summary");

  const left = h("div", { class: "meet-col meet-agenda" },
    colHead("list-checks", t("mtg.agenda"), agenda.filter((x) => !x.done).length),
    h("div", { class: "meet-items" }, agenda.map((it) => itemRow(path, it, "agenda"))),
    addInput(path, "agenda", t("mtg.agendaPh"), (v) => `- [ ] ${v}`),
    context(doc, sd, people));

  const noteList = h("div", { class: "meet-items meet-notes-list", "data-scroll-key": "meet-notes" },
    summary.length ? h("div", { class: "meet-summary" }, h("div", { class: "meet-summary-title" }, icon("sparkles", 13), t("mtg.summary")), summary.map((it) => itemRow(path, it, "summary"))) : null,
    notes.length ? notes.map((it) => itemRow(path, it, "notes")) : h("div", { class: "meet-empty" }, t("mtg.notesEmpty")));
  const middle = h("div", { class: "meet-col meet-notes" }, colHead("note", t("mtg.notes"), 0), noteList, quickInput(path));

  const right = h("div", { class: "meet-col meet-side" },
    colHead("check", t("mtg.tasks"), tasks.filter((x) => x.check && !x.done).length),
    h("div", { class: "meet-items" }, tasks.length ? tasks.map((it) => itemRow(path, it, "tasks")) : h("div", { class: "meet-empty" }, t("mtg.tasksEmpty"))),
    colHead("arrow-right", t("mtg.decisions"), decisions.length),
    h("div", { class: "meet-items" }, decisions.length ? decisions.map((it) => itemRow(path, it, "decisions")) : h("div", { class: "meet-empty" }, t("mtg.decisionsEmpty"))));

  root.append(h("div", { class: "meet-grid" }, left, middle, right));
  if (scrollNotes) { scrollNotes = false; requestAnimationFrame(() => { noteList.scrollTop = noteList.scrollHeight; }); }
}

function colHead(ic, label, n) {
  return h("div", { class: "meet-col-head" }, icon(ic, 14), h("span", {}, label), n ? h("span", { class: "section-count" }, String(n)) : null);
}

/** A line of a section: checkbox (agenda, tasks), text (click to edit). */
function itemRow(path, it, kind) {
  const id = BLOCK_ID_RE.exec(it.text);
  const shown = id ? it.text.slice(0, id.index) : it.text;
  const isQ = kind === "notes" && /^\?\s/.test(shown);
  const who = kind === "tasks" ? /^@(\[\[[^\]]+\]\]|\S+)\s*[:,-]?\s*/.exec(shown) : null;
  const el = h("div", { class: "meet-item" + (it.done ? " done" : "") + (isQ ? " is-question" : "") + (it.indent ? " indented" : "") });
  if (it.check) {
    el.append(h("button", {
      class: "task-check", type: "button", role: "checkbox", "aria-checked": String(it.done),
      onclick: () => run(A.toggleLineAt(path, it.line, !it.done)),
    }, icon("check", 12)));
  } else el.append(h("span", { class: "meet-bullet" }, isQ ? "?" : kind === "decisions" ? "›" : "•"));
  const body = h("div", { class: "meet-item-text" });
  if (who) body.append(personChip(who[1].replace(/^\[\[|\]\]$/g, "")), " ");
  body.append(h("span", { html: renderInline((who ? shown.slice(who[0].length) : isQ ? shown.slice(2) : shown) || " ") }));
  body.addEventListener("click", (e) => {
    if (e.target.closest("a, button")) return;
    const input = h("input", { class: "meet-edit", type: "text", value: shown });
    const done = (save) => {
      if (input.dataset.done) return;
      input.dataset.done = "1";
      const v = input.value.trim();
      const changed = save && v !== shown.trim();
      if (changed) run(A.setLine(path, it.line, it.raw, v ? it.lead + v + (id ? id[0] : "") : ""), v ? null : t("mtg.removed"));
      setBusy(false);
      if (!changed) state.render();
    };
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); done(true); }
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); done(false); }
    });
    input.addEventListener("blur", () => done(true));
    setBusy(true);
    body.replaceChildren(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });
  el.append(body);
  return el;
}

function addInput(path, kind, placeholder, toLine) {
  const key = "meet-add-" + kind;
  const input = h("input", { class: "meet-add", type: "text", placeholder, "data-focus-key": key, value: drafts.get(key) || "" });
  input.addEventListener("input", () => drafts.set(key, input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing || !input.value.trim()) return;
    e.preventDefault();
    const v = input.value.trim();
    drafts.delete(key);
    input.value = "";
    state.focusKey = key;
    run(A.addToSection(path, kind, [toLine(v)]));
  });
  return h("div", { class: "meet-add-row" }, icon("plus", 14), input);
}

const HINT = { tasks: "mtg.toTask", decisions: "mtg.toDecision", notes: "mtg.toNote" };

/** The quick-note line: type and Enter. Its first character decides where it goes. */
function quickInput(path) {
  const key = "meet-note";
  const input = h("input", { class: "meet-quick", type: "text", placeholder: t("mtg.quickPh"), "data-focus-key": key, value: drafts.get(key) || "", autocomplete: "off", enterkeyhint: "send" });
  const where = h("span", { class: "meet-where" });
  const paint = () => {
    const q = quickNote(input.value);
    where.textContent = q ? "→ " + t(q.line.startsWith("- ? ") ? "mtg.toQuestion" : HINT[q.section]) : "";
    where.dataset.section = q ? q.section : "";
  };
  input.addEventListener("input", () => { drafts.set(key, input.value); paint(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { input.blur(); return; }
    if (e.key !== "Enter" || e.isComposing) return;
    const q = quickNote(input.value);
    if (!q) return;
    e.preventDefault();
    drafts.delete(key);
    input.value = "";
    paint();
    state.focusKey = key;
    scrollNotes = q.section === "notes";
    run(A.addToSection(path, q.section, [q.line]));
  });
  paint();
  // focus the note line when the meeting opens (not on phones: no keyboard until you tap)
  if (matchMedia("(pointer: fine)").matches) requestAnimationFrame(() => { if (!document.activeElement || document.activeElement === document.body) input.focus({ preventScroll: true }); });
  return h("div", { class: "meet-quick-box" },
    h("div", { class: "meet-quick-row" }, input, where),
    h("div", { class: "meet-hints" },
      h("span", {}, h("kbd", {}, "!"), " ", t("mtg.hintTask")),
      h("span", {}, h("kbd", {}, "@"), t("mtg.hintPerson")),
      h("span", {}, h("kbd", {}, ">"), " ", t("mtg.hintDecision")),
      h("span", {}, h("kbd", {}, "?"), " ", t("mtg.hintQuestion"))));
}

/** What you should have in mind: still open from the previous session, and what attendees owe you. */
function context(doc, sd, people) {
  const parts = [];
  const shown = new Set();
  if (sd) {
    const prev = sessionsOf(sd).find((m) => m.date && m.date < (doc.date || today()) && m.path !== doc.path);
    if (prev) {
      const open = vault().docTasks.filter((x) => x.path === prev.path && !x.done);
      for (const x of open) shown.add(x);
      parts.push(h("div", { class: "meet-context-block" },
        h("div", { class: "meet-context-title" }, t("mtg.fromPrevious"), " ", h("a", { href: route.meet(prev.path) }, fmtDate(prev.date, "short"))),
        open.length ? taskList(open, { compact: true }) : h("div", { class: "meet-empty" }, t("mtg.prevAllDone"))));
    }
  }
  const owed = people.filter((a) => a.person).flatMap((a) => waitingTasks(a.person)).filter((x) => x.path !== doc.path && !shown.has(x));
  if (owed.length) parts.push(h("div", { class: "meet-context-block" }, h("div", { class: "meet-context-title" }, t("mtg.owedByAttendees")), taskList(owed, { compact: true, showSource: true })));
  return parts.length ? h("div", { class: "meet-context" }, parts) : null;
}

/* ------------------------------------------------------------ finish: plan the tasks */

function finishDialog(path) {
  const body = h("div", { class: "finish" });
  const paint = () => {
    const doc = vault().docs.get(path);
    const mine = vault().docTasks.filter((x) => x.path === path && !x.done && !x.who);
    const theirs = vault().docTasks.filter((x) => x.path === path && !x.done && x.who);
    const tdy = today();
    const plan = (task, target) => run(A.planAction(task, target)).then(paint);
    body.replaceChildren(
      mine.length ? h("p", { class: "muted small" }, t("mtg.finishHelp")) : h("p", { class: "muted" }, t("mtg.finishNoTasks")),
      h("div", { class: "finish-list" }, mine.map((task) => {
        const placed = task.planned && task.planned[0];
        return h("div", { class: "finish-row" + (placed ? " planned" : "") },
          h("div", { class: "finish-text", html: renderInline(task.text) }),
          placed ? h("span", { class: "chip chip-ok" }, icon("check", 12), placed.kind === "day" ? cap(relDay(placed.date)) : t("nav.inbox"))
            : h("div", { class: "finish-btns" },
              h("button", { class: "btn btn-sm", type: "button", onclick: () => plan(task, { kind: "day", date: tdy }) }, t("date.today")),
              h("button", { class: "btn btn-sm", type: "button", onclick: () => plan(task, { kind: "day", date: addDays(tdy, 1) }) }, t("date.tomorrow")),
              h("button", { class: "btn btn-sm", type: "button", onclick: () => plan(task, { kind: "day", date: addDays(mondayOf(tdy), 7) }) }, t("date.nextWeek")),
              h("button", { class: "btn btn-sm btn-ghost", type: "button", title: t("task.pickDate"), onclick: () => pickDate(tdy, (d) => plan(task, { kind: "day", date: d })) }, icon("calendar", 14))));
      })),
      theirs.length ? h("div", { class: "finish-theirs" }, h("div", { class: "meet-context-title" }, t("mtg.waitingAfter")),
        theirs.map((x) => h("div", { class: "finish-row" }, personChip(x.who), h("div", { class: "finish-text", html: renderInline(x.text.replace(/^@(\[\[[^\]]+\]\]|\S+)\s*[:,-]?\s*/, "")) })))) : null,
      doc && !doc.fm.processed ? h("p", { class: "finish-ai small" }, icon("sparkles", 14), " ", t("mtg.askAi")) : null);
  };
  paint();
  modal({
    title: t("mtg.finishTitle"),
    body,
    wide: true,
    actions: [{ label: t("mtg.backToMeeting") }, { label: t("common.done"), primary: true, onClick: () => { toast(t("mtg.finished")); go(route.doc(path)); } }],
  });
}
