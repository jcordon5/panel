// The meeting bar: what the editor shows above a meeting note. Compact, so it works on half a
// laptop screen next to the call: time and attendees, attachments for your AI, the context
// (what's open from the previous session, what attendees owe you) folded away, and buttons to
// jump to each section of the note without scrolling.

import { h, today } from "../util.js";
import { icon } from "../icons.js";
import { t, relDay, fmtDate, cap } from "../i18n.js";
import { vault, attendeesOf, seriesOf, sessionsOf, waitingTasks } from "../model.js";
import { meetingSections } from "../meeting.js";
import { route } from "../nav.js";
import { taskList } from "../tasks.js";
import { projectChip } from "./common.js";
import { personChip } from "../picker.js";
import { propertiesDialog } from "./dialogs.js";
import { captureDialog, sourceStrip } from "./capture.js";
import { askAi } from "./entity.js";
import { EditorView } from "../../vendor/codemirror.js";

/** Jump to a "## section": cursor at the end of what's written in it, heading at the top. */
function jump(view, sec) {
  const doc = view.state.doc;
  let line = sec.head + 1; // 1-based CodeMirror lines: heading is sec.head + 1
  for (let n = sec.start + 1; n <= Math.min(sec.end, doc.lines); n++) if (doc.line(n).text.trim()) line = n;
  const pos = doc.line(line).to;
  view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(doc.line(sec.head + 1).from, { y: "start", yMargin: 8 }) });
  view.focus();
}

export function meetingBar(doc, view, path) {
  const sd = seriesOf(doc);
  const people = attendeesOf(doc);
  const jumps = h("div", { class: "mb-jumps" });
  const paintJumps = () => {
    const lines = view.state.doc.toString().split("\n");
    const secs = meetingSections(lines).filter((s) => s.level === 2);
    jumps.replaceChildren(...secs.map((s) => h("button", { class: "mb-jump", type: "button", onclick: () => jump(view, s) }, s.title)));
  };
  paintJumps();

  // context: still open from the previous session, and what the attendees owe you
  const shown = new Set();
  const blocks = [];
  if (sd) {
    const prev = sessionsOf(sd).find((m) => m.date && m.date < (doc.date || today()) && m.path !== doc.path);
    const open = prev ? vault().docTasks.filter((x) => x.path === prev.path && !x.done) : [];
    open.forEach((x) => shown.add(x));
    if (open.length) blocks.push(h("div", { class: "mb-block" }, h("div", { class: "mb-block-title" }, t("mtg.fromPrevious"), " ", h("a", { href: route.doc(prev.path) }, fmtDate(prev.date, "short"))), taskList(open, { compact: true })));
  }
  const owed = [];
  for (const a of people) {
    for (const p of a.people || (a.person ? [a.person] : [])) {
      for (const x of waitingTasks(p)) if (x.path !== doc.path && !shown.has(x)) { shown.add(x); owed.push(x); }
    }
  }
  if (owed.length) blocks.push(h("div", { class: "mb-block" }, h("div", { class: "mb-block-title" }, t("mtg.owedByAttendees")), taskList(owed, { compact: true, showSource: true })));
  const n = blocks.reduce((k, b) => k + b.querySelectorAll(".task").length, 0);

  const bar = h("div", { class: "meeting-bar" },
    h("div", { class: "mb-row" },
      h("span", { class: "mb-when" }, icon("clock", 13), cap(relDay(doc.date || today())) + (doc.time ? " · " + doc.time : "")),
      sd ? h("a", { class: "chip chip-series", href: route.doc(sd.path) }, icon("clock", 12), sd.title) : null,
      doc.project ? projectChip(doc.project) : null,
      people.map((a) => personChip(a.name, { person: a.person, team: a.people })),
      h("button", { class: "btn btn-sm btn-ghost", type: "button", onclick: () => propertiesDialog(vault().docs.get(path) || doc) }, icon("pencil", 12), people.length ? t("mtg.editPeople") : t("mtg.addPeople")),
      h("span", { class: "mb-spacer" }),
      sd ? h("button", { class: "btn btn-sm btn-ghost", type: "button", title: t("ai.prepareHint"), onclick: () => askAi(t("ai.preparePrompt", { title: sd.title })) }, icon("sparkles", 13), t("ai.prepare")) : null,
      h("button", { class: "btn btn-sm btn-ghost", type: "button", title: t("cap.forMeetingHint"), onclick: () => captureDialog({ meeting: path }) }, icon("upload", 13), t("cap.forMeeting"))),
    sourceStrip(doc),
    n ? h("details", { class: "mb-context" }, h("summary", {}, icon("chevron-right", 13, "mb-caret"), t("mtg.context", { n })), blocks) : null,
    jumps);
  bar.refresh = paintJumps;
  return bar;
}
