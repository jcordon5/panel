// Knowledge: small notes of what you learn at work — procedures (how to do X), resources
// (where Y is) and facts — linked to projects and to the people who know about them.

import { h, fold } from "../util.js";
import { icon } from "../icons.js";
import { t, relTime } from "../i18n.js";
import { vault, KNOWLEDGE_KINDS } from "../model.js";
import { route } from "../nav.js";
import { excerpt } from "../markdown.js";
import { pageHeader, btn, projectChip } from "./common.js";
import { newKnowledgeDialog, KIND_ICON } from "./dialogs.js";
import { personChip } from "../picker.js";
import { emptyState } from "../ui.js";
import { bodyWithoutTitle } from "./common.js";
import { documentsBrowser } from "../documents.js";
import { state } from "../state.js";

let filter = { q: "", kind: "", project: "", tab: "notes" };

export const title = () => t("nav.knowledge");

const list = (v) => (Array.isArray(v) ? v : typeof v === "string" && v.trim() ? v.split(",").map((x) => x.trim()) : []);

export function knowledgeCard(d) {
  const kind = KNOWLEDGE_KINDS.includes(d.fm.kind) ? d.fm.kind : "fact";
  const people = list(d.fm.people);
  return h("a", { class: "card know-card", href: route.doc(d.path) },
    h("div", { class: "know-kind", "data-kind": kind }, icon(KIND_ICON[kind], 13), t("know.kind." + kind)),
    h("div", { class: "card-title" }, d.title),
    h("div", { class: "card-excerpt" }, excerpt(bodyWithoutTitle(d).body, 160)),
    h("div", { class: "card-foot" },
      h("span", {}, relTime(d.mtime)),
      d.project ? projectChip(d.project) : null,
      people.slice(0, 2).map((n) => personChip(n))));
}

export function render(root) {
  const v = vault();
  root.append(pageHeader({
    title: t("nav.knowledge"),
    subtitle: t("know.subtitle"),
    actions: [btn(t("know.new"), "plus", () => newKnowledgeDialog({ kind: filter.kind || "howto", project: filter.project }), "btn-primary")],
  }));
  const tabs = h("div", { class: "segmented know-tabs" }, [["notes", "book", t("know.tabNotes")], ["docs", "folder", t("docs.title")]].map(([k, ic, label]) =>
    h("button", { type: "button", class: filter.tab === k ? "active" : "", onclick: () => { filter.tab = k; state.render(); } }, icon(ic, 14), label)));
  root.append(tabs);
  if (filter.tab === "docs") { root.append(documentsBrowser()); return; }
  const search = h("input", { class: "input", type: "search", placeholder: t("know.searchPh"), value: filter.q, "data-focus-key": "know-q" });
  const kinds = h("div", { class: "segmented" });
  const projects = [...v.projects.values()].sort((a, b) => a.title.localeCompare(b.title));
  const proj = h("select", { class: "input input-auto" }, h("option", { value: "" }, t("meetings.allProjects")),
    projects.map((p) => h("option", { value: p.slug, selected: filter.project === p.slug }, p.title)));
  const grid = h("div", {});
  search.addEventListener("input", () => { filter.q = search.value; paint(); });
  proj.addEventListener("change", () => { filter.project = proj.value; paint(); });
  root.append(h("div", { class: "toolbar" }, search, kinds, proj), grid);

  function paint() {
    kinds.replaceChildren(...["", ...KNOWLEDGE_KINDS].map((k) => h("button", {
      type: "button", class: filter.kind === k ? "active" : "", onclick: () => { filter.kind = k; paint(); },
    }, k ? icon(KIND_ICON[k], 14) : null, k ? t("know.kinds." + k) : t("know.all"))));
    const q = fold(filter.q.trim());
    const items = v.knowledge.filter((d) => (!filter.kind || (d.fm.kind || "fact") === filter.kind) && (!filter.project || d.project === filter.project)
      && (!q || fold([d.title, d.body, ...d.tags, ...list(d.fm.people)].join(" ")).includes(q)));
    grid.replaceChildren(items.length ? h("div", { class: "cards know-cards" }, items.map(knowledgeCard))
      : v.knowledge.length ? emptyState("search", t("know.noMatch"))
        : emptyState("sparkles", t("know.emptyTitle"), t("know.emptyText"), btn(t("know.new"), "plus", () => newKnowledgeDialog(), "btn-primary")));
  }
  paint();
}
