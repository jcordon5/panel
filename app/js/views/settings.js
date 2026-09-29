// Settings + keyboard shortcuts.

import { h, today, addDays } from "../util.js";
import { icon } from "../icons.js";
import { t, lang, setLang, LANGS } from "../i18n.js";
import { store } from "../store.js";
import { state, savePrefs, applyTheme } from "../state.js";
import { modal, field, closeModals, errorToast, promptDialog, confirmDialog, toast } from "../ui.js";
import { apiGet, apiPost, waitForServerAndReload } from "../store.js";
import { resetEvents } from "../events.js";
import { backend } from "../backends.js";
import { makeZip } from "../zip.js";
import { DOWNLOAD_WIN, DOWNLOAD_ZIP } from "./connect.js";
import * as A from "../actions.js";
import { go, route } from "../nav.js";

const SHORTCUTS = [
  ["Ctrl/⌘ K", "sc.palette"], ["N", "sc.newTask"], ["M", "sc.newMeeting"], ["⇧ N", "sc.newNote"],
  ["T", "sc.today"], ["I", "sc.inbox"], ["W", "sc.week"], ["C", "sc.calendar"], ["R", "sc.meetings"], ["B", "sc.notes"], ["P", "sc.projects"],
  ["← →", "sc.navigate"], ["E", "sc.edit"], ["Ctrl/⌘ Z", "sc.undo"],
  ["Ctrl/⌘ S", "sc.save"], ["Ctrl/⌘ Enter", "sc.toggleTask"], ["Esc", "sc.exitEditor"], ["[[", "sc.link"],
];

const TABS = [
  ["general", "settings", "settings.tab.general"],
  ["calendar", "calendar", "settings.tab.calendar"],
  ["vault", "archive", "settings.tab.vault"],
  ["updates", "sparkles", "settings.tab.updates"],
  ["templates", "file", "tpl.title"],
  ["shortcuts", "keyboard", "settings.shortcuts"],
];

export function openSettings(tab = "general") {
  const langSel = h("select", { class: "input" }, Object.entries(LANGS).map(([k, v]) => h("option", { value: k, selected: k === lang() }, v)));
  const pane = h("div", { class: "settings-pane" });
  const nav = h("div", { class: "settings-tabs", role: "tablist" });
  const show = (id) => {
    nav.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
    pane.replaceChildren(...[].concat(PANES[id](langSel)).filter(Boolean));
  };
  for (const [id, ic, key] of TABS) nav.append(h("button", { type: "button", "data-tab": id, onclick: () => show(id) }, icon(ic, 14), t(key)));
  modal({
    title: t("settings.title"),
    body: [nav, pane],
    wide: true,
    className: "modal-settings",
    actions: [{ label: t("common.close"), primary: true }],
    onClose: () => {
      if (langSel.value !== lang()) { setLang(langSel.value); state.render(); }
    },
  });
  show(TABS.some(([id]) => id === tab) ? tab : "general");
}

const PANES = {
  general(langSel) {
    const theme = h("div", { class: "segmented" }, [["system", "monitor"], ["light", "sun"], ["dark", "moon"]].map(([k, ic]) =>
      h("button", { type: "button", class: state.prefs.theme === k ? "active" : "", onclick: (e) => {
        state.prefs.theme = k; savePrefs(); applyTheme();
        e.currentTarget.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === e.currentTarget));
      } }, icon(ic, 14), t("settings.theme." + k))));
    const weekend = h("input", { type: "checkbox", checked: state.prefs.weekend, onchange: (e) => { state.prefs.weekend = e.target.checked; savePrefs(); state.render(); } });
    const inboxCol = h("input", { type: "checkbox", checked: state.prefs.inboxColumn, onchange: (e) => { state.prefs.inboxColumn = e.target.checked; savePrefs(); state.render(); } });
    return [
      field(t("settings.language"), langSel),
      field(t("settings.themeLabel"), theme),
      h("label", { class: "check-field" }, weekend, h("span", {}, t("settings.weekend"))),
      h("label", { class: "check-field" }, inboxCol, h("span", {}, t("settings.inboxColumn"))),
    ];
  },

  calendar() {
    const wrap = h("div", { class: "settings-block" }, h("p", { class: "muted small" }, t("cal.settingsHelp")));
    if (!backend.features.calendar) {
      wrap.append(h("div", { class: "settings-info" }, t("cal.webOnly")),
        h("div", { class: "row-actions" }, h("a", { class: "btn", href: DOWNLOAD_WIN }, "Windows"), h("a", { class: "btn", href: DOWNLOAD_ZIP }, "macOS / Linux")));
      return wrap;
    }
    apiGet("/api/settings").then((cfg) => {
      const isWin = cfg.platform.startsWith("win");
      const hasOutlook = cfg.calendars.some((c) => c.toLowerCase() === "outlook");
      const outlook = h("input", { type: "checkbox", checked: hasOutlook, disabled: !isWin && !hasOutlook });
      const attendees = h("input", { type: "checkbox", checked: cfg.outlookAttendees });
      const urls = h("textarea", { class: "input mono", rows: "3", placeholder: "https://outlook.office365.com/owa/calendar/…/calendar.ics" });
      urls.value = cfg.calendars.filter((c) => c.toLowerCase() !== "outlook").join("\n");
      const status = h("div", { class: "muted small" });
      const save = async (test) => {
        const list = urls.value.split(/\n+/).map((x) => x.trim()).filter(Boolean);
        if (outlook.checked) list.unshift("outlook");
        await apiPost("/api/settings", { calendars: list, outlookAttendees: attendees.checked });
        resetEvents();
        if (!test) { toast(t("props.saved")); state.render(); return; }
        status.textContent = t("cal.testing");
        try {
          const res = await apiGet(`/api/calendar?from=${today()}&to=${addDays(today(), 13)}&refresh=1`);
          status.textContent = t("cal.testResult", { n: res.events.length }) + (res.errors.length ? " — " + res.errors.join(" · ") : "");
          status.className = "small " + (res.errors.length ? "text-danger" : "text-ok");
          state.render();
        } catch (e) { status.textContent = e.message; status.className = "small text-danger"; }
      };
      wrap.append(
        h("label", { class: "check-field" }, outlook, h("span", {}, h("strong", {}, t("cal.outlook")), " — ", isWin ? t("cal.outlookHint") : t("cal.outlookOnlyWin"))),
        h("label", { class: "check-field indent" }, attendees, h("span", { class: "small" }, t("cal.outlookAttendees"))),
        field(t("cal.icsLabel"), urls, t("cal.icsHint")),
        h("div", { class: "row-actions" },
          h("button", { class: "btn", type: "button", onclick: () => save(true) }, icon("calendar", 14), t("cal.saveTest")),
          h("button", { class: "btn btn-primary", type: "button", onclick: () => save(false) }, t("common.save"))),
        status);
    }).catch((e) => wrap.append(h("p", { class: "text-danger small" }, e.message)));
    return wrap;
  },

  vault() {
    const wrap = h("div", { class: "settings-block" });
    if (backend.kind !== "server") {
      const d = backend.describe();
      wrap.append(
        h("div", { class: "settings-info" },
          h("div", {}, h("span", { class: "muted" }, t(backend.kind === "github" ? "storage.github" : backend.kind === "memory" ? "demo.title" : "storage.folder") + ": "),
            d.url ? h("a", { href: d.url, target: "_blank", rel: "noopener" }, d.label) : h("code", {}, d.label)),
          h("div", { class: "muted small" }, t(backend.kind === "github" ? "storage.githubHelp" : backend.kind === "memory" ? "demo.text" : "storage.folderHelp"))),
        h("div", { class: "row-actions" },
          h("button", { class: "btn btn-primary", type: "button", onclick: () => exportZip().catch(errorToast) }, icon("archive", 14), t("vault.export")),
          h("button", { class: "btn", type: "button", onclick: async () => {
            if (!(await confirmDialog(t("storage.disconnectConfirm"), { ok: t("storage.disconnect"), danger: false }))) return;
            await backend.forget(); location.reload();
          } }, t("storage.disconnect"))));
      return wrap;
    }
    const path = h("input", { class: "input mono", type: "text", value: store.info?.vault || "" });
    const move = async () => {
      if (!path.value.trim() || path.value.trim() === store.info?.vault) return;
      if (!(await confirmDialog(t("vault.changeConfirm", { path: path.value.trim() }), { ok: t("vault.changeOk"), danger: false }))) return;
      try {
        const res = await apiPost("/api/settings", { vault: path.value.trim() });
        if (res.restart) { await apiPost("/api/restart"); busyOverlay(t("vault.restarting")); waitForServerAndReload(); }
      } catch (e) { errorToast(e); }
    };
    wrap.append(
      field(t("vault.folder"), path, t("vault.folderHint")),
      h("div", { class: "row-actions" }, h("button", { class: "btn", type: "button", onclick: move }, t("vault.change"))),
      h("h3", { class: "settings-sub" }, icon("archive", 15), t("vault.backupTitle")),
      h("p", { class: "muted small" }, t("vault.backupHelp")),
      h("div", { class: "row-actions" },
        h("a", { class: "btn btn-primary", href: "/api/export", download: "" }, icon("archive", 14), t("vault.export")),
        h("button", { class: "btn", type: "button", onclick: async () => {
          try { const r = await apiPost("/api/backup"); toast(t("vault.backupDone", { path: r.path })); } catch (e) { errorToast(e); }
        } }, t("vault.backupNow"))),
      h("p", { class: "muted small" }, t("vault.syncHelp")));
    return wrap;
  },

  updates() {
    const wrap = h("div", { class: "settings-block" });
    if (!backend.features.updates) {
      wrap.append(h("div", { class: "settings-info" }, h("div", {}, "Panel ", h("strong", {}, store.info?.version || "")), h("div", { class: "text-ok" }, icon("check", 14), " ", t("upd.web"))));
      return wrap;
    }
    const status = h("div", { class: "update-status" }, t("upd.checking"));
    wrap.append(h("div", { class: "settings-info" }, h("div", {}, "Panel ", h("strong", {}, store.info?.version || ""))), status);
    apiGet("/api/settings").then((cfg) => {
      const auto = h("input", { type: "checkbox", checked: cfg.checkUpdates !== false, onchange: () => apiPost("/api/settings", { checkUpdates: auto.checked }) });
      wrap.append(h("label", { class: "check-field" }, auto, h("span", {}, t("upd.auto"))),
        h("p", { class: "muted small" }, t("upd.help", { repo: cfg.updateRepo })));
    });
    checkUpdate(true).then((u) => {
      status.replaceChildren(u.newer
        ? h("div", {}, h("div", {}, t("upd.available", { v: u.latest })), u.notes ? h("pre", { class: "update-notes" }, u.notes.slice(0, 1200)) : null,
          h("button", { class: "btn btn-primary", type: "button", onclick: () => applyUpdate(u) }, icon("sparkles", 14), t("upd.install", { v: u.latest })))
        : h("div", { class: "text-ok" }, icon("check", 14), " ", t("upd.upToDate")));
    }).catch((e) => status.replaceChildren(h("div", { class: "text-danger small" }, e.message)));
    return wrap;
  },

  templates() { return templatesBlock(); },

  shortcuts() {
    return h("div", { class: "shortcuts" }, SHORTCUTS.map(([k, d]) => h("div", { class: "shortcut" }, h("kbd", {}, k), h("span", {}, t(d)))));
  },
};

/* ------------------------------------------------------------ updates */

export async function checkUpdate(force = false) {
  return apiGet("/api/update/check" + (force ? "?force=1" : ""));
}

export async function applyUpdate(u) {
  if (!(await confirmDialog(t("upd.confirm", { v: u.latest }), { title: t("upd.title"), ok: t("upd.installShort"), danger: false }))) return;
  closeModals();
  busyOverlay(t("upd.installing"));
  try {
    await apiPost("/api/update/apply");
    busyOverlay(t("upd.restarting"));
    waitForServerAndReload(store.info?.version);
  } catch (e) {
    document.querySelector(".busy-overlay")?.remove();
    errorToast(e);
  }
}

function busyOverlay(text) {
  document.querySelector(".busy-overlay")?.remove();
  document.body.append(h("div", { class: "busy-overlay" }, h("div", { class: "busy-box" }, h("div", { class: "boot-spinner" }), h("div", {}, text))));
}

function templatesBlock() {
  const open = (p) => { closeModals(); go(route.edit(p)); };
  const wrap = h("div", { class: "tpl-list" }, h("p", { class: "muted small" }, t("tpl.help")));
  for (const kind of ["meeting", "note"]) {
    const list = A.listTemplates(kind);
    const rows = list.length ? list : [{ path: null, label: t("tpl.default"), isDefault: true }];
    wrap.append(h("div", { class: "tpl-group" },
      h("div", { class: "tpl-kind" }, icon(kind === "meeting" ? "users" : "note", 14), t("tpl.kind." + kind)),
      rows.map((tp) => h("div", { class: "tpl-row" },
        h("span", { class: "tpl-name" }, tp.label, tp.path ? h("code", {}, tp.path) : h("span", { class: "muted small" }, " · " + t("tpl.builtin"))),
        h("button", { class: "btn btn-sm", type: "button", onclick: async () => {
          try { open(tp.path || await A.ensureDefaultTemplate(kind)); } catch (e) { errorToast(e); }
        } }, icon("pencil", 13), t("common.edit")))),
      h("button", { class: "btn btn-sm btn-ghost", type: "button", onclick: async () => {
        const name = await promptDialog(t("tpl.new." + kind), { label: t("common.name"), placeholder: t("tpl.namePh"), ok: t("tpl.create") });
        if (!name) return;
        try { open(await A.createTemplate(kind, name)); } catch (e) { errorToast(e); }
      } }, icon("plus", 13), t("tpl.new." + kind))));
  }
  return wrap;
}

/** Export the whole vault as a .zip from the browser (web backends). */
export async function exportZip() {
  const enc = new TextEncoder();
  const files = [...store.files.entries()].map(([p, f]) => ({ name: "vault/" + p, data: enc.encode(f.content) }));
  for (const p of store.others.keys()) {
    const url = await backend.assetBlobUrl(p);
    if (url) files.push({ name: "vault/" + p, data: new Uint8Array(await (await fetch(url)).arrayBuffer()) });
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(makeZip(files));
  a.download = "panel-vault-" + today() + ".zip";
  document.body.append(a);
  a.click();
  a.remove();
}
