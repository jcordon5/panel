// Documents: files that live outside the vault (templates, guides…), from the folders of documents.md.

import { h } from "../util.js";
import { icon } from "../icons.js";
import { t } from "../i18n.js";
import { pageHeader, section } from "./common.js";
import { documentsBrowser, foldersBlock, docFolders } from "../documents.js";

export const title = () => t("docs.title");

export function render(root) {
  root.append(pageHeader({ title: t("docs.title"), subtitle: t("docs.subtitle") }));
  root.append(documentsBrowser({ help: false }));
  const folders = h("details", { class: "docs-folders", open: !docFolders().length },
    h("summary", {}, icon("chevron-right", 14, "docs-caret"), h("span", {}, t("docs.manage", { n: docFolders().length }))), foldersBlock());
  root.append(section(t("docs.folders"), folders, { icon: "folder" }));
}
