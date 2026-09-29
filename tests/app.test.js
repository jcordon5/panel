// Unit + flow tests for the browser code. Run: node --test tests/
// No dependencies: a tiny in-memory fake of the server API replaces fetch.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ---- minimal browser globals used by the modules
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
if (!globalThis.navigator) globalThis.navigator = { language: "es-ES" };

// ---- fake server
const disk = new Map();
const etag = (s) => "e" + [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
globalThis.fetch = async (url, init = {}) => {
  const body = init.body ? JSON.parse(init.body) : {};
  const ok = (o) => ({ ok: true, status: 200, statusText: "OK", json: async () => ({ ok: true, ...o }) });
  const err = (status, o) => ({ ok: false, status, statusText: "ERR", json: async () => ({ ok: false, ...o }) });
  switch (url) {
    case "/api/info": return ok({ app: "panel", vault: "/tmp/v", vaultName: "v", empty: disk.size === 0 });
    case "/api/files": {
      const dirs = new Set();
      for (const p of disk.keys()) { const parts = p.split("/"); for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/")); }
      return ok({ files: [...disk.entries()].map(([path, c]) => ({ path, mtime: c.length, size: c.length })), dirs: [...dirs] });
    }
    case "/api/read": return ok({ files: Object.fromEntries(body.paths.map((p) => [p, disk.has(p) ? { content: disk.get(p), etag: etag(disk.get(p)), mtime: 1, size: 1 } : null])) });
    case "/api/write": {
      const cur = disk.has(body.path) ? disk.get(body.path) : null;
      if (body.create && cur !== null) return err(409, { reason: "exists" });
      if ("etag" in body && body.etag !== (cur === null ? null : etag(cur))) return err(409, { reason: "conflict", etag: cur === null ? null : etag(cur), content: cur });
      disk.set(body.path, body.content);
      return ok({ path: body.path, etag: etag(body.content), mtime: 2, size: body.content.length });
    }
    case "/api/delete": { for (const p of [...disk.keys()]) if (p === body.path || p.startsWith(body.path + "/")) disk.delete(p); return ok({}); }
    case "/api/move": {
      if (disk.has(body.to)) return err(409, { reason: "exists" });
      for (const [p, c] of [...disk.entries()]) if (p === body.from || p.startsWith(body.from + "/")) { disk.delete(p); disk.set(body.to + p.slice(body.from.length), c); }
      return ok({ path: body.to });
    }
    default: return err(404, {});
  }
};

const backends = await import("../app/js/backends.js");
backends.setBackend(new backends.ServerBackend());
const { parseDoc, setFm } = await import("../app/js/frontmatter.js");
const ops = await import("../app/js/ops.js");
const model = await import("../app/js/model.js");
const md = await import("../app/js/markdown.js");
const store = await import("../app/js/store.js");
const A = await import("../app/js/actions.js");
const { setLang } = await import("../app/js/i18n.js");
const util = await import("../app/js/util.js");
setLang("es");

async function reset(files) {
  disk.clear();
  store.store.files.clear();
  for (const [k, v] of Object.entries(files)) disk.set(k, v);
  await store.sync();
}

const WEEK = `---
type: week
week: 2026-W40
start: 2026-09-28
updated: 2026-09-28
---

# Semana 40

## Lunes · 2026-09-28

- [ ] a
  - detalle a
- [x] b

## Martes · 2026-09-29

## Miércoles · 2026-09-30

### Mañana
- [ ] c

### Tarde

## Jueves · 2026-10-01
`;

/* ------------------------------------------------------------ frontmatter */

test("frontmatter: parse, aliases and lists", () => {
  const d = parseDoc('---\ntitulo: "Reunión: kickoff"\nfecha: 2026-09-14\ntipo: reunion\nasistentes:\n  - Ana\n  - Luis\ntags: [a, "b, c"]\n---\n\n# Hola\n');
  assert.equal(d.fm.title, "Reunión: kickoff");
  assert.equal(d.fm.date, "2026-09-14");
  assert.equal(d.fm.type, "meeting");
  assert.deepEqual(d.fm.attendees, ["Ana", "Luis"]);
  assert.deepEqual(d.fm.tags, ["a", "b, c"]);
  assert.equal(d.bodyLine, 9);
});

test("frontmatter: setFm edits in place, quotes when needed, keeps unknown keys", () => {
  const src = "---\ntitle: A\ncustom: keep me\nlist:\n  - x\n---\nbody\n";
  const out = setFm(src, { title: "B: c", list: ["y", "z"], date: "2026-01-01" });
  assert.equal(out, '---\ntitle: "B: c"\ncustom: keep me\nlist: [y, z]\ndate: 2026-01-01\n---\nbody\n');
  assert.equal(setFm("no fm\n", { title: "T" }), "---\ntitle: T\n---\n\nno fm\n");
  assert.equal(parseDoc(setFm(src, { title: null })).fm.title, undefined);
});

/* ------------------------------------------------------------ model */

test("model: week sections from ISO and legacy weekday headings", () => {
  const lines = "## Lunes 14\n- [ ] x\n## Martes · 2026-09-15\n## Notas\n".split("\n");
  const secs = model.weekSections(lines, 0, "2026-09-14");
  assert.deepEqual(secs.map((s) => s.date), ["2026-09-14", "2026-09-15"]);
});

test("model: blocks include indented details and lazy continuation lines", () => {
  const lines = ["- [ ] a", "  - sub", "", "    more", "continuation", "- [ ] b"];
  assert.equal(model.blockEnd(lines, 0), 5);
  const items = model.containerItems(["### Mañana", ...lines], 0, 7);
  assert.deepEqual(items.map((i) => i.type), ["divider", "task", "task"]);
});

test("model: task text parsing (time + tags)", () => {
  const p = model.parseTaskText("10:30-11 Llamar a Ana #proyecto-x y #otro");
  assert.equal(p.time, "10:30");
  assert.deepEqual(p.tags, ["proyecto-x", "otro"]);
  assert.equal(model.parseTaskText("Issue #123").tags.length, 0);
});

/* ------------------------------------------------------------ ops */

test("ops: insert into empty, end and index positions", () => {
  let lines = WEEK.split("\n");
  const tue = ops.locate(lines, { kind: "day", date: "2026-09-29" }, "weeks/2026-W40.md");
  lines = ops.insertInto(lines, tue, ["- [ ] new"]);
  assert.match(lines.join("\n"), /## Martes · 2026-09-29\n\n- \[ \] new\n\n## Miércoles/);
  const mon = ops.locate(lines, { kind: "day", date: "2026-09-28" }, "weeks/2026-W40.md");
  lines = ops.insertInto(lines, mon, ["- [ ] first"], 0);
  lines = ops.insertInto(lines, ops.locate(lines, { kind: "day", date: "2026-09-28" }, "weeks/2026-W40.md"), ["- [ ] last"]);
  assert.match(lines.join("\n"), /## Lunes · 2026-09-28\n\n- \[ \] first\n- \[ \] a\n  - detalle a\n- \[x\] b\n- \[ \] last\n\n## Martes/);
});

test("ops: extract keeps the whole block and dedents it", () => {
  const lines = ["- [ ] parent", "  - [ ] child", "    - detail", "- [ ] next"];
  const r = ops.extractBlock(lines, 1);
  assert.deepEqual(r.block, ["- [ ] child", "  - detail"]);
  assert.deepEqual(r.lines, ["- [ ] parent", "- [ ] next"]);
});

test("ops: buildBlock / blockText round trip", () => {
  const block = ops.buildBlock("Título\n  - uno\n    - dos\ntexto");
  assert.deepEqual(block, ["- [ ] Título", "    - uno", "      - dos", "  texto"]);
  const lines = [...block];
  const task = model.containerItems(lines, 0, lines.length)[0];
  assert.equal(ops.blockText(task), "Título\n  - uno\n    - dos\ntexto");
});

test("ops: ensureDay inserts a missing day in order", () => {
  const lines = "---\nstart: 2026-09-28\n---\n\n## Lunes · 2026-09-28\n\n## Jueves · 2026-10-01\n".split("\n");
  const out = ops.ensureDay(lines, "2026-09-30", "weeks/2026-W40.md").join("\n");
  assert.match(out, /## Lunes · 2026-09-28\n\n## Miércoles · 2026-09-30\n\n## Jueves/);
});

test("ops: week template has 7 ISO-dated days", () => {
  const txt = ops.weekTemplate("2026-09-28");
  assert.equal((txt.match(/^## .* · \d{4}-\d{2}-\d{2}$/gm) || []).length, 7);
  assert.match(txt, /week: 2026-W40/);
});

test("util: ISO weeks across year boundaries", () => {
  assert.equal(util.weekId("2026-01-01"), "2026-W01");
  assert.equal(util.weekId("2027-01-01"), "2026-W53");
  assert.equal(util.weekStart("2026-W53"), "2026-12-28");
  assert.equal(util.weekStart("2026-W40"), "2026-09-28");
  assert.equal(util.relativePath("projects/a/meetings", "assets/2026-09/x.png"), "../../../assets/2026-09/x.png");
});

/* ------------------------------------------------------------ markdown */

test("markdown: checkboxes are mapped to file lines", () => {
  const src = "intro\n\n```\n- [ ] not a task\n```\n\n- [ ] one\n  - [x] two\n> - [ ] quoted\n";
  const html = md.renderMarkdown(src, { path: "notes/a.md", lineOffset: 10 });
  const lines = [...html.matchAll(/data-line="(\d+)"/g)].map((m) => +m[1]);
  assert.deepEqual(lines, [16, 17, 18]);
});

test("markdown: escapes raw html and unsafe links, supports callouts and highlights", () => {
  const html = md.renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n> [!warning] Ojo\n> texto\n\n==hi== <br>');
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes('href="#"'));
  assert.match(html, /callout callout-warning/);
  assert.match(html, /<mark>hi<\/mark> <br>/);
});

/* ------------------------------------------------------------ flows (fake server) */

beforeEach(async () => { await reset({ "weeks/2026-W40.md": WEEK }); });

test("flow: add, toggle, edit, delete and undo", async () => {
  await A.addTask({ kind: "day", date: "2026-09-29" }, "hola #x");
  let t = model.dayTasks("2026-09-29")[0];
  assert.equal(t.text, "hola #x");
  await A.toggleTask(t, true);
  t = model.dayTasks("2026-09-29")[0];
  assert.equal(t.done, true);
  await A.updateTask(t, "adiós\n  - con detalle");
  assert.match(disk.get("weeks/2026-W40.md"), /- \[x\] adiós\n  - con detalle\n/);
  await A.deleteTask(model.dayTasks("2026-09-29")[0]);
  assert.equal(model.dayTasks("2026-09-29").length, 0);
  await store.undo();
  assert.equal(model.dayTasks("2026-09-29").length, 1);
});

test("flow: move across weeks and into the inbox (file created on demand)", async () => {
  const a = model.dayTasks("2026-09-28")[0];
  await A.moveTask(a, { kind: "day", date: "2026-10-07" });
  assert.match(disk.get("weeks/2026-W41.md"), /## Miércoles · 2026-10-07\n\n- \[ \] a\n  - detalle a\n/);
  assert.ok(!/- \[ \] a/.test(disk.get("weeks/2026-W40.md")));
  const moved = model.dayTasks("2026-10-07")[0];
  await A.moveTask(moved, { kind: "inbox" });
  assert.match(disk.get("inbox.md"), /- \[ \] a\n  - detalle a\n/);
  await store.undo();
  assert.equal(model.dayTasks("2026-10-07").length, 1);
});

test("flow: reorder inside a day keeps sub-sections", async () => {
  const b = model.dayTasks("2026-09-28")[1];
  await A.moveTask(b, { kind: "day", date: "2026-09-28" }, 0);
  assert.match(disk.get("weeks/2026-W40.md"), /## Lunes · 2026-09-28\n\n- \[x\] b\n- \[ \] a\n  - detalle a\n/);
  await A.addTask({ kind: "day", date: "2026-09-30" }, "d");
  assert.match(disk.get("weeks/2026-W40.md"), /### Mañana\n- \[ \] c\n\n### Tarde\n- \[ \] d\n/);
});

test("flow: external edit between render and write is merged, not lost", async () => {
  const a = model.dayTasks("2026-09-28")[0];
  disk.set("weeks/2026-W40.md", disk.get("weeks/2026-W40.md").replace("# Semana 40\n", "# Semana 40\n\nNota externa\n"));
  await A.toggleTask(a, true);
  const txt = disk.get("weeks/2026-W40.md");
  assert.match(txt, /Nota externa/);
  assert.match(txt, /- \[x\] a/);
});

test("flow: overdue tasks move to today in order", async () => {
  const overdue = model.overdueTasks("2026-10-01");
  assert.deepEqual(overdue.map((t) => t.text), ["a", "c"]);
  await A.moveTasks(overdue, { kind: "day", date: "2026-10-01" });
  assert.deepEqual(model.dayTasks("2026-10-01").map((t) => t.text), ["a", "c"]);
});

test("flow: meetings are created from templates and moved when the project changes", async () => {
  await reset({ "projects/demo/README.md": "---\ntype: project\ntitle: Demo\n---\n", "templates/meeting.md": "---\ntype: meeting\ntitle: {{title}}\ndate: {{date}}\ntime: {{time}}\nproject: {{project}}\n---\n\n# {{title}}\n\nCustom\n" });
  const path = await A.createMeeting({ title: "Kickoff: fase 1", date: "2026-09-29", time: "", project: "demo" });
  assert.equal(path, "projects/demo/meetings/2026-09-29-kickoff-fase-1.md");
  const txt = disk.get(path);
  assert.match(txt, /title: "Kickoff: fase 1"/);
  assert.ok(!/^time:/m.test(txt));
  assert.match(txt, /Custom/);
  const np = await A.setProps(path, { project: null, date: "2026-10-02" });
  assert.equal(np, "meetings/2026-10-02-kickoff-fase-1.md");
  assert.match(disk.get(np), /date: 2026-10-02/);
  assert.ok(!/^project:/m.test(disk.get(np)));
});

/* ------------------------------------------------------------ meetings in the day plan */

test("flow: new meetings are placed in their day by time and can be reordered", async () => {
  await reset({ "weeks/2026-W40.md": WEEK.replace("- [ ] a\n", "- [ ] 09:00 a\n").replace("- [x] b", "- [x] 12:00 b") });
  const p = await A.createMeeting({ title: "Sync", date: "2026-09-28", time: "10:30" });
  assert.match(disk.get("weeks/2026-W40.md"), /- \[ \] 09:00 a\n  - detalle a\n- \[\[2026-09-28-sync\]\]\n- \[x\] 12:00 b/);
  const items = model.dayItems("2026-09-28");
  const ref = items.find((i) => i.type === "ref");
  assert.equal(ref.doc.path, p);
  assert.equal(model.unplacedMeetings("2026-09-28").length, 0);
  // drag the meeting to the top of the day
  await A.dropMeeting(p, ref, { kind: "day", date: "2026-09-28" }, 0);
  assert.match(disk.get("weeks/2026-W40.md"), /## Lunes · 2026-09-28\n\n- \[\[2026-09-28-sync\]\]\n- \[ \] 09:00 a/);
  // a task can be dropped above it
  const b = model.dayTasks("2026-09-28")[1];
  await A.moveTask(b, { kind: "day", date: "2026-09-28" }, 0);
  assert.match(disk.get("weeks/2026-W40.md"), /## Lunes · 2026-09-28\n\n- \[x\] 12:00 b\n- \[\[2026-09-28-sync\]\]/);
});

test("flow: dragging a meeting to another day reschedules it (file + frontmatter + plan)", async () => {
  const p = await A.createMeeting({ title: "Sync", date: "2026-09-28", time: "" });
  const ref = model.dayItems("2026-09-28").find((i) => i.type === "ref");
  await A.dropMeeting(p, ref, { kind: "day", date: "2026-09-30" }, 0);
  assert.ok(!disk.has(p));
  const np = "meetings/2026-09-30-sync.md";
  assert.match(disk.get(np), /date: 2026-09-30/);
  const w = disk.get("weeks/2026-W40.md");
  assert.ok(!/## Lunes · 2026-09-28\n\n- \[\[/.test(w));
  assert.match(w, /### Mañana\n- \[\[2026-09-30-sync\]\]\n- \[ \] c/);
  // changing the date from the properties dialog follows too; deleting removes the ref
  const np2 = await A.setProps(np, { date: "2026-10-01" });
  assert.match(disk.get("weeks/2026-W40.md"), /## Jueves · 2026-10-01\n\n- \[\[2026-10-01-sync\]\]\n/);
  await A.deleteDoc(np2);
  assert.ok(!/\[\[2026-10-01-sync\]\]/.test(disk.get("weeks/2026-W40.md")));
});

test("flow: unplaced meetings (created outside Panel) can be dropped into the plan", async () => {
  await reset({ "weeks/2026-W40.md": WEEK, "meetings/2026-09-28-x.md": "---\ntype: meeting\ntitle: X\ndate: 2026-09-28\n---\n" });
  assert.equal(model.unplacedMeetings("2026-09-28").length, 1);
  await A.dropMeeting("meetings/2026-09-28-x.md", null, { kind: "day", date: "2026-09-28" }, 1);
  assert.match(disk.get("weeks/2026-W40.md"), /- \[ \] a\n  - detalle a\n- \[\[2026-09-28-x\]\]\n- \[x\] b/);
  assert.equal(model.unplacedMeetings("2026-09-28").length, 0);
});

test("flow: several meeting templates", async () => {
  await reset({ "templates/meeting.md": "---\ntype: meeting\ntitle: {{title}}\n---\nDEFAULT\n", "templates/meeting-retro.md": "---\ntype: meeting\ntitle: {{title}}\n---\nRETRO {{weekday}}\n" });
  const list = A.listTemplates("meeting");
  assert.deepEqual(list.map((x) => x.label), ["Por defecto", "Retro"]);
  const p = await A.createMeeting({ title: "R", date: "2026-10-02", template: "templates/meeting-retro.md" });
  assert.match(disk.get(p), /RETRO viernes/);
  const p2 = await A.createTemplate("meeting", "1:1 semanal");
  assert.equal(p2, "templates/meeting-1-1-semanal.md");
  assert.match(disk.get(p2), /DEFAULT/);
});

test("flow: a meeting goes right after the last thing that happens before it", async () => {
  await reset({ "weeks/2026-W40.md": WEEK.replace("- [ ] a\n", "- [ ] 09:00 a\n") });
  await A.createMeeting({ title: "Tarde", date: "2026-09-28", time: "10:30" });
  assert.match(disk.get("weeks/2026-W40.md"), /- \[ \] 09:00 a\n  - detalle a\n- \[\[2026-09-28-tarde\]\]\n- \[x\] b/);
});
