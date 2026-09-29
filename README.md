<div align="center">

<img src="app/favicon.svg" width="64" alt="">

# Panel

**Tasks, meetings, projects and notes on top of a folder of Markdown files.**
Local-first, no accounts, no cloud, no install. Works on Windows, macOS and Linux.

[Español](README.es.md) · [Quick start](#quick-start) · [How the vault works](#the-vault) · [For AI agents](#made-for-ai-agents-too)

<img src="docs/img/week.png" alt="Week board" width="100%">

</div>

---

Panel is for people who can't (or don't want to) use Notion or Obsidian at work but still want a
comfortable place to plan the week, take meeting notes and keep a small knowledge base.

Everything you do in Panel is written to plain `.md` files in a folder you own — **your vault**.
Open it with any text editor, sync it with whatever you like, read it with Obsidian, or hand it to an AI agent.
Panel is just a nice window onto those files.

## Features

- **Week board** — one column per day plus your inbox. Drag tasks between days, reorder them, click to edit.
  Meetings live *inside* the day plan, so you can put the things to do before a meeting above it and the rest below.
  Dragging a meeting to another day reschedules it. Overdue tasks can be brought to today with one click.
- **Today** — today's tasks, overdue ones, today's meetings, the next days at a glance and the open action items from your meetings.
- **Quick add from anywhere** — press <kbd>N</kbd>, type one task per line, pick *Today / Tomorrow / Inbox / any date* and optionally a project.
- **Meetings** — create one with <kbd>M</kbd> and start writing straight away. Several templates (retro, 1:1, interview…): pick one when creating the meeting, edit them in *Settings → Templates*.
  `- [ ]` lines in a meeting become action items that show up on Today and on the project page.
- **Projects** — overview (README), meetings, tasks (anything tagged `#project` plus open items in its docs) and documents.
  Mark a project as *paused* or *done* and it leaves the sidebar; it stays on the Projects page (and can be reopened any time).
- **Calendar** — month view with meetings and task load; drop a task on a day to reschedule it.
- **Board** — general notes as cards; pin the important ones.
- **Great Markdown** — tables, callouts (`> [!tip]`), `[[wikilinks]]` with autocomplete, `#tags`, `==highlights==`, code blocks, images (paste or drop them into the editor), interactive checkboxes everywhere.
- **Editor** with live preview, autosave, list continuation, <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Enter</kbd> to toggle a task.
- **Your calendar** (Outlook desktop on Windows, or any `.ics` link): meetings appear on their own; one click to take notes.
- **One-line install, one-click updates**, export/backup of the vault, choose where it lives (OneDrive, Dropbox…).
- **Search everything** with <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd>: files, content and commands.
- **Undo** (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd>) for every change, and deletes go to a `.trash` folder inside the vault — nothing is ever destroyed.
- **Safe with other tools**: if a file changes on disk (Obsidian, a script, an AI agent) Panel notices within seconds and never overwrites those changes.
- Light & dark mode, English & Spanish, keyboard shortcuts (<kbd>?</kbd>), works on small screens.

<table>
<tr>
<td><img src="docs/img/today.png" alt="Today"></td>
<td><img src="docs/img/meeting.png" alt="Meeting notes"></td>
</tr>
<tr>
<td><img src="docs/img/editor.png" alt="Editor with live preview"></td>
<td><img src="docs/img/calendar.png" alt="Calendar"></td>
</tr>
<tr>
<td><img src="docs/img/project.png" alt="Project"></td>
<td><img src="docs/img/week-dark.png" alt="Dark mode"></td>
</tr>
</table>

## Install

**Windows** — open *PowerShell* and paste (no admin rights needed; if Python is missing it downloads a private copy):

```powershell
irm https://raw.githubusercontent.com/jcordon5/panel/main/install.ps1 | iex
```

**macOS / Linux** — open a terminal and paste:

```bash
curl -fsSL https://raw.githubusercontent.com/jcordon5/panel/main/install.sh | sh
```

That's it: Panel opens in your browser and you get a *Panel* shortcut (Desktop + Start menu on Windows,
`~/Applications/Panel.command` on macOS, the applications menu on Linux). Share those two lines with anyone who wants to try it.

<details>
<summary>Manual install (ZIP)</summary>

1. Download the [latest release](../../releases/latest) (or `git clone`) and unzip it anywhere.
2. Start it: **Windows** double-click `panel.bat` · **macOS** double-click `panel.command` (first time: right-click → *Open*) · **Linux** `./panel.sh`.

You need Python 3.7+ (built into macOS/Linux; on Windows from [python.org](https://www.python.org/downloads/), ticking *“Add python.exe to PATH”*).
</details>

Panel runs at `http://127.0.0.1:8765`. The first time you choose the language and Panel creates your vault.
Keep the small terminal window open (minimised is fine) while you use it.

Want to look around first? `python3 server.py --demo` opens a throw-away vault full of sample data.

### Updates

Panel checks GitHub for a new version when it starts. When there is one, click **Update** (sidebar, or *Settings → Updates*):
it backs up your vault into `backups/`, replaces only the app code (your vault, settings and backups are never touched) and restarts itself.
If you installed with `git clone`, it runs `git pull` instead. Updates keep the vault format backwards compatible — when the format
evolves, Panel migrates your files safely (a backup is always made first).

### Your data: sync, export, move to another computer

- *Settings → Vault* lets you choose where the vault lives. Put it in **OneDrive, Dropbox, iCloud or Syncthing** and it is synced across computers.
- **Export vault (.zip)** downloads everything; **Back up now** keeps a copy in `backups/`.
- Moving computers = install Panel, copy the vault folder (or unzip the export) and point *Settings → Vault* at it.

### Calendar (Outlook, Google, iCloud…)

In *Settings → Calendar*:

- **Outlook desktop (Windows)** — reads the classic Outlook app on your computer (recurring meetings included). Nothing to configure.
- **.ics links** — Outlook on the web (*Settings → Calendar → Shared calendars → Publish a calendar → ICS*), Google Calendar
  (*Secret address in iCal format*), iCloud, Nextcloud… or a path to an `.ics` file.

Your meetings then show up by themselves in *Today*, *Week* and *Calendar*. Click one and Panel creates the meeting note (title, time,
attendees, location) and places it in your day plan. Panel only reads calendars; it never changes them.

### Options

```bash
python3 server.py --vault ~/Documents/work-notes   # use any folder as the vault
python3 server.py --port 9000                       # another port
python3 server.py --no-browser                      # don't open the browser
```

The same settings can live in `panel.config.json` next to `server.py` (see `panel.config.example.json`)
or in the `PANEL_VAULT` / `PANEL_PORT` environment variables.

## The vault

```
vault/
├── README.md                         how the vault is organised (for humans and AIs)
├── inbox.md                          tasks without a date
├── weeks/2026-W40.md                 one file per ISO week, one "## " section per day
├── meetings/2026-09-29-sync.md       meetings that belong to no project
├── projects/<project>/README.md      project overview
├── projects/<project>/meetings/…     project meetings
├── projects/<project>/*.md           other project documents
├── notes/*.md                        general notes (the Board)
├── templates/meeting.md …            templates you can customise
└── assets/2026-09/…                  pasted images
```

A week file is just Markdown:

```markdown
---
type: week
week: 2026-W40
start: 2026-09-28
---

# Week 40 · 28 Sep – 4 Oct 2026

## Monday · 2026-09-28

- [x] 09:30 Team daily
- [ ] Prepare the sprint retro #team
  - [ ] Gather metrics

## Tuesday · 2026-09-29

- [ ] Call the bank
```

Conventions:

- **Frontmatter** (YAML) with `type` (`week`, `meeting`, `project`, `note`, `inbox`), `title`, `date`, `time`, `project`, `attendees`, `tags`, `created`, `updated`. Unknown keys are preserved.
- **Tasks** are `- [ ]` / `- [x]`; anything indented below a task is its detail (sub-items, subtasks, notes) and travels with it.
- A leading time (`10:30 Call Ana`) is shown as the task time. `#project-folder` links a task to a project.
- Day headings contain the ISO date — that's what Panel reads, the weekday name is just for humans.
- A `- [[meeting-file]]` line inside a day places that meeting in the day plan (Panel adds it when you create a meeting and keeps it in sync when the meeting is renamed or rescheduled).
- Templates live in `templates/`: `meeting.md` / `note.md` are the defaults and `meeting-<name>.md` / `note-<name>.md` are extra ones. They use `{{title}}`, `{{date}}`, `{{time}}`, `{{project}}`, `{{attendees}}`, `{{today}}`.

It is fully compatible with Obsidian: open the vault folder there and everything just works.

### Coming from Panel v1 (`boveda/`)

Copy your old `boveda` folder **next to `server.py`** (e.g. `%LOCALAPPDATA%\Panel\boveda` if you used the Windows installer)
before the first start. Panel detects it and offers to **migrate** it.
The old folder is never modified — everything is copied into the new layout (weeks, projects, meetings, board notes, `tareas.md` → `inbox.md`).
You can also run it by hand: `python3 tools/migrate_v1.py path/to/boveda path/to/vault es`.

## Made for AI agents too

Because the vault is structured, plain Markdown, any AI agent that can read files can work with it:
*“summarise this week's meetings”*, *“what's pending on project X?”*, *“plan my tasks for tomorrow”*,
*“turn the next steps of today's meeting into tasks for Thursday”*.
The vault's own `README.md` explains the conventions to the agent, and Panel picks up the agent's edits live.

**Skill for Claude (and other agents):** [`skills/panel-vault`](skills/panel-vault) teaches an agent the vault format and ships a small
script (`panel_vault.py`, standard library only) to read the day/week, list meetings and action items, get a project status, and add, complete or
move tasks and create meetings exactly like the app does.

- Claude Code: copy the folder to `~/.claude/skills/panel-vault` (or `.claude/skills/` inside a project).
- Claude apps: zip the folder (or use a released `panel-vault.skill`) and add it in *Settings → Capabilities → Skills*.
- Other agents: point them to `skills/panel-vault/SKILL.md`.

## Mobile

The interface is responsive and works on a phone's browser, but Panel runs on your computer (`127.0.0.1`), so the phone can't
reach it yet. On the roadmap: an optional *LAN mode* (use it from your phone on the same Wi-Fi) and a hosted web app that keeps
the vault in a private Git repository — no Panel server needed, same Markdown files.

## Privacy & security

- The server only listens on `127.0.0.1` — it's not reachable from other machines.
- Requests from other websites are rejected (custom header + Host check), so a web page cannot read or write your vault.
- Files can only be read/written inside the vault. The only outbound requests are the update check (GitHub) and the calendars you configure.
- Rendered Markdown is sanitised (no raw HTML or `javascript:` links); vault files are served in a sandbox.

## Development

No build step and no dependencies: the app is plain HTML/CSS/ES modules in `app/`, the server is `server.py` (standard library).
[marked](https://github.com/markedjs/marked) (MIT) is vendored in `app/vendor/`.

```bash
python3 server.py --demo      # run with sample data
npm test                      # = node --test tests/*.test.js && python3 -m unittest discover -s tests
```

```
server.py            local HTTP server + JSON API (read, write with etags, move, trash, upload)
app/js/model.js      parses the vault: docs, projects, weeks, tasks
app/js/ops.js        pure text operations on Markdown (move/insert/extract task blocks)
app/js/actions.js    undoable operations (tasks, meetings, notes, projects)
app/js/store.js      file cache, conflict-safe writes, undo, polling
app/js/views/        one module per screen
tools/               v1 migration and demo generator
```

Contributions are welcome — translations especially (`app/js/strings.js`).

## License

[MIT](LICENSE)
