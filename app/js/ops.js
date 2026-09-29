// Pure text operations on Markdown files (no I/O). Everything works on arrays
// of lines and relocates things by content, never trusting stale indexes.

import { parseDoc, setFm } from "./frontmatter.js";
import { TASK_RE, blockEnd, indentOf, containerItems, weekSections, weekStartOf, kindOf } from "./model.js";
import { basename, today, addDays, weekId, isoWeek } from "./util.js";
import { fmtDate, t, weekdayName, lang } from "./i18n.js";

export const split = (text) => (text || "").split("\n");
export const join = (lines) => {
  const s = lines.join("\n");
  return s.endsWith("\n") ? s : s + "\n";
};

/** Locate a task line even if the file moved around since render. */
export function findTask(lines, line, raw) {
  if (lines[line] === raw) return line;
  let best = -1, dist = Infinity;
  lines.forEach((l, i) => { if (l === raw && Math.abs(i - line) < dist) { best = i; dist = Math.abs(i - line); } });
  return best;
}

export function toggleLine(line, done) {
  return line.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/, (_, pre, c) => pre + "[" + ((done ?? c === " ") ? "x" : " ") + "]");
}

/** Remove the block at i; returns { lines, block } with the block dedented to column 0. */
export function extractBlock(lines, i) {
  const end = blockEnd(lines, i);
  let block = lines.slice(i, end);
  while (block.length > 1 && !block[block.length - 1].trim()) block.pop();
  const base = indentOf(block[0]);
  block = block.map((l) => dedent(l, base));
  const out = [...lines.slice(0, i), ...lines.slice(end)];
  return { lines: out, block };
}

function dedent(line, n) {
  let i = 0, col = 0;
  while (i < line.length && col < n && (line[i] === " " || line[i] === "\t")) { col += line[i] === "\t" ? 4 : 1; i++; }
  return line.slice(i);
}

/** Build a task block from editable text: first line = title, rest = details. */
export function buildBlock(text, done = false) {
  const parts = text.replace(/\r/g, "").split("\n");
  const title = parts[0].trim().replace(/^[-*+]\s+(\[[ xX]\]\s+)?/, "");
  const rest = parts.slice(1);
  while (rest.length && !rest[rest.length - 1].trim()) rest.pop();
  const nonEmpty = rest.filter((l) => l.trim());
  const min = nonEmpty.length ? Math.min(...nonEmpty.map(indentOf)) : 0;
  return [`- [${done ? "x" : " "}] ${title}`, ...rest.map((l) => (l.trim() ? "  " + dedent(l, min).replace(/\s+$/, "") : ""))];
}

/** Editable text for a task block (title + dedented details). */
export function blockText(task) {
  const nonEmpty = task.details.filter((l) => l.trim());
  const min = nonEmpty.length ? Math.min(...nonEmpty.map(indentOf)) : 0;
  const det = task.details.map((l) => dedent(l, min));
  while (det.length && !det[det.length - 1].trim()) det.pop();
  return [task.text, ...det].join("\n");
}

export function touch(text) {
  const d = parseDoc(text);
  return d.hasFm ? setFm(text, { updated: today() }) : text;
}

/* ------------------------------------------------------------ containers */

/** { start, end, dividerMin } of a target container in these lines, or null. */
export function locate(lines, target, path) {
  const doc = parseDoc(lines.join("\n"));
  if (target.kind === "inbox") return { start: doc.bodyLine, end: lines.length, dividerMin: 2 };
  if (target.kind === "day") {
    const start = weekStartOf({ fm: doc.fm, name: basename(path) });
    const sec = weekSections(lines, doc.bodyLine, start).find((s) => s.date === target.date);
    return sec ? { start: sec.start, end: sec.end, dividerMin: 3, head: sec.head } : null;
  }
  return null;
}

/** Insert a (column-0) block into a container at task index `index` (Infinity = end). */
export function insertInto(lines, range, block, index = Infinity) {
  const tasks = containerItems(lines, range.start, range.end, {}, range.dividerMin).filter((i) => i.type === "task" || i.type === "ref");
  if (index < tasks.length) {
    const at = tasks[Math.max(0, index)].line;
    const ind = " ".repeat(tasks[Math.max(0, index)].indent);
    return [...lines.slice(0, at), ...block.map((l) => (l ? ind + l : l)), ...lines.slice(at)];
  }
  let last = -1;
  for (let i = range.end - 1; i >= range.start; i--) if (lines[i].trim()) { last = i; break; }
  if (last >= 0 && TASK_RE.test(lines[last]) === false && /^#{1,6}\s/.test(lines[last])) {
    // container ends with a heading (a divider): put tasks right below it
    return [...lines.slice(0, last + 1), ...block, ...(range.end < lines.length && last + 1 === range.end ? [""] : []), ...lines.slice(last + 1)];
  }
  if (last < 0) {
    // empty container: "## Head" + blank + block + blank
    const after = range.end < lines.length ? [""] : [];
    return [...lines.slice(0, range.start), "", ...block, ...after, ...lines.slice(range.end)];
  }
  const tail = lines.slice(last + 1);
  const needGap = tail.length && tail[0].trim() !== "";
  return [...lines.slice(0, last + 1), ...block, ...(needGap ? [""] : []), ...tail];
}

/* ------------------------------------------------------------ templates */

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

export function weekTitle(start) {
  const end = addDays(start, 6);
  return `${t("week.word")} ${isoWeek(start).week} · ${fmtDate(start, "short")} – ${fmtDate(end, "short")} ${end.slice(0, 4)}`;
}

export function dayHeading(date) {
  return `## ${cap(weekdayName(date))} · ${date}`;
}

export function weekTemplate(start) {
  const title = weekTitle(start);
  const lines = ["---", "type: week", `title: ${title}`, `week: ${weekId(start)}`, `start: ${start}`, `created: ${today()}`, `updated: ${today()}`, "---", "", `# ${title}`, ""];
  for (let i = 0; i < 7; i++) lines.push(dayHeading(addDays(start, i)), "");
  return lines.join("\n");
}

export function inboxTemplate() {
  return ["---", "type: inbox", `title: ${t("nav.inbox")}`, `created: ${today()}`, `updated: ${today()}`, "---", "", `# ${t("nav.inbox")}`, "", ""].join("\n");
}

/** Make sure a day section exists in a week file; returns new lines. */
export function ensureDay(lines, date, path) {
  if (locate(lines, { kind: "day", date }, path)) return lines;
  const doc = parseDoc(lines.join("\n"));
  const start = weekStartOf({ fm: doc.fm, name: basename(path) });
  const secs = weekSections(lines, doc.bodyLine, start);
  const next = secs.find((s) => s.date > date);
  const at = next ? next.head : lines.length;
  const insert = [dayHeading(date), ""];
  const out = [...lines.slice(0, at)];
  if (out.length && out[out.length - 1].trim()) out.push("");
  return [...out, ...insert, ...lines.slice(at)];
}

export { kindOf, lang };
