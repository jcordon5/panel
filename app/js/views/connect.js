// Web version: choose where the vault lives (a folder on this computer or a
// private GitHub repository). The desktop version skips this screen.

import { h } from "../util.js";
import { icon } from "../icons.js";
import { t, lang, setLang, LANGS } from "../i18n.js";
import { FolderBackend, GitHubBackend, MemoryBackend, setBackend } from "../backends.js";
import { field, errorToast } from "../ui.js";

const REPO_URL = "https://github.com/jcordon5/panel";
export const DOWNLOAD_WIN = REPO_URL + "/releases/latest/download/Panel-Windows.zip";
export const DOWNLOAD_ZIP = REPO_URL + "/releases/latest/download/panel.zip";

function shell(root, ...content) {
  document.body.classList.add("bare");
  const langSel = h("select", { class: "input input-auto", onchange: () => { setLang(langSel.value); root.dispatchEvent(new Event("rerender")); } },
    Object.entries(LANGS).map(([k, v]) => h("option", { value: k, selected: k === lang() }, v)));
  root.replaceChildren(h("div", { class: "welcome connect" }, h("div", { class: "welcome-card connect-card" },
    h("div", { class: "welcome-logo" }, icon("logo", 34)),
    ...content,
    h("div", { class: "welcome-foot" },
      h("a", { class: "muted small", href: REPO_URL, target: "_blank", rel: "noopener" }, t("connect.about")),
      langSel))));
}

export function render(root, onReady) {
  root.addEventListener("rerender", () => render(root, onReady), { once: true });
  const done = async (b) => { setBackend(b); await onReady(); };
  const busy = (btn, fn) => async () => {
    btn.disabled = true; btn.classList.add("loading");
    try { await fn(); } catch (e) { if (e.name !== "AbortError") errorToast(e); btn.disabled = false; btn.classList.remove("loading"); }
  };

  // --- folder
  const folderOk = FolderBackend.supported();
  const folderBtn = h("button", { class: "btn btn-primary", type: "button", disabled: !folderOk }, icon("folder", 16), t("connect.folderBtn"));
  folderBtn.onclick = busy(folderBtn, async () => done(await FolderBackend.pick()));

  // --- github
  const repo = h("input", { class: "input", type: "text", placeholder: "usuario/panel-vault", autocomplete: "off", spellcheck: "false" });
  const token = h("input", { class: "input", type: "password", placeholder: "github_pat_…", autocomplete: "off" });
  const ghForm = h("div", { class: "gh-form", hidden: true },
    h("ol", { class: "gh-steps" },
      h("li", {}, t("connect.gh1"), " ", h("a", { href: "https://github.com/new?name=panel-vault&visibility=private&description=My+Panel+vault", target: "_blank", rel: "noopener" }, t("connect.gh1link"))),
      h("li", {}, t("connect.gh2"), " ", h("a", { href: "https://github.com/settings/personal-access-tokens/new?name=Panel&description=Panel+vault&contents=write", target: "_blank", rel: "noopener" }, t("connect.gh2link"))),
      h("li", {}, t("connect.gh3"))),
    field(t("connect.repo"), repo),
    field(t("connect.token"), token, t("connect.tokenHint")),
    (() => {
      const b = h("button", { class: "btn btn-primary", type: "button" }, icon("link", 15), t("connect.ghConnect"));
      b.onclick = busy(b, async () => {
        const m = /(?:github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(repo.value.trim());
        if (!m) { repo.focus(); throw new Error(t("connect.repoInvalid")); }
        if (!token.value.trim()) { token.focus(); throw new Error(t("connect.tokenMissing")); }
        done(await GitHubBackend.connect({ owner: m[1], repo: m[2], token: token.value }));
      });
      return b;
    })());
  const ghBtn = h("button", { class: "btn", type: "button", onclick: () => { ghForm.hidden = !ghForm.hidden; if (!ghForm.hidden) repo.focus(); } }, icon("link", 16), t("connect.ghBtn"));

  shell(root,
    h("h1", {}, "Panel"),
    h("p", { class: "welcome-lead" }, t("connect.lead")),
    h("div", { class: "connect-options" },
      h("section", { class: "connect-option" },
        h("div", { class: "connect-head" }, icon("folder", 18), h("strong", {}, t("connect.folderTitle")), h("span", { class: "pill" }, t("connect.recommended"))),
        h("p", { class: "small muted" }, folderOk ? t("connect.folderText") : t("connect.folderUnsupported")),
        folderBtn),
      h("section", { class: "connect-option" },
        h("div", { class: "connect-head" }, icon("link", 18), h("strong", {}, t("connect.ghTitle"))),
        h("p", { class: "small muted" }, t("connect.ghText")),
        ghBtn, ghForm),
      h("section", { class: "connect-option" },
        h("div", { class: "connect-head" }, icon("monitor", 18), h("strong", {}, t("connect.desktopTitle"))),
        h("p", { class: "small muted" }, t("connect.desktopText")),
        h("div", { class: "row-actions" },
          h("a", { class: "btn", href: DOWNLOAD_WIN }, icon("arrow-right", 15), "Windows"),
          h("a", { class: "btn", href: DOWNLOAD_ZIP }, icon("arrow-right", 15), "macOS / Linux")))),
    h("div", { class: "connect-demo" }, (() => {
      const b = h("button", { class: "btn btn-ghost", type: "button" }, icon("sparkles", 15), t("connect.demo"));
      b.onclick = busy(b, async () => done(await MemoryBackend.demo(lang())));
      return b;
    })()),
    h("p", { class: "small muted center" }, t("connect.privacy")));
}

export function renderReconnect(root, b, onReady) {
  const btn = h("button", { class: "btn btn-primary btn-lg", type: "button" }, icon("folder", 16), t("connect.reopen", { name: b.handle.name }));
  btn.onclick = async () => {
    try {
      if (await b.grant()) await onReady();
    } catch (e) { errorToast(e); }
  };
  root.addEventListener("rerender", () => renderReconnect(root, b, onReady), { once: true });
  shell(root,
    h("h1", {}, "Panel"),
    h("p", { class: "welcome-lead" }, t("connect.reopenText")),
    h("div", { class: "welcome-actions" }, btn,
      h("button", { class: "btn btn-ghost", type: "button", onclick: async () => { await b.forget(); location.reload(); } }, t("connect.other"))));
}
