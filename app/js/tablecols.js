// Resizable columns for Markdown tables: drag the edge of a header cell. Widths are remembered on this
// computer per table, recognised by its header (the same table in reading mode and in the editor).
// Double-click the edge to go back to automatic widths.

import { storage } from "./util.js";

const MIN = 48; // px
const LAST_MIN = 160; // px the last column keeps when you resize another one

/** A short id for a table from its header cells. */
export function tableKey(headers) {
  const s = headers.map((x) => String(x).trim().toLowerCase()).join("\u0001");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return headers.length + "-" + h.toString(36);
}

const all = () => storage("tableCols") || {};

/** Saved widths (px) for this table, if they match its number of columns. */
export function savedWidths(key, n) {
  const w = all()[key];
  return Array.isArray(w) && w.length === n && w.every((x) => typeof x === "number" && x > 0) ? w : null;
}

function save(key, widths) {
  const a = all();
  if (widths) a[key] = widths.map((x) => Math.round(x)); else delete a[key];
  storage("tableCols", a);
}

/** `<colgroup>` + table attributes for the renderer. */
export function tableAttrs(key, n) {
  const w = savedWidths(key, n);
  if (!w) return { attrs: ` data-cols="${key}"`, colgroup: "" };
  const sum = w.reduce((a, b) => a + b, 0);
  return {
    attrs: ` data-cols="${key}" class="cols-fixed" style="min-width:${sum}px"`,
    colgroup: `<colgroup>${w.map((x, i) => (i < w.length - 1 ? `<col style="width:${x}px">` : "<col>")).join("")}</colgroup>`,
  };
}

// every column but the last gets its width; the last one takes what's left of the page (at least its own width),
// and the table scrolls sideways when the columns don't fit
function apply(table, widths) {
  let cg = table.querySelector(":scope > colgroup");
  if (!cg) { cg = document.createElement("colgroup"); table.prepend(cg); }
  cg.replaceChildren(...widths.map((x, i) => { const c = document.createElement("col"); if (i < widths.length - 1) c.style.width = x + "px"; return c; }));
  table.style.minWidth = widths.reduce((a, b) => a + b, 0) + "px";
  table.classList.add("cols-fixed");
}

function reset(table) {
  table.querySelector(":scope > colgroup")?.remove();
  table.style.minWidth = "";
  table.classList.remove("cols-fixed");
}

if (typeof document !== "undefined") {
  // the editor must not take the click (it would open the table's source)
  const swallow = (e) => { if (e.target.closest?.(".col-resize")) { e.preventDefault(); e.stopPropagation(); } };
  document.addEventListener("mousedown", swallow, true);
  document.addEventListener("click", swallow, true);

  document.addEventListener("pointerdown", (e) => {
    const grip = e.target.closest?.(".col-resize");
    if (!grip || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const th = grip.closest("th");
    const table = th.closest("table");
    const ths = [...th.parentElement.children];
    const i = ths.indexOf(th);
    const start = ths.map((c) => c.getBoundingClientRect().width);
    const x0 = e.clientX;
    let widths = start.slice();
    let moved = false;
    grip.setPointerCapture?.(e.pointerId);
    document.body.classList.add("is-col-resizing");
    const last = start.length - 1;
    const move = (ev) => {
      moved = true;
      widths = start.slice();
      widths[i] = Math.max(MIN, start[i] + ev.clientX - x0);
      // the last column fills the rest: widening another one takes room from it first
      if (i !== last) widths[last] = Math.min(start[last], LAST_MIN);
      apply(table, widths);
    };
    const up = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
      document.body.classList.remove("is-col-resizing");
      if (moved && table.dataset.cols) save(table.dataset.cols, widths);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
  }, true);

  document.addEventListener("dblclick", (e) => {
    const grip = e.target.closest?.(".col-resize");
    if (!grip) return;
    e.preventDefault();
    e.stopPropagation();
    const table = grip.closest("table");
    reset(table);
    if (table.dataset.cols) save(table.dataset.cols, null);
  }, true);
}
