// The meeting bar: one slim row in the editor's sticky header while you take notes. A button per
// "##" section that jumps there (it stays on screen, so you can jump again), and the context —
// what's open from the previous session, what the attendees owe you — folded at the end. The
// meeting's details (time, attendees, attachments) are on its page, not here: the note gets the room.

import { h, today } from "../util.js";
import { icon } from "../icons.js";
import { t, fmtDate } from "../i18n.js";
import { vault, attendeesOf, seriesOf, sessionsOf, waitingTasks } from "../model.js";
import { meetingSections } from "../meeting.js";
import { route } from "../nav.js";
import { taskList } from "../tasks.js";

/** Jump to a "## section": heading just below the sticky header, cursor at the end of what's written in it. */
function jump(view, sec, header) {
  const doc = view.state.doc;
  let line = sec.head + 1; // 1-based CodeMirror lines: heading is sec.head + 1
  for (let n = sec.start + 1; n <= Math.min(sec.end, doc.lines); n++) if (doc.line(n).text.trim()) line = n;
  view.dispatch({ selection: { anchor: doc.line(line).to } });
  view.focus();
  const top = view.lineBlockAt(doc.line(sec.head + 1).from).top;
  const sc = view.scrollDOM;
  if (sc.scrollHeight > sc.clientHeight + 1) { // the editor scrolls inside its own box
    sc.scrollTop = view.documentTop - sc.getBoundingClientRect().top + sc.scrollTop + top - 8;
  } else { // the page scrolls (narrow windows): keep the heading clear of the sticky header
    const page = document.getElementById("view");
    page.scrollTop += view.documentTop + top - header.getBoundingClientRect().bottom - 8;
  }
}

export function meetingBar(doc, view) {
  const sd = seriesOf(doc);
  const jumps = h("div", { class: "mb-jumps" });
  const bar = h("div", { class: "meeting-bar" });
  const paintJumps = () => {
    const secs = meetingSections(view.state.doc.toString().split("\n")).filter((s) => s.level === 2);
    jumps.replaceChildren(...secs.map((s) => h("button", { class: "mb-jump", type: "button", onclick: () => jump(view, s, bar.closest(".editor-top") || bar) }, s.title)));
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
  for (const a of attendeesOf(doc)) {
    for (const p of a.people || (a.person ? [a.person] : [])) {
      for (const x of waitingTasks(p)) if (x.path !== doc.path && !shown.has(x)) { shown.add(x); owed.push(x); }
    }
  }
  if (owed.length) blocks.push(h("div", { class: "mb-block" }, h("div", { class: "mb-block-title" }, t("mtg.owedByAttendees")), taskList(owed, { compact: true, showSource: true })));
  const n = blocks.reduce((k, b) => k + b.querySelectorAll(".task").length, 0);

  bar.append(jumps, n ? h("details", { class: "mb-context" }, h("summary", {}, icon("chevron-right", 13, "mb-caret"), t("mtg.context", { n })), h("div", { class: "mb-context-body" }, blocks)) : "");
  bar.refresh = paintJumps;
  return bar;
}
