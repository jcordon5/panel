// A project: overview (README), meetings, tasks and documents.

import { h, today } from "../util.js";
import { icon } from "../icons.js";
import { t, relTime } from "../i18n.js";
import { vault, projectTasks, P } from "../model.js";
import { renderMarkdown } from "../markdown.js";
import { taskList, run } from "../tasks.js";
import * as A from "../actions.js";
import { pageHeader, btn, iconBtn, section, meetingRow, docRow, bodyWithoutTitle } from "./common.js";
import { newMeetingDialog, newNoteDialog, propertiesDialog } from "./dialogs.js";
import { projectStats } from "./projects.js";
import { go, route } from "../nav.js";
import { menu, confirmDialog, emptyState } from "../ui.js";

export const title = (r) => vault().projects.get(r.rest[0])?.title || t("nav.projects");

export function render(root, r) {
  const slug = r.rest[0];
  const tab = r.rest[1] || "overview";
  const v = vault();
  const p = v.projects.get(slug);
  if (!p) {
    root.append(emptyState("folder", t("project.notFound"), slug));
    return;
  }
  const stats = projectStats(p);
  const tasks = projectTasks(slug);
  const openTasks = tasks.filter((x) => !x.done);
  const docs = [...v.docs.values()].filter((d) => d.project === slug && d.kind !== "meeting" && d.kind !== "project" && d.path.startsWith(`${P.projects}/${slug}/`))
    .sort((a, b) => b.mtime - a.mtime);

  const more = iconBtn("more", t("common.more"), () => menu(more, [
    { label: t("props.title"), icon: "settings", disabled: !p.readme, onClick: () => propertiesDialog(p.readme) },
    { label: t("common.openFile"), icon: "file", onClick: () => go(p.readme ? route.doc(p.readme.path) : route.edit(p.path)) },
    ...["active", "paused", "done"].filter((s) => s !== p.status && p.readme).map((s) => ({
      label: t("project.markAs", { status: t("project.status." + s) }), icon: s === "done" ? "check" : s === "paused" ? "clock" : "sparkles",
      onClick: () => run(A.setProps(p.readme.path, { status: s }), t("props.saved")),
    })),
    "-",
    { label: t("project.delete"), icon: "trash", danger: true, onClick: async () => {
      if (!(await confirmDialog(t("project.deleteConfirm", { name: p.title })))) return;
      await run(A.deleteProject(slug), t("project.deleted"));
      go(route.projects());
    } },
  ], { align: "end" }));

  root.append(pageHeader({
    eyebrow: h("a", { href: route.projects(), class: "crumb" }, t("nav.projects")),
    left: h("span", { class: "project-icon lg", "data-color": p.color }, icon("folder", 20)),
    title: p.title,
    subtitle: p.status !== "active" ? h("span", { class: "pill" }, t("project.status." + p.status)) : (!p.readme && p.description ? p.description : null),
    actions: [btn(t("meeting.new"), "users", () => newMeetingDialog({ project: slug })), btn(t("note.newDoc"), "file", () => newNoteDialog({ project: slug })), more],
  }));

  const tabs = [
    ["overview", t("project.tab.overview"), null],
    ["meetings", t("nav.meetings"), stats.meetings.length],
    ["tasks", t("common.tasks"), openTasks.length],
    ["docs", t("project.tab.docs"), docs.length],
  ];
  root.append(h("nav", { class: "tabs", role: "tablist" }, tabs.map(([id, label, n]) =>
    h("a", { class: "tab" + (tab === id ? " active" : ""), role: "tab", "aria-selected": String(tab === id), href: route.project(slug, id === "overview" ? "" : id) }, label, n ? h("span", { class: "tab-count" }, String(n)) : null))));

  if (tab === "meetings") {
    root.append(stats.meetings.length ? h("div", { class: "rows" }, stats.meetings.map((m) => meetingRow(m, { hideProject: true })))
      : emptyState("users", t("project.noMeetings"), null, btn(t("meeting.new"), "plus", () => newMeetingDialog({ project: slug }), "btn-primary")));
    return;
  }
  if (tab === "tasks") {
    const planned = tasks.filter((x) => x.kind === "day" || x.kind === "inbox").sort((a, b) => (a.done - b.done) || (a.date || "9").localeCompare(b.date || "9"));
    const inDocs = tasks.filter((x) => x.kind === "doc");
    root.append(h("p", { class: "muted small" }, t("project.tasksHint", { tag: "#" + slug })));
    root.append(section(t("project.planned"), taskList(planned.filter((x) => !x.done), { showDate: true, showSource: true, empty: t("project.noPlanned") }), { icon: "calendar" }));
    root.append(section(t("project.fromDocs"), taskList(inDocs.filter((x) => !x.done), { showSource: true, empty: t("project.noDocTasks") }), { icon: "file" }));
    const doneAll = tasks.filter((x) => x.done);
    if (doneAll.length) root.append(section(t("project.completed"), taskList(doneAll.slice(0, 30), { showDate: true, showSource: true, compact: true }), { icon: "check", count: doneAll.length }));
    root.append(h("div", { class: "narrow-left" }, btn(t("project.addTask"), "plus", () => import("../tasks.js").then((m) => m.quickAdd({ project: slug })), "btn-ghost")));
    return;
  }
  if (tab === "docs") {
    root.append(h("div", { class: "section-actions-row" }, btn(t("note.newDoc"), "plus", () => newNoteDialog({ project: slug }), "btn-primary")));
    root.append(docs.length ? h("div", { class: "rows" }, docs.map(docRow)) : emptyState("file", t("project.noDocs"), t("project.noDocsText")));
    return;
  }

  // overview
  const readme = p.readme;
  const { body, offset } = readme ? bodyWithoutTitle(readme) : { body: "", offset: 0 };
  const main = h("div", { class: "project-main" });
  const aside = h("aside", { class: "project-aside" });
  main.append(h("div", { class: "doc-card" },
    h("div", { class: "doc-card-head" }, h("span", { class: "muted small" }, readme ? t("doc.updated", { when: relTime(readme.mtime) }) : ""),
      btn(t("common.edit"), "pencil", () => go(route.edit(p.path)), "btn-sm btn-ghost")),
    body.trim() ? h("div", { class: "md", html: renderMarkdown(body, { path: p.path, lineOffset: offset }) })
      : h("div", { class: "muted pad" }, t("project.emptyReadme"))));

  const upcoming = stats.meetings.filter((m) => m.date >= today()).reverse().slice(0, 3);
  const recent = stats.meetings.filter((m) => !m.date || m.date < today()).slice(0, 4);
  if (upcoming.length) aside.append(section(t("meetings.upcoming"), h("div", { class: "rows" }, upcoming.map((m) => meetingRow(m, { hideProject: true }))), { icon: "calendar" }));
  aside.append(section(t("project.recentMeetings"), recent.length ? h("div", { class: "rows" }, recent.map((m) => meetingRow(m, { hideProject: true })))
    : h("div", { class: "muted small" }, t("project.noMeetings")), {
    icon: "users", actions: [btn("", "plus", () => newMeetingDialog({ project: slug }), "btn-sm btn-ghost")],
  }));
  if (openTasks.length) {
    aside.append(section(t("project.openTasks"), taskList(openTasks.slice(0, 8), { compact: true, showDate: true, showSource: true }), {
      icon: "check", count: openTasks.length,
      actions: [h("a", { class: "btn btn-sm btn-ghost", href: route.project(slug, "tasks") }, t("common.seeAll"))],
    }));
  }
  root.append(h("div", { class: "project-grid" }, main, aside));
}
