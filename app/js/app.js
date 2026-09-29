// App shell: boot, sidebar, router, global shortcuts and delegated events.

import { h, $, today } from "./util.js";
import { icon } from "./icons.js";
import { t, lang, setLang } from "./i18n.js";
import { store, loadInfo, sync, onChange, startPolling, apiGet } from "./store.js";
import { vault, dayTasks, overdueTasks } from "./model.js";
import { state, requestRender, applyTheme } from "./state.js";
import { parseRoute, route, go } from "./nav.js";
import { toast, errorToast, isModalOpen, closeMenus } from "./ui.js";
import { quickAdd, dropZone, run, doUndo } from "./tasks.js";
import * as A from "./actions.js";
import { openPalette } from "./views/palette.js";
import { openSettings, checkUpdate, applyUpdate } from "./views/settings.js";
import { newMeetingDialog, newNoteDialog, newProjectDialog } from "./views/dialogs.js";

import * as today_ from "./views/today.js";
import * as inbox from "./views/inbox.js";
import * as week from "./views/week.js";
import * as calendar from "./views/calendar.js";
import * as meetings from "./views/meetings.js";
import * as notes from "./views/notes.js";
import * as projects from "./views/projects.js";
import * as project from "./views/project.js";
import * as doc from "./views/doc.js";
import * as editor from "./views/editor.js";
import * as welcome from "./views/welcome.js";
import * as connect from "./views/connect.js";
import { backend, setBackend, detectBackend } from "./backends.js";

const VIEWS = { today: today_, inbox, week, calendar, meetings, notes, projects, project, doc, edit: editor };

let current = { key: null, view: null };

/* ------------------------------------------------------------ sidebar */

function navItem(href, ic, label, count, active, extra = {}) {
  const a = h("a", { class: "nav-item" + (active ? " active" : ""), href, "aria-current": active ? "page" : null }, icon(ic, 17), h("span", { class: "nav-label" }, label),
    count ? h("span", { class: "nav-count" + (extra.alert ? " alert" : "") }, String(count)) : null);
  if (extra.drop) dropZone(a, extra.drop);
  return a;
}

function renderSidebar(r) {
  const v = vault();
  const sb = $("#sidebar");
  const openToday = dayTasks(today()).filter((x) => !x.done).length;
  const overdue = overdueTasks(today()).length;
  const inboxOpen = v.inbox.items.filter((x) => x.type === "task" && !x.done).length;
  const is = (n) => r.name === n;
  const activeProjects = [...v.projects.values()].filter((p) => p.status !== "done" && p.status !== "archived").sort((a, b) => a.title.localeCompare(b.title));
  const closedProjects = v.projects.size - activeProjects.length;
  const docPath = (r.name === "doc" || r.name === "edit") ? r.arg : "";
  const inProject = (slug) => (r.name === "project" && r.rest[0] === slug) || docPath.startsWith("projects/" + slug + "/");

  sb.replaceChildren(...[
    h("div", { class: "sb-head" },
      h("a", { class: "brand", href: route.today() }, h("span", { class: "brand-mark" }, icon("logo", 18)), h("span", { class: "brand-name" }, "Panel")),
      h("button", { class: "icon-btn sb-close", "aria-label": t("common.close"), onclick: () => document.body.classList.remove("sb-open") }, icon("x"))),
    h("button", { class: "sb-search", onclick: () => openPalette() }, icon("search", 15), h("span", {}, t("nav.search")), h("kbd", {}, navigator.platform.includes("Mac") ? "⌘K" : "Ctrl K")),
    h("button", { class: "sb-add btn btn-primary", onclick: () => quickAdd() }, icon("plus", 16), t("quick.title")),
    h("nav", { class: "sb-nav", "aria-label": "Main" },
      navItem(route.today(), "sun", t("nav.today"), openToday + overdue, is("today"), { alert: overdue > 0, drop: { kind: "day", date: today() } }),
      navItem(route.inbox(), "inbox", t("nav.inbox"), inboxOpen, is("inbox"), { drop: { kind: "inbox" } }),
      navItem(route.week(), "week", t("nav.week"), 0, is("week")),
      navItem(route.calendar(), "calendar", t("nav.calendar"), 0, is("calendar")),
      navItem(route.meetings(), "users", t("nav.meetings"), 0, is("meetings") || (docPath && v.docs.get(docPath)?.kind === "meeting" && !v.docs.get(docPath)?.project)),
      navItem(route.notes(), "note", t("nav.notes"), 0, is("notes") || docPath.startsWith("notes/"))),
    h("div", { class: "sb-section" },
      h("a", { class: "sb-section-title" + (is("projects") ? " active" : ""), href: route.projects() }, h("span", {}, t("nav.projects"))),
      h("button", { class: "icon-btn icon-btn-sm", "aria-label": t("project.new"), title: t("project.new"), onclick: () => newProjectDialog() }, icon("plus", 14))),
    h("div", { class: "sb-projects" },
      activeProjects.length ? activeProjects.map((p) => h("a", { class: "nav-item nav-project" + (inProject(p.slug) ? " active" : ""), href: route.project(p.slug) },
        h("span", { class: "dot", "data-color": p.color }), h("span", { class: "nav-label" }, p.title)))
        : h("button", { class: "sb-empty", onclick: () => newProjectDialog() }, t("project.createFirst")),
      closedProjects ? h("a", { class: "sb-more", href: route.projects() }, t("project.closedLink", { n: closedProjects })) : null),
    backend && backend.kind === "memory" ? h("div", { class: "sb-demo" }, h("strong", {}, t("demo.title")), h("span", {}, t("demo.text")),
      h("button", { class: "btn btn-sm btn-primary", type: "button", onclick: () => location.reload() }, t("demo.connect"))) : null,
    state.update && state.update.newer ? h("button", { class: "sb-update", type: "button", onclick: () => applyUpdate(state.update) },
      icon("sparkles", 15), h("span", {}, t("upd.banner", { v: state.update.latest }))) : null,
    h("div", { class: "sb-foot" },
      h("span", { class: "status-dot" + (store.online ? "" : " off"), title: store.online ? t("status.online") : t("err.offline") }),
      h("span", { class: "sb-vault", title: store.info?.vault || "" }, backend ? icon(backend.kind === "github" ? "link" : backend.kind === "folder" ? "folder" : "monitor", 12) : null, store.info?.vaultName || ""),
      h("button", { class: "icon-btn", "aria-label": t("settings.title"), title: t("settings.title"), onclick: () => openSettings() }, icon("settings", 16))),
  ].filter(Boolean));
}

/* ------------------------------------------------------------ render */

function render() {
  const r = parseRoute();
  const view = VIEWS[r.name] || today_;
  const key = location.hash;
  const root = $("#view");
  const sameRoute = current.key === key;
  if (sameRoute && current.view?.live === false) { renderSidebar(r); return; }
  const scroll = sameRoute ? root.scrollTop : 0;
  const scrollers = sameRoute ? [...root.querySelectorAll("[data-scroll-key]")].map((el) => [el.dataset.scrollKey, el.scrollLeft, el.scrollTop]) : [];
  const focus = state.focusKey || (document.activeElement?.dataset?.focusKey ?? null);
  state.focusKey = null;
  if (!sameRoute) current.view?.leave?.();
  current = { key, view };
  renderSidebar(r);
  try {
    const page = h("div", { class: "page page-" + r.name });
    view.render(page, r);
    root.replaceChildren(page);
  } catch (e) {
    console.error(e);
    root.replaceChildren(h("div", { class: "page" }, h("div", { class: "empty" }, h("div", { class: "empty-title" }, t("err.render")), h("pre", { class: "err-pre" }, String(e && e.stack || e)))));
  }
  root.scrollTop = scroll;
  for (const [k, l, tp] of scrollers) { const el = root.querySelector(`[data-scroll-key="${k}"]`); if (el) { el.scrollLeft = l; el.scrollTop = tp; } }
  if (focus) {
    const el = root.querySelector(`[data-focus-key="${CSS.escape(focus)}"]`);
    if (el) el.focus({ preventScroll: true });
  }
  document.title = (view.title?.(r) ? view.title(r) + " · " : "") + "Panel";
  document.body.classList.remove("sb-open");
}
state.render = render;

/* ------------------------------------------------------------ events */

function bindGlobal() {
  window.addEventListener("hashchange", () => { closeMenus(); render(); $("#view").scrollTop = 0; });
  onChange(() => requestRender());

  document.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (a && a.classList.contains("wikilink")) {
      e.preventDefault();
      const path = a.dataset.link;
      if (path) { if (/\.md$/i.test(path)) go(route.doc(path)); else openAsset(path); }
      else A.createNote({ title: a.dataset.target.split("/").pop() }).then((p) => go(route.edit(p))).catch(errorToast);
      return;
    }
    if (a && a.dataset.asset) { e.preventDefault(); openAsset(a.dataset.asset); return; }
    if (a && a.classList.contains("tag")) { e.preventDefault(); openPalette("#" + a.dataset.tag); return; }
    const copy = e.target.closest("[data-action=copy-code]");
    if (copy) {
      const code = copy.parentElement.querySelector("code")?.textContent || "";
      navigator.clipboard?.writeText(code).then(() => toast(t("common.copied")), () => {});
    }
  });
  document.addEventListener("change", (e) => {
    const cb = e.target;
    if (cb.classList?.contains("md-task") && cb.dataset.path) {
      cb.closest("li")?.classList.toggle("done", cb.checked);
      run(A.toggleLineAt(cb.dataset.path, +cb.dataset.line, cb.checked));
    }
  });

  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    const typing = e.target.closest?.("input, textarea, select, [contenteditable=true]");
    if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
    if (typing || isModalOpen() || e.altKey) return;
    if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); doUndo(); return; }
    if (mod) return;
    const k = e.key;
    const actions = {
      n: () => quickAdd(), m: () => newMeetingDialog(), N: () => newNoteDialog(), "/": () => openPalette(),
      t: () => go(route.today()), i: () => go(route.inbox()), w: () => go(route.week()), c: () => go(route.calendar()),
      r: () => go(route.meetings()), b: () => go(route.notes()), p: () => go(route.projects()),
      "?": () => openSettings("shortcuts"),
    };
    if (actions[k] && !current.view?.keys?.[k]) { e.preventDefault(); actions[k](); return; }
    current.view?.keys?.[k]?.(e);
  });

  $("#menu-btn").addEventListener("click", () => document.body.classList.toggle("sb-open"));
  $("#sb-backdrop").addEventListener("click", () => document.body.classList.remove("sb-open"));
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);
}

/* ------------------------------------------------------------ boot */

async function boot() {
  applyTheme();
  setLang(lang());
  bindGlobal();
  const found = await detectBackend();
  if (!found.backend) {
    // web version without a vault yet: choose where it lives
    document.body.classList.remove("booting");
    connect.render($("#view"), start);
    return;
  }
  setBackend(found.backend);
  if (found.needsPermission) {
    document.body.classList.remove("booting");
    connect.renderReconnect($("#view"), found.backend, start);
    return;
  }
  await start();
}

async function start() {
  document.body.classList.remove("bare");
  try {
    await loadInfo();
  } catch (e) {
    document.body.classList.remove("booting");
    const server = backend && backend.kind === "server";
    $("#view").replaceChildren(h("div", { class: "page" }, h("div", { class: "empty" },
      h("div", { class: "empty-icon" }, icon("alert", 22)),
      h("div", { class: "empty-title" }, server ? t("err.noServer") : t("err.backend")),
      h("div", { class: "empty-text" }, server ? t("err.noServerHint") : e.message),
      server ? null : h("button", { class: "btn", type: "button", onclick: async () => { await backend.forget?.(); location.reload(); } }, t("storage.disconnect")))));
    return;
  }
  document.body.classList.remove("booting");
  document.body.dataset.backend = backend.kind;
  if (store.info.empty) {
    renderSidebar(parseRoute());
    welcome.render($("#view"), async () => { await sync(); startPolling(); render(); });
    return;
  }
  try { await sync(); } catch (e) { errorToast(e); }
  startPolling();
  render();
  if (backend.features.updates) lookForUpdates();
}

/** Open a vault file that is not Markdown (image, PDF...) in a new tab. */
async function openAsset(path) {
  const win = window.open("", "_blank");
  const url = await backend.assetBlobUrl(path);
  if (win && url) win.location = url; else if (win) win.close();
}

/** Web backends: fill <img data-asset> with blob URLs once rendered. */
function hydrateAssets(root) {
  root.querySelectorAll("img[data-asset]").forEach(async (img) => {
    const path = img.dataset.asset;
    img.removeAttribute("data-asset");
    const url = await backend.assetBlobUrl(path).catch(() => null);
    if (url) img.src = url;
  });
}
new MutationObserver(() => { if (backend && backend.kind !== "server") hydrateAssets(document.body); })
  .observe(document.documentElement, { childList: true, subtree: true });

/** Once per start (the server caches GitHub's answer for an hour). */
async function lookForUpdates() {
  try {
    const cfg = await apiGet("/api/settings");
    if (cfg.checkUpdates === false) return;
    const u = await checkUpdate();
    if (u.newer) {
      state.update = u;
      requestRender();
      toast(t("upd.available", { v: u.latest }), { action: { label: t("upd.installShort"), fn: () => applyUpdate(u) }, duration: 10000 });
    }
  } catch (e) { /* offline or GitHub unreachable: ignore */ }
}

window.addEventListener("unhandledrejection", (e) => console.error(e.reason));
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
boot();

