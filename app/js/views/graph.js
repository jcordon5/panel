// The graph of your work memory: projects, people, meetings, knowledge and notes, and how they
// connect (attendees, projects, [[links]], who knows what, @person #project tasks). A small force
// layout on a canvas — drag, zoom, hover to see connections, click to open. Just for fun.

import { h } from "../util.js";
import { t } from "../i18n.js";
import { vault, attendeesOf, resolveLink, findPerson, seriesOf } from "../model.js";
import { go, route } from "../nav.js";
import { pageHeader } from "./common.js";

export const title = () => t("graph.title");
export const live = false; // don't rebuild the layout on every change of the vault

const KINDS = ["project", "person", "meeting", "knowledge", "note", "series"];
const KIND_COLOR = { project: "#6366f1", person: "#f97316", meeting: "#3b82f6", knowledge: "#22a35a", note: "#e0a100", series: "#a855f7" };
const PROJECT_HEX = { indigo: "#6366f1", blue: "#3b82f6", teal: "#14b8a6", green: "#22a35a", amber: "#e0a100", orange: "#f97316", rose: "#f43f5e", violet: "#a855f7", slate: "#64748b" };
let hidden = new Set(["note"]);
let stop = null;

function buildGraph() {
  const v = vault();
  const nodes = new Map(), links = new Map();
  const node = (id, kind, label, extra = {}) => { if (!nodes.has(id)) nodes.set(id, { id, kind, label, deg: 0, ...extra }); return nodes.get(id); };
  const link = (a, b) => {
    if (!a || !b || a === b) return;
    const k = a < b ? a + "|" + b : b + "|" + a;
    links.set(k, { a, b, w: (links.get(k)?.w || 0) + 1 });
  };
  for (const p of v.projects.values()) node("p:" + p.slug, "project", p.title, { color: PROJECT_HEX[p.color], path: p.path, slug: p.slug });
  for (const p of v.people) node("d:" + p.path, "person", p.title, { path: p.path });
  const docKind = { person: "person", meeting: "meeting", knowledge: "knowledge", note: "note", series: "series", doc: "note" };
  for (const d of v.docs.values()) {
    const kind = docKind[d.kind];
    if (!kind) continue;
    node("d:" + d.path, kind, d.title, { path: d.path });
    if (d.project && v.projects.has(d.project)) link("d:" + d.path, "p:" + d.project);
    if (d.kind === "meeting" || d.kind === "series") {
      for (const a of attendeesOf(d)) for (const p of a.people || (a.person ? [a.person] : [])) link("d:" + d.path, "d:" + p.path);
      const s = d.kind === "meeting" ? seriesOf(d) : null;
      if (s) link("d:" + d.path, "d:" + s.path);
    }
    if (d.kind === "knowledge") for (const n of [].concat(d.fm.people || [])) { const p = findPerson(n); if (p) link("d:" + d.path, "d:" + p.path); }
    for (const m of d.body.matchAll(/\[\[([^\]|#\n]+)/g)) { const target = resolveLink(m[1].trim()); if (target && v.docs.has(target)) link("d:" + d.path, "d:" + target); }
  }
  for (const tk of [...v.tasks, ...v.docTasks]) if (tk.assignee && tk.project) link("d:" + tk.assignee.path, "p:" + tk.project);
  for (const l of links.values()) { const a = nodes.get(l.a), b = nodes.get(l.b); if (a && b) { a.deg += l.w; b.deg += l.w; } }
  return { nodes: [...nodes.values()], links: [...links.values()].filter((l) => nodes.has(l.a) && nodes.has(l.b)) };
}

export function render(root) {
  stop?.();
  const g = buildGraph();
  const canvas = h("canvas", { class: "graph-canvas" });
  const tip = h("div", { class: "graph-tip", hidden: true });
  const wrap = h("div", { class: "graph-wrap" }, canvas, tip);
  const filters = h("div", { class: "graph-filters" }, KINDS.map((k) => {
    const n = g.nodes.filter((x) => x.kind === k).length;
    return h("label", { class: "graph-filter" }, h("input", { type: "checkbox", checked: !hidden.has(k), onchange: (e) => { e.target.checked ? hidden.delete(k) : hidden.add(k); restart(); } }),
      h("span", { class: "graph-dot", style: { background: KIND_COLOR[k] } }), t("graph.kind." + k), h("span", { class: "muted small" }, " " + n));
  }));
  // where most knowledge lives: projects and people by connected knowledge notes
  const byKnow = (id) => g.links.filter((l) => (l.a === id || l.b === id) && [l.a, l.b].some((x) => g.nodes.find((n) => n.id === x)?.kind === "knowledge")).length;
  const top = g.nodes.filter((n) => n.kind === "project" || n.kind === "person").map((n) => [n, byKnow(n.id), n.deg]).filter(([, k, d]) => k || d).sort((a, b) => b[1] - a[1] || b[2] - a[2]).slice(0, 6);
  const side = h("div", { class: "graph-side" },
    h("div", { class: "graph-side-title" }, t("graph.hubs")),
    top.length ? top.map(([n, k, d]) => h("a", { class: "graph-hub", href: n.kind === "project" ? route.project(n.slug) : route.doc(n.path) },
      h("span", { class: "graph-dot", style: { background: n.color || KIND_COLOR[n.kind] } }), h("span", { class: "graph-hub-name" }, n.label),
      h("span", { class: "muted small" }, k ? t("graph.knowCount", { n: k }) : t("graph.links", { n: d })))) : h("div", { class: "muted small" }, t("graph.empty")),
    h("div", { class: "graph-hint" }, t("graph.hint")));
  root.append(pageHeader({ title: t("graph.title"), subtitle: t("graph.subtitle", { nodes: g.nodes.length, links: g.links.length }) }), filters, h("div", { class: "graph-layout" }, wrap, side));

  const ctx = canvas.getContext("2d");
  let nodes = [], links = [], view = { x: 0, y: 0, k: 1 }, hover = null, drag = null, raf = 0, alpha = 1;
  function restart() {
    const keep = new Map(nodes.map((n) => [n.id, n]));
    nodes = g.nodes.filter((n) => !hidden.has(n.kind)).map((n, i) => keep.get(n.id) || { ...n, x: Math.cos(i * 2.4) * (40 + i * 2), y: Math.sin(i * 2.4) * (40 + i * 2), vx: 0, vy: 0 });
    const ids = new Map(nodes.map((n) => [n.id, n]));
    links = g.links.map((l) => ({ ...l, s: ids.get(l.a), t: ids.get(l.b) })).filter((l) => l.s && l.t);
    for (const n of nodes) n.r = (n.kind === "project" ? 11 : 6) + Math.sqrt(n.deg) * (n.kind === "project" ? 3 : 2.6);
    alpha = 1;
    for (let i = nodes.length > 400 ? 40 : 150; i > 0; i--) step(); // settle most of it before the first frame
    loop();
  }
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function size() {
    const r = wrap.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    canvas.style.width = r.width + "px"; canvas.style.height = r.height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!view.user) fit();
  }
  function step() {
    const n = nodes.length;
    for (let i = 0; i < n; i++) { // repulsion
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy || 0.01;
        if (d2 > 40000) continue; // only neighbours push: loose nodes stay close
        const d = Math.sqrt(d2), f = (140 * alpha) / d; // 1/d: keeps clusters airy
        dx /= d; dy /= d;
        a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
      }
    }
    for (const l of links) { // springs
      const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - (90 + l.s.r + l.t.r)) * 0.02 * alpha * Math.min(l.w, 3);
      l.s.vx += (dx / d) * f; l.s.vy += (dy / d) * f; l.t.vx -= (dx / d) * f; l.t.vy -= (dy / d) * f;
    }
    for (const p of nodes) { // gravity to the centre, friction
      if (p === drag?.node) { p.vx = p.vy = 0; continue; }
      p.vx -= p.x * 0.007 * alpha; p.vy -= p.y * 0.007 * alpha;
      p.vx *= 0.8; p.vy *= 0.8;
      const sp = Math.hypot(p.vx, p.vy); if (sp > 12) { p.vx *= 12 / sp; p.vy *= 12 / sp; }
      p.x += p.vx; p.y += p.vy;
    }
    alpha = Math.max(alpha * 0.975, drag ? 0.3 : 0);
  }
  function draw() {
    const w = canvas.width / (devicePixelRatio || 1), hh = canvas.height / (devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, hh);
    ctx.save();
    ctx.translate(view.x, view.y); ctx.scale(view.k, view.k);
    const near = hover ? new Set(links.filter((l) => l.s === hover || l.t === hover).flatMap((l) => [l.s, l.t])) : null;
    ctx.lineWidth = 1.2 / view.k;
    for (const l of links) {
      const on = near && (l.s === hover || l.t === hover);
      ctx.strokeStyle = on ? css("--accent") : css("--border-strong");
      ctx.globalAlpha = near ? (on ? 0.9 : 0.12) : 0.8;
      ctx.beginPath(); ctx.moveTo(l.s.x, l.s.y); ctx.lineTo(l.t.x, l.t.y); ctx.stroke();
    }
    for (const p of nodes) {
      ctx.globalAlpha = near && !near.has(p) && p !== hover ? 0.25 : 1;
      ctx.fillStyle = p.color || KIND_COLOR[p.kind];
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      if (p === hover) { ctx.lineWidth = 2 / view.k; ctx.strokeStyle = css("--text"); ctx.stroke(); }
      if (p.kind === "project" || p.r > 9 || nodes.length < 50 || (near && near.has(p))) {
        ctx.fillStyle = css("--text"); ctx.font = `${(p.kind === "project" ? 12.5 : 11) / Math.max(view.k, 0.6)}px ${css("--font")}`;
        const label = p.label.length > 28 ? p.label.slice(0, 27) + "…" : p.label, ly = p.y + p.r + 12 / Math.max(view.k, 0.6);
        ctx.textAlign = "center"; ctx.lineJoin = "round"; ctx.lineWidth = 3 / view.k; ctx.strokeStyle = css("--surface");
        ctx.strokeText(label, p.x, ly); ctx.fillText(label, p.x, ly);
      }
    }
    ctx.restore();
  }
  // keep everything in view until the user pans or zooms
  function fit() {
    const w = canvas.width / (devicePixelRatio || 1), hh = canvas.height / (devicePixelRatio || 1);
    if (!w || !nodes.length) { view.x = w / 2; view.y = hh / 2; return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of nodes) { x0 = Math.min(x0, p.x - p.r); x1 = Math.max(x1, p.x + p.r); y0 = Math.min(y0, p.y - p.r); y1 = Math.max(y1, p.y + p.r + 16); }
    const k = Math.min(1.6, (w - 170) / (x1 - x0 || 1), (hh - 60) / (y1 - y0 || 1));
    view.k = Math.max(0.2, k); view.x = w / 2 - ((x0 + x1) / 2) * view.k; view.y = hh / 2 - ((y0 + y1) / 2) * view.k;
  }
  function loop() {
    cancelAnimationFrame(raf);
    const tick = () => { if (!canvas.isConnected) return; step(); if (!view.user) fit(); draw(); if (alpha > 0.002 || drag) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
  }
  const toWorld = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left - view.x) / view.k, (e.clientY - r.top - view.y) / view.k]; };
  const pick = (e) => { const [x, y] = toWorld(e); return nodes.slice().reverse().find((p) => (p.x - x) ** 2 + (p.y - y) ** 2 <= (p.r + 3) ** 2) || null; };
  canvas.addEventListener("mousemove", (e) => {
    if (drag) {
      if (drag.node) { const [x, y] = toWorld(e); drag.node.x = x; drag.node.y = y; drag.moved = view.user = true; }
      else { view.x += e.movementX; view.y += e.movementY; drag.moved = view.user = true; draw(); }
      return;
    }
    const p = pick(e);
    if (p !== hover) { hover = p; draw(); }
    canvas.style.cursor = p ? "pointer" : "grab";
    if (p) {
      const r = wrap.getBoundingClientRect();
      tip.hidden = false;
      tip.replaceChildren(h("strong", {}, p.label), h("span", {}, t("graph.kind." + p.kind) + " · " + t("graph.links", { n: p.deg })));
      tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 220) + "px"; tip.style.top = e.clientY - r.top + 14 + "px";
    } else tip.hidden = true;
  });
  canvas.addEventListener("mousedown", (e) => { drag = { node: pick(e), moved: false }; if (drag.node) { alpha = Math.max(alpha, 0.3); loop(); } });
  window.addEventListener("mouseup", function up(e) {
    if (!canvas.isConnected) { window.removeEventListener("mouseup", up); return; }
    if (drag && !drag.moved && drag.node) { const n = drag.node; go(n.kind === "project" ? route.project(n.slug) : route.doc(n.path)); }
    drag = null;
  });
  canvas.addEventListener("mouseleave", () => { hover = null; tip.hidden = true; draw(); });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const k = Math.min(4, Math.max(0.2, view.k * Math.exp(-e.deltaY * 0.0015)));
    view.user = true;
    view.x = mx - ((mx - view.x) * k) / view.k; view.y = my - ((my - view.y) * k) / view.k; view.k = k;
    draw();
  }, { passive: false });
  const ro = new ResizeObserver(() => { size(); draw(); });
  requestAnimationFrame(() => { size(); ro.observe(wrap); restart(); });
  stop = () => { cancelAnimationFrame(raf); ro.disconnect(); };
}

export function leave() { stop?.(); stop = null; }
