// Command palette (Ctrl/⌘+K): jump to any file, full-text search, commands.

import { h, fold, today } from "../util.js";
import { icon } from "../icons.js";
import { t, relDay } from "../i18n.js";
import { vault } from "../model.js";
import { store } from "../store.js";
import { go, route } from "../nav.js";
import { quickAdd } from "../tasks.js";
import { newMeetingDialog, newNoteDialog, newProjectDialog } from "./dialogs.js";
import { openSettings } from "./settings.js";

function commands() {
  return [
    { label: t("quick.title"), icon: "plus", hint: "N", run: () => quickAdd() },
    { label: t("meeting.new"), icon: "users", hint: "M", run: () => newMeetingDialog() },
    { label: t("note.new"), icon: "note", hint: "⇧N", run: () => newNoteDialog() },
    { label: t("project.new"), icon: "folder", run: () => newProjectDialog() },
    { label: t("nav.today"), icon: "sun", hint: "T", run: () => go(route.today()) },
    { label: t("nav.inbox"), icon: "inbox", hint: "I", run: () => go(route.inbox()) },
    { label: t("nav.week"), icon: "week", hint: "W", run: () => go(route.week()) },
    { label: t("nav.calendar"), icon: "calendar", hint: "C", run: () => go(route.calendar()) },
    { label: t("nav.meetings"), icon: "users", hint: "R", run: () => go(route.meetings()) },
    { label: t("nav.notes"), icon: "note", hint: "B", run: () => go(route.notes()) },
    { label: t("nav.projects"), icon: "folder", hint: "P", run: () => go(route.projects()) },
    { label: t("settings.title"), icon: "settings", run: () => openSettings() },
    { label: t("settings.shortcuts"), icon: "keyboard", hint: "?", run: () => openSettings("shortcuts") },
    { label: t("tpl.title"), icon: "file", run: () => openSettings("templates") },
    { label: t("settings.tab.calendar"), icon: "calendar", run: () => openSettings("calendar") },
    { label: t("vault.export"), icon: "archive", run: () => { location.href = "/api/export"; } },
    { label: t("upd.check"), icon: "sparkles", run: () => openSettings("updates") },
  ];
}

function docIcon(d) {
  return { meeting: "users", project: "folder", week: "week", inbox: "inbox", note: "note" }[d.kind] || "file";
}

function score(q, text) {
  const s = fold(text);
  if (s.startsWith(q)) return 0;
  const i = s.indexOf(q);
  if (i >= 0) return 1 + (/\s/.test(s[i - 1] || " ") ? 0 : 1);
  // subsequence
  let j = 0;
  for (const ch of s) if (ch === q[j]) j++;
  return j === q.length ? 5 : -1;
}

export function openPalette(initial = "") {
  if (document.querySelector(".palette")) return;
  const input = h("input", { class: "palette-input", type: "text", placeholder: t("palette.placeholder"), value: initial, "aria-label": t("nav.search"), spellcheck: "false" });
  const list = h("div", { class: "palette-list", role: "listbox" });
  const box = h("div", { class: "palette", role: "dialog", "aria-modal": "true" },
    h("div", { class: "palette-head" }, icon("search", 18), input, h("kbd", {}, "Esc")), list);
  const backdrop = h("div", { class: "modal-backdrop palette-backdrop", onmousedown: (e) => { if (e.target === backdrop) close(); } }, box);
  document.getElementById("overlays").append(backdrop);
  let items = [], idx = 0;

  function close() { backdrop.remove(); document.removeEventListener("keydown", onKey, true); }

  function build() {
    const raw = input.value.trim();
    const q = fold(raw);
    const v = vault();
    const docs = [...v.docs.values()];
    items = [];
    if (!q) {
      items.push({ header: t("palette.recent") });
      docs.sort((a, b) => b.mtime - a.mtime).slice(0, 6).forEach((d) => items.push({ label: d.title, sub: d.path, icon: docIcon(d), run: () => go(route.doc(d.path)) }));
      items.push({ header: t("palette.commands") });
      commands().forEach((c) => items.push(c));
    } else {
      const cmd = commands().map((c) => ({ c, s: score(q, c.label) })).filter((x) => x.s >= 0 && x.s < 5).sort((a, b) => a.s - b.s).slice(0, 4);
      const projects = [...v.projects.values()].map((p) => ({ p, s: score(q, p.title) })).filter((x) => x.s >= 0).sort((a, b) => a.s - b.s).slice(0, 4);
      const byTitle = docs.map((d) => ({ d, s: score(q, d.title) })).filter((x) => x.s >= 0).sort((a, b) => a.s - b.s || b.d.mtime - a.d.mtime).slice(0, 10);
      if (projects.length) {
        items.push({ header: t("nav.projects") });
        projects.forEach(({ p }) => items.push({ label: p.title, icon: "folder", sub: "#" + p.slug, run: () => go(route.project(p.slug)) }));
      }
      if (byTitle.length) {
        items.push({ header: t("palette.files") });
        byTitle.forEach(({ d }) => items.push({ label: d.title, sub: (d.date ? relDay(d.date) + " · " : "") + d.path, icon: docIcon(d), run: () => go(route.doc(d.path)) }));
      }
      // full text
      if (q.length >= 2) {
        const hits = [];
        const seen = new Set(byTitle.map((x) => x.d.path));
        for (const [path, f] of store.files) {
          if (path.startsWith("templates/")) continue;
          const lines = f.content.split("\n");
          for (let i = 0; i < lines.length && hits.length < 40; i++) {
            const fl = fold(lines[i]);
            const at = fl.indexOf(q);
            if (at < 0 || /^\w+:\s/.test(lines[i]) && i < 12) continue;
            hits.push({ path, line: lines[i].trim(), at });
            if (seen.has(path)) break;
          }
          if (hits.length >= 40) break;
        }
        if (hits.length) {
          items.push({ header: t("palette.content") });
          hits.slice(0, 20).forEach((x) => {
            const d = v.docs.get(x.path);
            items.push({ label: x.line.slice(0, 140), sub: d ? d.title : x.path, icon: "search", mark: raw, run: () => go(route.doc(x.path)) });
          });
        }
      }
      if (cmd.length) {
        items.push({ header: t("palette.commands") });
        cmd.forEach(({ c }) => items.push(c));
      }
      items.push({ label: t("palette.createNote", { q: raw }), icon: "plus", run: () => import("../actions.js").then((A) => A.createNote({ title: raw })).then((p) => go(route.edit(p))) });
    }
    idx = items.findIndex((x) => !x.header);
    paint();
  }

  function highlight(text, q) {
    const f = fold(text), i = f.indexOf(fold(q));
    if (!q || i < 0) return [text];
    return [text.slice(0, i), h("mark", {}, text.slice(i, i + q.length)), text.slice(i + q.length)];
  }

  function paint() {
    list.replaceChildren(...items.map((it, i) => it.header ? h("div", { class: "palette-header" }, it.header)
      : h("div", { class: "palette-item" + (i === idx ? " active" : ""), role: "option", "aria-selected": String(i === idx), onmousemove: () => { if (idx !== i) { idx = i; paint(); } }, onclick: () => choose(i) },
        icon(it.icon || "file", 16),
        h("div", { class: "palette-main" }, h("div", { class: "palette-label" }, it.mark ? highlight(it.label, it.mark) : it.label), it.sub ? h("div", { class: "palette-sub" }, it.sub) : null),
        it.hint ? h("kbd", {}, it.hint) : null)));
    list.querySelector(".active")?.scrollIntoView({ block: "nearest" });
  }

  function choose(i) {
    const it = items[i];
    if (!it || it.header) return;
    close();
    it.run();
  }

  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      let n = idx;
      do { n = (n + dir + items.length) % items.length; } while (items[n]?.header && n !== idx);
      idx = n; paint();
    }
    if (e.key === "Enter") { e.preventDefault(); choose(idx); }
  }
  document.addEventListener("keydown", onKey, true);
  input.addEventListener("input", build);
  build();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  void today;
}
