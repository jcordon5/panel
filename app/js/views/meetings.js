// All meetings: upcoming + history grouped by month, filterable.

import { h, today, fold } from "../util.js";
import { t, fmtDate, cap } from "../i18n.js";
import { vault } from "../model.js";
import { pageHeader, btn, section, meetingRow } from "./common.js";
import { newMeetingDialog } from "./dialogs.js";
import { emptyState } from "../ui.js";

let filter = { q: "", project: "" };

export const title = () => t("nav.meetings");

export function render(root) {
  const v = vault();
  root.append(pageHeader({
    title: t("nav.meetings"),
    subtitle: t("meetings.subtitle", { n: v.meetings.length }),
    actions: [btn(t("meeting.new"), "plus", () => newMeetingDialog({ project: filter.project && filter.project !== "-" ? filter.project : "" }), "btn-primary")],
  }));

  const list = h("div", { class: "meetings-list" });
  const search = h("input", { class: "input", type: "search", placeholder: t("meetings.searchPh"), value: filter.q, "data-focus-key": "meetings-q" });
  const projects = [...v.projects.values()].sort((a, b) => a.title.localeCompare(b.title));
  const proj = h("select", { class: "input input-auto" },
    h("option", { value: "" }, t("meetings.allProjects")),
    h("option", { value: "-", selected: filter.project === "-" }, t("meetings.noProject")),
    projects.map((p) => h("option", { value: p.slug, selected: filter.project === p.slug }, p.title)));
  search.addEventListener("input", () => { filter.q = search.value; paint(); });
  proj.addEventListener("change", () => { filter.project = proj.value; paint(); });
  root.append(h("div", { class: "toolbar" }, search, proj), list);

  function paint() {
    const q = fold(filter.q.trim());
    const ms = v.meetings.filter((m) => {
      if (filter.project === "-" && m.project) return false;
      if (filter.project && filter.project !== "-" && m.project !== filter.project) return false;
      if (!q) return true;
      return fold(m.title + " " + m.attendees.join(" ") + " " + (m.project || "") + " " + m.body).includes(q);
    });
    list.replaceChildren();
    if (!ms.length) {
      list.append(emptyState("users", v.meetings.length ? t("meetings.noMatch") : t("meetings.emptyTitle"), v.meetings.length ? null : t("meetings.emptyText"),
        v.meetings.length ? null : btn(t("meeting.new"), "plus", () => newMeetingDialog(), "btn-primary")));
      return;
    }
    const tdy = today();
    const upcoming = ms.filter((m) => m.date && m.date > tdy).reverse();
    const past = ms.filter((m) => !m.date || m.date <= tdy);
    if (upcoming.length) list.append(section(t("meetings.upcoming"), h("div", { class: "rows" }, upcoming.map((m) => meetingRow(m))), { icon: "calendar", count: upcoming.length }));
    const groups = new Map();
    for (const m of past) {
      const k = m.date ? m.date.slice(0, 7) : "";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(m);
    }
    for (const [k, arr] of groups) {
      list.append(section(k ? cap(fmtDate(k + "-01", "month")) : t("meetings.undated"), h("div", { class: "rows" }, arr.map((m) => meetingRow(m))), { count: arr.length }));
    }
  }
  paint();
}
