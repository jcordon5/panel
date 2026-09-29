// Read view of any Markdown file.

import { h } from "../util.js";
import { icon } from "../icons.js";
import { t, fmtDate, cap, relTime } from "../i18n.js";
import { vault, backlinks, P } from "../model.js";
import { renderMarkdown } from "../markdown.js";
import { run } from "../tasks.js";
import * as A from "../actions.js";
import { pageHeader, btn, iconBtn, projectChip, bodyWithoutTitle } from "./common.js";
import { propertiesDialog } from "./dialogs.js";
import { go, route } from "../nav.js";
import { menu, confirmDialog, emptyState, toast } from "../ui.js";
import { store } from "../store.js";

export const title = (r) => vault().docs.get(r.arg)?.title || "";
export const keys = { e: () => go(route.edit(currentPath)) };

let currentPath = null;
const fmtPath = (dir) => (dir || "").split("/").filter(Boolean).join(" / ");

export function crumbs(doc) {
  const v = vault();
  const out = [];
  const pm = /^projects\/([^/]+)\//.exec(doc.path);
  if (pm) {
    out.push(h("a", { href: route.projects() }, t("nav.projects")));
    out.push(h("a", { href: route.project(pm[1]) }, v.projects.get(pm[1])?.title || pm[1]));
    if (doc.kind === "meeting") out.push(h("a", { href: route.project(pm[1], "meetings") }, t("nav.meetings")));
  } else if (doc.kind === "meeting") out.push(h("a", { href: route.meetings() }, t("nav.meetings")));
  else if (doc.kind === "note") out.push(h("a", { href: route.notes() }, t("nav.notes")));
  else if (doc.kind === "week") out.push(h("a", { href: route.week(doc.fm.start || undefined) }, t("nav.week")));
  else if (doc.kind === "inbox") out.push(h("a", { href: route.inbox() }, t("nav.inbox")));
  else out.push(h("span", {}, fmtPath(doc.dir) || t("doc.vault")));
  const wrap = h("nav", { class: "crumbs", "aria-label": "Breadcrumb" });
  out.forEach((c, i) => { if (i) wrap.append(h("span", { class: "crumb-sep" }, "/")); wrap.append(c); });
  return wrap;
}

function siblings(doc) {
  if (doc.kind !== "meeting") return null;
  const list = vault().meetings.filter((m) => (m.project || null) === (doc.project || null));
  const i = list.findIndex((m) => m.path === doc.path);
  if (i < 0) return null;
  const newer = list[i - 1], older = list[i + 1];
  if (!newer && !older) return null;
  return h("div", { class: "doc-siblings" },
    older ? h("a", { class: "sibling prev", href: route.doc(older.path) }, icon("chevron-left", 15), h("span", {}, h("small", {}, t("doc.previous")), older.title)) : h("span"),
    newer ? h("a", { class: "sibling next", href: route.doc(newer.path) }, h("span", {}, h("small", {}, t("doc.next")), newer.title), icon("chevron-right", 15)) : h("span"));
}

export function render(root, r) {
  const path = r.arg;
  currentPath = path;
  const v = vault();
  const doc = v.docs.get(path);
  if (!doc) {
    root.append(emptyState("file", t("doc.notFound"), path, h("a", { class: "btn", href: route.today() }, t("nav.today"))));
    return;
  }

  const chips = [];
  if (doc.date) chips.push(h("span", { class: "chip" }, icon("calendar", 12), cap(fmtDate(doc.date, "long")) + (doc.time ? " · " + doc.time : "")));
  if (doc.project && doc.kind !== "project") chips.push(projectChip(doc.project));
  if (doc.attendees.length) chips.push(h("span", { class: "chip" }, icon("users", 12), doc.attendees.join(", ")));
  for (const tg of doc.tags) chips.push(h("a", { class: "chip tag", href: "#", "data-tag": tg }, "#" + tg));
  chips.push(h("span", { class: "chip chip-ghost", title: path }, icon("clock", 12), t("doc.updated", { when: relTime(doc.mtime) })));

  const more = iconBtn("more", t("common.more"), () => menu(more, [
    { label: t("props.title"), icon: "settings", onClick: () => propertiesDialog(doc, (np) => np !== path && go(route.doc(np))) },
    doc.kind === "note" ? { label: doc.pinned ? t("note.unpin") : t("note.pin"), icon: "pin", onClick: () => run(A.setProps(path, { pinned: doc.pinned ? null : true })) } : null,
    { label: t("doc.copyPath"), icon: "copy", onClick: () => navigator.clipboard?.writeText((store.info?.vault || "") + "/" + path).then(() => toast(t("common.copied"))) },
    { label: t("doc.copyLink"), icon: "link", onClick: () => navigator.clipboard?.writeText("[[" + path.replace(/\.md$/, "") + "]]").then(() => toast(t("common.copied"))) },
    "-",
    { label: t("common.delete"), icon: "trash", danger: true, disabled: path === P.inbox, onClick: async () => {
      if (!(await confirmDialog(t("doc.deleteConfirm", { name: doc.title })))) return;
      await run(A.deleteDoc(path), t("doc.deleted"));
      history.length > 1 ? history.back() : go(route.today());
    } },
  ], { align: "end" }));

  root.append(h("div", { class: "doc-top" }, crumbs(doc), h("div", { class: "page-actions" },
    btn(t("common.edit"), "pencil", () => go(route.edit(path)), "btn-primary"), more)));

  const { body, offset } = bodyWithoutTitle(doc);
  const article = h("article", { class: "doc" },
    h("h1", { class: "doc-title" }, doc.title),
    h("div", { class: "doc-meta" }, chips),
    body.trim() ? h("div", { class: "md", html: renderMarkdown(body, { path, lineOffset: offset }) })
      : h("button", { class: "doc-empty", type: "button", onclick: () => go(route.edit(path)) }, icon("pencil", 16), t("doc.emptyBody")));
  article.addEventListener("dblclick", (e) => {
    if (e.target.closest("a, input, button, summary") || window.getSelection()?.toString()) return;
    go(route.edit(path));
  });
  root.append(article);

  const sib = siblings(doc);
  if (sib) root.append(sib);

  const back = backlinks(path);
  if (back.length) {
    root.append(h("section", { class: "backlinks" },
      h("h2", { class: "section-title" }, icon("link", 14), t("doc.backlinks"), h("span", { class: "section-count" }, String(back.length))),
      h("div", { class: "mini-list" }, back.map((d) => h("a", { class: "mini-item", href: route.doc(d.path) }, icon(d.kind === "meeting" ? "users" : "file", 14), h("span", { class: "mini-title" }, d.title))))));
  }
}
