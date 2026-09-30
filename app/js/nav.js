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

/* ------------------------------------------------------------ in-app back / forward */
// Mirrors the browser history for this tab so the app can show its own
// back/forward buttons with the name of the destination ("‹ Week 40").

const KEY = "panel.navstack";
let stack = [];
let index = -1;
try { const s = JSON.parse(sessionStorage.getItem(KEY) || "null"); if (s) ({ stack, index } = s); } catch (e) { /* ignore */ }
const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify({ stack, index })); } catch (e) { /* ignore */ } };

/** Call on every route change (before rendering). */
export function trackNavigation() {
  const st = history.state;
  if (st && typeof st.panelIndex === "number" && stack[st.panelIndex] && stack[st.panelIndex].hash === location.hash) {
    index = st.panelIndex; // back / forward
  } else if (stack[index] && stack[index].hash === location.hash) {
    // same entry (reload)
  } else {
    stack = stack.slice(0, index + 1);
    stack.push({ hash: location.hash, title: "" });
    if (stack.length > 100) stack.shift();
    index = stack.length - 1;
  }
  history.replaceState({ ...(history.state || {}), panelIndex: index }, "");
  save();
}

/** Call after rendering, with a short name for the current screen. */
export function setNavTitle(title) {
  if (stack[index]) { stack[index].title = title; save(); }
}

export const navBack = () => (index > 0 ? stack[index - 1] : null);
export const navForward = () => (index < stack.length - 1 ? stack[index + 1] : null);

/** Leave the current screen for `hash` without leaving a history entry behind
 *  (e.g. editor → document: going back skips the editor). */
export function goReplace(hash) {
  const prev = navBack();
  if (prev && prev.hash === hash) { history.back(); return; }
  stack[index] = { hash, title: "" };
  save();
  location.replace(hash);
}
