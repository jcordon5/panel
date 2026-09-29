// Shared UI state that survives re-renders.

import { storage } from "./util.js";

export const state = {
  busy: 0,               // >0 while the user edits inline: re-renders are postponed
  pending: false,
  expanded: new Set(),   // task details opened in compact lists
  focusKey: null,        // element to refocus after the next render (data-focus-key)
  render: () => {},
  prefs: Object.assign({ theme: "system", weekend: true, inboxColumn: true, sidebar: true }, storage("prefs") || {}),
};

export function savePrefs() { storage("prefs", state.prefs); }

export function setBusy(on) {
  state.busy = Math.max(0, state.busy + (on ? 1 : -1));
  if (!state.busy && state.pending) { state.pending = false; state.render(); }
}

export function requestRender() {
  if (state.busy) state.pending = true;
  else state.render();
}

export function applyTheme() {
  const th = state.prefs.theme;
  if (th === "light" || th === "dark") document.documentElement.setAttribute("data-theme", th);
  else document.documentElement.removeAttribute("data-theme");
}
