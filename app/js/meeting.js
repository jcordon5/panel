// The parts of a meeting note and quick-note syntax. Pure functions, no I/O.
//
// A meeting is a normal Markdown file; its "## " sections are recognised by their
// heading, in any language and with the names people already use in their own
// templates ("To discuss", "Comentar", "Notas", "Tareas para mí", "Next steps"...):
//
//   summary    the minutes written after the meeting (by you or your AI)
//   agenda     what you want to bring up: a checklist, ticked when discussed
//   notes      what is being said, one line each
//   tasks      action items: "- [ ] text" for you, "- [ ] @Name text" for someone else
//   decisions  what was agreed
//
// Quick notes typed in meeting mode go to the right section by their first character:
//   "! text" -> a task for you   "@Name text" -> a task for Name   "> text" -> a decision
//   "? text" -> an open question (kept in the notes)   anything else -> a note

import { fold } from "./util.js";

export const SECTION_ORDER = ["summary", "agenda", "notes", "tasks", "decisions"];

const MATCH = [
  ["summary", /^(resumen|acta|summary|minutes|recap)\b/],
  ["agenda", /^(para comentar|comentar|a comentar|temas|agenda|orden del dia|to discuss|discuss|talking points|topics)\b/],
  ["decisions", /^(decisiones|acuerdos|decisions|agreed|agreements)\b/],
  ["tasks", /^(tareas|acciones|proximos pasos|siguientes pasos|tasks|action items|actions|next steps|to ?dos?)\b/],
  ["notes", /^(notas|apuntes|notes|discussion|lo que se hablo)\b/],
];

/** Kind of a "## heading" text, or null. */
export function sectionKind(heading) {
  const h = fold(String(heading || "").replace(/^#+\s*/, "").replace(/[*_`:]/g, "").trim());
  for (const [kind, re] of MATCH) if (re.test(h)) return kind;
  return null;
}

/** "## " / "### " sections of a meeting body: [{ kind, title, head, start, end }] (line indexes). */
export function meetingSections(lines, from = 0) {
  const heads = [];
  let fence = false;
  for (let i = from; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) fence = !fence;
    if (!fence && /^#{2,3}\s+\S/.test(lines[i])) heads.push(i);
  }
  return heads.map((head, n) => {
    const title = lines[head].replace(/^#+\s+/, "").trim();
    const level = /^(#+)/.exec(lines[head])[1].length;
    let end = lines.length;
    for (let k = n + 1; k < heads.length; k++) {
      if (/^(#+)/.exec(lines[heads[k]])[1].length <= level) { end = heads[k]; break; }
    }
    return { kind: sectionKind(title), title, head, start: head + 1, end, level };
  });
}

/** First section of a kind, or null. */
export function findSection(lines, kind, from = 0) {
  return meetingSections(lines, from).find((s) => s.kind === kind) || null;
}

/** Line ranges [start, end) where checkboxes are an agenda, not action items. */
export function agendaRanges(lines, from = 0) {
  return meetingSections(lines, from).filter((s) => s.kind === "agenda").map((s) => [s.start, s.end]);
}

/**
 * A quick note typed in meeting mode -> { section, line }.
 * The line is what gets written to the file (Markdown list item).
 */
export function quickNote(input) {
  const text = String(input || "").trim();
  if (!text) return null;
  let m;
  if ((m = /^!\s*(.+)$/.exec(text))) return { section: "tasks", line: `- [ ] ${m[1].trim()}` };
  if (/^@\S/.test(text)) return { section: "tasks", line: `- [ ] ${text}` };
  if ((m = /^>\s*(.+)$/.exec(text))) return { section: "decisions", line: `- ${m[1].trim()}` };
  if ((m = /^\?\s*(.+)$/.exec(text))) return { section: "notes", line: `- ? ${m[1].trim()}` };
  return { section: "notes", line: `- ${text.replace(/^[-*]\s+/, "")}` };
}

/** "@Name rest" / "@[[Full Name]] rest" at the start of a task: who it is waiting on. */
export function assigneeOf(text) {
  const m = /^@(?:\[\[([^\]|]+)(?:\|[^\]]*)?\]\]|([\p{L}\p{N}][\p{L}\p{N}._-]*))\s*[:,-]?\s*/u.exec(String(text || ""));
  return m ? { name: (m[1] || m[2]).trim(), rest: String(text).slice(m[0].length) } : null;
}
