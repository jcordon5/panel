---
name: panel-vault
description: Read and update a Panel vault — a folder of Markdown files with weekly task plans (weeks/2026-W40.md), an inbox.md, meeting notes, projects and notes. Use this skill whenever the user asks about their tasks, day or week plan, agenda, meetings, meeting notes or action items, project status, or wants a daily/weekly brief, a recap or a summary of their work notes — and whenever they want to add, complete, reschedule or move tasks, or log a new meeting in their vault, even if they don't say "Panel" or "vault" (e.g. "what do I have tomorrow?", "resúmeme la semana", "turn today's meeting next steps into tasks").
---

# Panel vault

Panel is a local app that keeps tasks, meetings, projects and notes as plain Markdown in a folder (the *vault*). You can read and edit those files directly — the app picks up changes within seconds and never overwrites them. Your job is usually one of two things: **brief the user** from what's in the vault, or **change it** the way the Panel app would, so the files stay valid for the app, Obsidian and other agents.

## Find the vault

The vault is the folder containing `inbox.md`, `weeks/`, `meetings/`, `projects/`, `notes/`. Typical places: `./vault` next to Panel's `server.py`, the current folder, `$PANEL_VAULT`, or whatever the user says. If a `README.md` in the vault describes the layout, trust it.

## Layout

```
inbox.md                            tasks with no date yet
weeks/2026-W40.md                   one file per ISO week; one "## <Weekday> · YYYY-MM-DD" section per day
meetings/2026-09-29-sync.md         meetings that belong to no project
projects/<slug>/README.md           project overview (type: project, status: active|paused|done)
projects/<slug>/meetings/*.md       the project's meetings
projects/<slug>/*.md                other project documents
notes/*.md                          general notes ("Board"); pinned: true = pinned
templates/meeting.md, meeting-*.md  meeting templates (note.md / note-*.md for notes)
assets/                             pasted images
.trash/                             deleted files (ignore)
```

A day in a week file is the **plan of that day, in order**. It holds tasks and, as plain `- [[file-name]]` lines, the meetings of that day placed where they happen:

```markdown
## Martes · 2026-09-29

- [ ] 09:30 Daily del equipo
- [ ] Preparar la demo            ← things to do before the meeting
- [[2026-09-29-sync-con-el-proveedor-cloud]]
- [ ] Enviar acta #migracion-cloud
  - detail lines are indented under their task and move with it
```

Conventions worth knowing (the app relies on them):
- Every file starts with YAML frontmatter: `type` (week, meeting, project, note, inbox), `title`, `date`, `time`, `project`, `attendees`, `tags`, `created`, `updated`. Unknown keys must be kept.
- The ISO date in the day heading is what counts; the weekday word is decoration (can be Spanish or English — match the existing files).
- Tasks are `- [ ]` / `- [x]`. A leading `HH:MM` is the task time. `#<project-slug>` links a task to a project.
- A meeting's date comes from its `date` field (or the `YYYY-MM-DD-` file prefix). Open `- [ ]` lines inside meetings are **action items**.
- Links are `[[file-name]]` (without `.md`).

## Use the helper script

`scripts/panel_vault.py` (Python 3 standard library) reads and writes the vault exactly like the app does. Prefer it over hand-editing: it creates missing week files, inserts into the right day, keeps frontmatter and bumps `updated`, and orders meetings by time. Every listed item ends with `<path:line>` so you can open the source for detail.

```bash
python3 scripts/panel_vault.py --vault PATH day [DATE]        # plan of a day + overdue + inbox count
python3 scripts/panel_vault.py --vault PATH week [DATE]       # the whole week
python3 scripts/panel_vault.py --vault PATH overdue | inbox | projects
python3 scripts/panel_vault.py --vault PATH meetings --from -7 [--to DATE] [--project SLUG]
python3 scripts/panel_vault.py --vault PATH actions [--since -14] [--project SLUG]
python3 scripts/panel_vault.py --vault PATH project SLUG

python3 scripts/panel_vault.py --vault PATH add-task "Text #slug" --date tomorrow   # or --inbox
python3 scripts/panel_vault.py --vault PATH done "part of the task text" [--date D] [--reopen]
python3 scripts/panel_vault.py --vault PATH move "part of the text" --to 2026-10-06   # or --to-inbox
python3 scripts/panel_vault.py --vault PATH new-meeting --title "Retro" --date D --time 09:00 \
        [--project SLUG] [--attendees "Ana, Luis"] [--template retro] [--notes "..."]
```

Dates accept `YYYY-MM-DD`, `today`, `tomorrow`, `yesterday`, `+3`, `-7`. If `done`/`move` finds several matches it lists them — narrow the text or add `--date` rather than guessing. If Python isn't available, edit the files by hand following the conventions above.

## Briefs and summaries

Read first (`day`, `week`, `meetings`, `actions`, then open the meeting files you need), then write for the user in their language. Good briefs are short and actionable:

- **Daily brief**: the day in order (meetings with time, what to do before/after), overdue items, and the 2–3 things that matter most. Mention meeting action items that are still open.
- **Weekly recap**: what got done (checked tasks), what slipped, meetings held with their key decisions (read the *Decisions/Acuerdos* and *Next steps/Próximos pasos* sections), and what's coming next week.
- **Meeting recap**: attendees, decisions, and open action items with who/when if stated.
- **Project status**: description, recent meetings and decisions, planned tasks (`#slug`) and open action items, risks noted in the README.

Quote file names when it helps the user find things. Don't invent tasks, dates or decisions that aren't in the files.

## Changing the vault safely

- Edit the smallest thing possible; never rewrite a whole file just to change one line. Other tools may be editing too — re-read a file right before writing it.
- Keep the frontmatter intact and set `updated: <today>` on files you change.
- New tasks go at the end of their day (or into `inbox.md` when undated) unless the user says where. Keep a task's indented details with it when moving it.
- New meetings: `meetings/YYYY-MM-DD-slug.md` or `projects/<slug>/meetings/…`, filled from `templates/meeting*.md`, and placed in the day plan as `- [[file-name]]`. The script does all of that.
- Turning meeting next steps into tasks: add them as tasks on the chosen day and mention the source, e.g. `- [ ] Pedir presupuesto #migracion-cloud (de [[2026-09-29-sync-con-el-proveedor-cloud]])`. Leave the original action items in the meeting untouched unless asked.
- Don't delete files; if the user wants something removed, move it to `.trash/` or ask.
- After changing things, tell the user briefly what you changed and where.
