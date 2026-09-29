// Notes board ("Tablón"): pinned notes first, then the rest by last edit.

import { h, fold } from "../util.js";
import { t } from "../i18n.js";
import { vault } from "../model.js";
import { pageHeader, btn, section, noteCard } from "./common.js";
import { newNoteDialog } from "./dialogs.js";
import { emptyState } from "../ui.js";

let q = "";

export const title = () => t("nav.notes");

export function render(root) {
  const v = vault();
  root.append(pageHeader({
    title: t("nav.notes"),
    subtitle: t("notes.subtitle"),
    actions: [btn(t("note.new"), "plus", () => newNoteDialog(), "btn-primary")],
  }));
  const search = h("input", { class: "input", type: "search", placeholder: t("notes.searchPh"), value: q, "data-focus-key": "notes-q" });
  const out = h("div");
  search.addEventListener("input", () => { q = search.value; paint(); });
  if (v.notes.length > 6) root.append(h("div", { class: "toolbar" }, search));
  root.append(out);

  function paint() {
    const f = fold(q.trim());
    const notes = v.notes.filter((n) => !f || fold(n.title + " " + n.body).includes(f)).sort((a, b) => b.mtime - a.mtime);
    out.replaceChildren();
    if (!v.notes.length) {
      out.append(emptyState("note", t("notes.emptyTitle"), t("notes.emptyText"), btn(t("note.new"), "plus", () => newNoteDialog(), "btn-primary")));
      return;
    }
    const pinned = notes.filter((n) => n.pinned);
    const rest = notes.filter((n) => !n.pinned);
    if (pinned.length) out.append(section(t("notes.pinned"), h("div", { class: "cards masonry" }, pinned.map(noteCard)), { icon: "pin", count: pinned.length }));
    if (rest.length) out.append(section(pinned.length ? t("notes.others") : t("notes.all"), h("div", { class: "cards masonry" }, rest.map(noteCard)), { count: rest.length }));
    if (!notes.length) out.append(h("p", { class: "muted center pad" }, t("common.noResults")));
  }
  paint();
}
