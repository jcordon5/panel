// Capture: hand Panel something for your AI to process — a meeting transcript, an email
// (.eml / .msg dragged out of Outlook), a chat you copied. It is stored in sources/ and
// deleted once the AI has turned it into minutes, tasks or knowledge.

import { h, today, addDays } from "../util.js";
import { icon } from "../icons.js";
import { t, relDay } from "../i18n.js";
import { vault } from "../model.js";
import { backend } from "../backends.js";
import { sync } from "../store.js";
import { modal, field, toast, errorToast } from "../ui.js";

export const SOURCE_EXT = [".vtt", ".docx", ".eml", ".msg", ".txt", ".md"];
const KINDS = ["note", "chat", "email", "transcript", "document"];
export const isSourceFile = (f) => SOURCE_EXT.some((e) => f.name.toLowerCase().endsWith(e));

const linkTo = (path) => "[[" + path.replace(/\.md$/, "").split("/").pop() + "]]";

async function b64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** opts: { meeting: path, project: slug, files: [File] } */
export function captureDialog(opts = {}) {
  let files = [...(opts.files || [])];
  const text = h("textarea", { class: "input", rows: "7", placeholder: t("cap.pastePh") });
  const title = h("input", { class: "input", type: "text", placeholder: t("cap.titlePh") });
  const kind = h("select", { class: "input" }, KINDS.map((k) => h("option", { value: k }, t("cap.kind." + k))));
  const tdy = today();
  const recent = vault().meetings.filter((m) => m.date && m.date <= addDays(tdy, 1) && m.date >= addDays(tdy, -14));
  const meeting = h("select", { class: "input" }, h("option", { value: "" }, t("cap.noMeeting")),
    recent.map((m) => h("option", { value: m.path, selected: m.path === opts.meeting }, `${m.title} · ${relDay(m.date)}`)));
  const fileList = h("div", { class: "cap-files" });
  const input = h("input", { type: "file", multiple: true, accept: SOURCE_EXT.join(","), hidden: true, onchange: () => { files.push(...[...input.files].filter(isSourceFile)); input.value = ""; paint(); } });
  const drop = h("div", { class: "cap-drop", onclick: () => input.click() }, icon("upload", 18), h("span", {}, t("cap.drop")), h("span", { class: "muted small" }, SOURCE_EXT.join(" ")), input);
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); files.push(...[...e.dataTransfer.files].filter(isSourceFile)); paint(); });
  function paint() {
    fileList.replaceChildren(...files.map((f, i) => h("div", { class: "cap-file" }, icon("file", 14), h("span", {}, f.name),
      h("button", { class: "chip-x", type: "button", "aria-label": t("common.remove"), onclick: () => { files.splice(i, 1); paint(); } }, icon("x", 11)))));
  }
  paint();
  modal({
    title: t("cap.title"),
    wide: true,
    body: [
      h("p", { class: "muted small" }, t("cap.help")),
      drop, fileList,
      field(t("cap.orPaste"), text),
      h("div", { class: "field-row" }, field(t("common.title"), title), field(t("cap.kindLabel"), kind)),
      field(t("cap.meeting"), meeting, t("cap.meetingHint")),
    ],
    actions: [{ label: t("common.cancel") }, {
      label: t("cap.save"), primary: true, onClick: async () => {
        if (!files.length && !text.value.trim()) { text.focus(); return false; }
        const m = meeting.value ? vault().docs.get(meeting.value) : null;
        const common = { meeting: m ? linkTo(m.path) : undefined, project: (m && m.project) || opts.project || undefined };
        let n = 0;
        try {
          for (const f of files) {
            await backend.api("/api/source", { ...common, name: f.name, data: await b64(f), title: files.length === 1 && title.value.trim() ? title.value.trim() : undefined });
            n++;
          }
          if (text.value.trim()) { await backend.api("/api/source", { ...common, text: text.value, title: title.value.trim() || undefined, kind: kind.value }); n++; }
        } catch (e) { errorToast(e); await sync(); return false; }
        await sync();
        toast(t("cap.saved", { n }));
      },
    }],
  });
}

/** Files dropped anywhere on Panel (outside the editor) open the capture dialog. */
export function bindGlobalDrop() {
  let depth = 0;
  const useful = (e) => [...(e.dataTransfer?.items || [])].some((i) => i.kind === "file") && !e.target.closest?.(".cm-editor, .modal, .cap-drop");
  window.addEventListener("dragenter", (e) => { if (useful(e)) { depth++; document.body.classList.add("drop-capture"); } });
  window.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; document.body.classList.remove("drop-capture"); } });
  window.addEventListener("dragover", (e) => { if (useful(e)) e.preventDefault(); });
  window.addEventListener("drop", (e) => {
    depth = 0;
    document.body.classList.remove("drop-capture");
    if (!useful(e)) return;
    const files = [...e.dataTransfer.files].filter(isSourceFile);
    if (!files.length) return;
    e.preventDefault();
    const m = /^#\/meet\/(.+)$/.exec(location.hash);
    captureDialog({ files, meeting: m ? decodeURIComponent(m[1]) : undefined });
  });
}
