// Hash routes. Every screen has a URL, so back/forward and bookmarks work.

import { weekId, monthId, today } from "./util.js";

const enc = (p) => p.split("/").map(encodeURIComponent).join("/");

export const route = {
  today: () => "#/today",
  inbox: () => "#/inbox",
  week: (date) => "#/week/" + weekId(date || today()),
  calendar: (date) => "#/calendar/" + (date ? (date.length > 7 ? date : date) : monthId(today())),
  meetings: () => "#/meetings",
  notes: () => "#/notes",
  projects: () => "#/projects",
  project: (slug, tab) => "#/project/" + encodeURIComponent(slug) + (tab ? "/" + tab : ""),
  doc: (path) => "#/doc/" + enc(path),
  edit: (path) => "#/edit/" + enc(path),
};

export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = hash;
}

export function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [name, ...rest] = raw.split("/");
  const arg = rest.map(decodeURIComponent).join("/");
  return { name: name || "today", arg, rest: rest.map(decodeURIComponent) };
}
