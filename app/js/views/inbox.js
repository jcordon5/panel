// Inbox: tasks without a date.

import { h } from "../util.js";
import { t } from "../i18n.js";
import { vault, P } from "../model.js";
import { taskList } from "../tasks.js";
import { pageHeader, btn } from "./common.js";
import { go, route } from "../nav.js";

export const title = () => t("nav.inbox");

export function render(root) {
  const v = vault();
  const items = v.inbox.items;
  const open = items.filter((x) => x.type === "task" && !x.done).length;
  root.append(pageHeader({
    title: t("nav.inbox"),
    subtitle: t("inbox.subtitle"),
    actions: v.docs.has(P.inbox) ? [btn(t("common.openFile"), "file", () => go(route.doc(P.inbox)), "btn-ghost")] : [],
  }));
  root.append(h("div", { class: "narrow" },
    taskList(items, { target: { kind: "inbox" }, placeholder: t("inbox.addPh") }),
    open === 0 ? h("p", { class: "muted small center pad" }, t("inbox.empty")) : h("p", { class: "muted small pad" }, t("inbox.tip"))));
}
