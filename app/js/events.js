// Events from external calendars (Outlook, .ics). Fetched lazily per date range,
// cached for a few minutes; views call wantEvents() and re-render when they arrive.

import { apiGet } from "./store.js";
import { vault } from "./model.js";
import { fold } from "./util.js";
import { requestRender } from "./state.js";

const TTL = 5 * 60 * 1000;
const ranges = new Map(); // "from|to" -> { t, events, errors, loading }
let configured = null;     // unknown until the first answer
export let lastErrors = [];

export function wantEvents(from, to, force = false) {
  if (configured === false && !force) return;
  const key = from + "|" + to;
  const r = ranges.get(key);
  if (r && (r.loading || (!force && Date.now() - r.t < TTL))) return;
  ranges.set(key, { ...(r || { events: [] }), loading: true, t: r ? r.t : 0 });
  apiGet(`/api/calendar?from=${from}&to=${to}${force ? "&refresh=1" : ""}`)
    .then((res) => {
      configured = res.configured;
      lastErrors = res.errors || [];
      const changed = JSON.stringify(res.events) !== JSON.stringify(r?.events || []);
      ranges.set(key, { t: Date.now(), events: res.events || [], loading: false });
      if (changed) requestRender();
    })
    .catch(() => ranges.set(key, { t: Date.now(), events: r?.events || [], loading: false }));
}

export function resetEvents() { ranges.clear(); configured = null; }

function linked() {
  const ids = new Set(), keys = new Set();
  for (const m of vault().meetings) {
    if (m.fm.calendar_id) ids.add(String(m.fm.calendar_id));
    if (m.date) keys.add(m.date + "|" + fold(m.title));
  }
  return { ids, keys };
}

/** Calendar events of a date that have no meeting note yet. */
export function eventsOn(date) {
  const seen = new Set();
  const out = [];
  const { ids, keys } = linked();
  for (const r of ranges.values()) {
    for (const e of r.events) {
      if (e.date !== date || seen.has(e.uid)) continue;
      seen.add(e.uid);
      if (ids.has(e.uid) || keys.has(e.date + "|" + fold(e.title))) continue;
      out.push(e);
    }
  }
  return out.sort((a, b) => (a.allDay ? "" : a.time).localeCompare(b.allDay ? "" : b.time));
}
