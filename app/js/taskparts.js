// A task's text in parts — time, who it is for, project, tags, the rest — and back.
// The task dialog edits the parts; the file keeps the plain syntax people can also type:
//   "09:30 @Ana Send the quote #project-alpha #urgent"

const TIME = /^(\d{1,2}[:.]\d{2})(?:\s*[-–]\s*(\d{1,2}(?:[:.]\d{2})?))?\s+/;
const WHO = /^@(?:\[\[([^\]|]+)(?:\|[^\]]*)?\]\]|([\p{L}\p{N}][\p{L}\p{N}._-]*))\s*[:,-]?\s*/u;
const TAG = /(^|\s)#([\p{L}\p{N}_\-/]*[\p{L}_][\p{L}\p{N}_\-/]*)/gu;

/** isProject(tag) tells project slugs apart from other tags. */
export function decompose(text, isProject = () => false) {
  let rest = String(text || "").trim();
  let time = "", timeEnd = "", who = "";
  let m = TIME.exec(rest);
  if (m) { time = m[1].replace(".", ":"); timeEnd = m[2] || ""; rest = rest.slice(m[0].length); }
  m = WHO.exec(rest);
  if (m) { who = (m[1] || m[2]).trim(); rest = rest.slice(m[0].length); }
  let project = "";
  const tags = [];
  rest = rest.replace(TAG, (all, pre, tag) => {
    if (!project && isProject(tag)) project = tag;
    else tags.push(tag);
    return pre;
  }).replace(/\s{2,}/g, " ").trim();
  return { time, timeEnd, who, project, tags, text: rest };
}

/** whoToken(name) -> how to write the person ("@Ana" or "@[[Ana García]]"). */
export function compose({ time = "", timeEnd = "", who = "", project = "", tags = [], text = "" }, whoToken) {
  const token = who ? (whoToken ? whoToken(who) : /\s/.test(who) ? `@[[${who}]]` : `@${who}`) : "";
  const tagList = [project, ...tags].filter(Boolean).map((x) => "#" + String(x).replace(/^#/, "").trim().replace(/\s+/g, "-"));
  return [time ? time + (timeEnd ? "-" + timeEnd : "") : "", token, text.trim(), ...tagList].filter(Boolean).join(" ");
}
