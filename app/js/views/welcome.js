// First run: create a new vault or migrate a Panel v1 vault ("boveda").

import { h } from "../util.js";
import { icon } from "../icons.js";
import { t, lang, setLang, LANGS } from "../i18n.js";
import { store, migrate, sync } from "../store.js";
import { scaffold } from "../scaffold.js";
import { errorToast, toast } from "../ui.js";

export function render(root, onReady) {
  const langSel = h("select", { class: "input input-auto", onchange: () => { setLang(langSel.value); render(root, onReady); } },
    Object.entries(LANGS).map(([k, v]) => h("option", { value: k, selected: k === lang() }, v)));

  const busy = (btn, fn) => async () => {
    btn.disabled = true;
    btn.classList.add("loading");
    try { await fn(); } catch (e) { errorToast(e); btn.disabled = false; btn.classList.remove("loading"); }
  };

  const createBtn = h("button", { class: "btn btn-lg" + (store.info.legacy ? "" : " btn-primary"), type: "button" }, icon("sparkles", 17), t("welcome.create"));
  createBtn.onclick = busy(createBtn, async () => {
    await sync();
    await scaffold(lang());
    await onReady();
  });

  let migrateBtn = null;
  if (store.info.legacy) {
    migrateBtn = h("button", { class: "btn btn-lg btn-primary", type: "button" }, icon("archive", 17), t("welcome.migrate"));
    migrateBtn.onclick = busy(migrateBtn, async () => {
      const res = await migrate(lang());
      await sync();
      await scaffold(lang(), { welcome: false });
      toast(t("welcome.migrated", { n: res.report.written }));
      await onReady();
    });
  }

  root.replaceChildren(h("div", { class: "welcome" },
    h("div", { class: "welcome-card" },
      h("div", { class: "welcome-logo" }, icon("logo", 34)),
      h("h1", {}, t("welcome.title")),
      h("p", { class: "welcome-lead" }, t("welcome.lead")),
      h("ul", { class: "welcome-points" },
        h("li", {}, icon("check", 15), t("welcome.p1")),
        h("li", {}, icon("check", 15), t("welcome.p2")),
        h("li", {}, icon("check", 15), t("welcome.p3"))),
      h("div", { class: "welcome-vault" }, h("span", { class: "muted small" }, t("welcome.vaultAt")), h("code", {}, store.info.vault)),
      store.info.legacy ? h("div", { class: "welcome-legacy" }, icon("archive", 16), h("div", {},
        h("strong", {}, t("welcome.legacyTitle")), h("div", { class: "small" }, t("welcome.legacyText", { path: store.info.legacy })))) : null,
      h("div", { class: "welcome-actions" }, migrateBtn, createBtn),
      h("div", { class: "welcome-foot" }, h("span", { class: "muted small" }, t("settings.language")), langSel))));
}
