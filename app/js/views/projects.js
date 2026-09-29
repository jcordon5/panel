// Projects overview.

import { h } from "../util.js";
import { icon } from "../icons.js";
import { t, relTime, relDay } from "../i18n.js";
import { vault, projectTasks } from "../model.js";
import { pageHeader, btn, section } from "./common.js";
import { newProjectDialog } from "./dialogs.js";
import { route } from "../nav.js";
import { emptyState } from "../ui.js";

export const title = () => t("nav.projects");

export function projectStats(p) {
  const v = vault();
  const docs = [...v.docs.values()].filter((d) => d.project === p.slug);
  const meetings = v.meetings.filter((m) => m.project === p.slug);
  const tasks = projectTasks(p.slug);
  const last = Math.max(0, ...docs.map((d) => d.mtime));
  return { meetings, open: tasks.filter((x) => !x.done).length, last, lastMeeting: meetings.find((m) => m.date) };
}

function card(p) {
  const s = projectStats(p);
  return h("a", { class: "card project-card", href: route.project(p.slug), "data-color": p.color },
    h("div", { class: "project-card-top" },
      h("span", { class: "project-icon", "data-color": p.color }, icon("folder", 16)),
      p.status !== "active" ? h("span", { class: "pill" }, t("project.status." + p.status)) : null),
    h("div", { class: "card-title" }, p.title),
    h("div", { class: "card-text" }, p.description || h("span", { class: "muted" }, t("project.noDescription"))),
    h("div", { class: "card-foot" },
      h("span", { title: t("common.tasks") }, icon("check", 13), String(s.open)),
      h("span", { title: t("nav.meetings") }, icon("users", 13), String(s.meetings.length)),
      s.lastMeeting ? h("span", {}, icon("calendar", 13), relDay(s.lastMeeting.date)) : null,
      h("span", { class: "grow right" }, s.last ? relTime(s.last) : "")));
}

export function render(root) {
  const v = vault();
  const all = [...v.projects.values()].sort((a, b) => a.title.localeCompare(b.title));
  const active = all.filter((p) => p.status === "active" || !p.status);
  const paused = all.filter((p) => p.status === "paused");
  const done = all.filter((p) => p.status === "done" || p.status === "archived");
  root.append(pageHeader({
    title: t("nav.projects"),
    subtitle: t("projects.subtitle", { n: active.length }),
    actions: [btn(t("project.new"), "plus", () => newProjectDialog(), "btn-primary")],
  }));
  if (!all.length) {
    root.append(emptyState("folder", t("projects.emptyTitle"), t("projects.emptyText"), btn(t("project.new"), "plus", () => newProjectDialog(), "btn-primary")));
    return;
  }
  if (active.length) root.append(section(t("project.status.active"), h("div", { class: "cards grid-cards" }, active.map(card)), { count: active.length }));
  if (paused.length) root.append(section(t("project.status.paused"), h("div", { class: "cards grid-cards" }, paused.map(card)), { count: paused.length }));
  if (done.length) root.append(section(t("project.status.done"), h("div", { class: "cards grid-cards dim" }, done.map(card)), { count: done.length }));
}
