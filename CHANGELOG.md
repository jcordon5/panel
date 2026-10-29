# Changelog

## 3.0.0 — 2026-10-29

Panel becomes a work memory: be in the meeting, let your AI do the paperwork.

- **Meeting mode**: agenda to tick off, quick notes (`!` your task, `@Name` someone else's, `>` decision, `?` question), tasks and
  decisions in view, and context — what's still open from the previous session and what the attendees owe you. Sections of your own
  templates show up too.
- **Recurring meetings** (`series/`): daily, weekdays, every N weeks on chosen days, monthly by date or by Nth weekday, with usual
  attendees. Sessions appear on their day and are created when you join, carrying over what was left to discuss.
- **People** (`people/`): cards with role, team and what to go to them for; their meetings and what they owe you. An attendee picker
  everywhere, and the names in your meetings without a card, created in one click.
- **Knowledge** (`knowledge/`): procedures, resources and facts, linked to projects and people.
- **Waiting on others**: a task starting with `@Name` belongs to someone else; shown in Today, on their card and in meetings.
- **For your AI**: drop or paste transcripts (.vtt, .docx), emails (.eml, Outlook .msg) or chats into `sources/`; Today lists what is
  waiting to be processed. Obvious secrets are hidden before saving.
- **Documents outside the vault**: list the folders with your templates and guides (`documents.md`, Settings → Vault); Panel lists and
  opens them (Knowledge → Documents, `file:` links, `location:` in knowledge notes) and your AI finds them with `docs`.
- **Everyday requests to your AI**: "remind me…", "we finished…" (closes the related task or logs it as done), "I learned…", "X handles…",
  "prepare the next X" (last session, open items on each side, work done since → the agenda). New commands: `find-task`, `log`, `tasks`,
  `person-set`, `prepare`, `new-session`, `docs`. *Prepare with AI* in recurring meetings copies the request.
- Tasks without syntax: *Project, person and tags…* in the task menu, and person/tags in *New task* (typing `@Ana #project` still works).
- Attachments for your AI are shown in the meeting itself, with *Add transcript* on the meeting note too.
- *Documents* has its own place in the sidebar (shortcut `D`) and documents show up in search.
- A time field you can type any way ("930", "9:30") or pick; Today's side column is shorter; sub-items of a done task are struck through.
- **Skill v2**: process meetings and sources (summary, tasks, decisions, people, knowledge; sources deleted once used), answer from memory
  with citations, prepare meetings, follow your `routines.md`. New script commands: `pending`, `meeting`, `write`, `mark-processed`,
  `source-done`, `people`, `person`, `knowledge`, `search`, `waiting`, `series`, `add-person`, `add-knowledge`.
- **Desktop only**: the web app and its browser storages (folder, GitHub, demo) are gone; panel.yous.dev is now a download page.
  `python3 server.py --demo` keeps the sample vault.
- Backwards compatible: existing vaults work as they are. Meeting sections are recognised by name in your own templates; old meetings
  are not flagged as unprocessed.

## 2.5.0 — 2026-10-27

- New editor with **live preview**, like Obsidian: notes look formatted while you write, and the Markdown of whatever is under the
  cursor shows up so you can edit it (headings, bold, links, `[[links]]`, tasks with real checkboxes, tables, images, code…).
  Also a Markdown source mode and a reading mode. Built on CodeMirror 6 (vendored, still no build step): search with Ctrl/⌘+F,
  `[[` autocompletion, lists continue on Enter.
- The editor opens where you were reading (double-click a paragraph to edit right there) instead of jumping to the end.
- **Encrypted backups** (*Settings → Backups*): one file with the whole vault, encrypted in the browser with your password
  (AES-256-GCM, PBKDF2-SHA256). Restore with the password (replaced files go to `.trash`) or save it as a plain .zip.
  Optional daily automatic copy to a folder you choose (desktop version and folder mode), e.g. a OneDrive folder for an
  encrypted copy in the cloud. A remembered password is kept as an encrypt-only key.

## 2.4.0 — 2026-10-19

- Plan meeting action items: drag them from *Meeting actions* (Today, or under the inbox in Week) onto a day, or use
  *Plan for → Today / Tomorrow / Next week / Pick a date* in their menu. The task stays in the meeting notes and the day
  links to it (`- [[meeting#^id]]`, Obsidian block links): checking it in either place is the same checkbox, and it can
  be moved between days like any task, or taken out of the plan.
- Editing a task no longer drops its time (`09:30 …`).
- Agent skill: `plan` command, and planned actions show up in `day`, `week`, `overdue` and `actions`.

## 2.3.2 — 2026-10-04

- Updates and calendar links work behind company proxies: if Python can't connect (HTTPS inspection, unreachable certificate
  revocation server) Panel retries with the system's `curl`, which uses the operating system's certificates.
- If a network blocks GitHub release downloads, the update is downloaded from the release tag's source archive on github.com
  (the same code).

## 2.3.1 — 2026-10-01

- Back and forward buttons at the top (desktop and phone) that say where they take you, like a browser inside the app; also Alt+←/→.
  Leaving the editor with "Done" doesn't add an extra step.
- Web app moved to https://panel.yous.dev.
- Phones: the start screen fits, no zoom when typing, the week opens on today.
- GitHub vaults: the editor saves every ~45 s instead of on every pause (fewer commits).
- The web app's offline cache always fetches fresh files past CDN caches.

## 2.3.0 — 2026-09-29

- **Web app** at https://jcordon5.github.io/panel/ — nothing to install. Keep the vault in a folder on your computer (Chrome/Edge/Brave)
  or in a private GitHub repository (every device, phones included, full history). Installable as an app (PWA), works offline.
- "Try it with sample data" demo mode (in memory).
- Downloads: `Panel-Windows.zip` includes Python — unzip and double-click `panel.bat`. `panel.zip` for macOS/Linux. Built automatically for every release.
- Backups clean themselves up (last 5 automatic, 10 manual, 2 previous app versions).
- Export the vault as .zip from the browser too.
- README rewritten: why Panel, use cases, comparison, privacy.

## 2.2.0 — 2026-09-29

- Calendar: Outlook desktop (Windows, via COM) and any .ics link/file (Outlook web, Google, iCloud…), with recurring events, exceptions and time zones. Events show up in Today/Week/Calendar; one click creates the meeting note and places it in the day plan.
- Updates: checks GitHub releases on start, one-click update (vault backup first, only app code replaced, automatic restart); `git pull` for git clones.
- Vault: choose its folder from Settings (OneDrive/Dropbox…), export as .zip, manual backups.
- One-line installers: `install.ps1` (Windows, downloads a private Python if needed, shortcuts) and `install.sh` (macOS/Linux).
- Settings reorganised in tabs. Meetings are placed right after the last thing that happens before them.

## 2.1.0 — 2026-09-29

- Meetings are part of the day plan: `- [[meeting]]` lines in week files, placed by time when created, draggable among tasks; dragging to another day reschedules the meeting. Renames/date changes/deletes keep the plan in sync.
- Several meeting and note templates (`templates/meeting-*.md`), template picker in the new meeting/note dialogs, template management in Settings.
- Paused/done projects: link from the sidebar to the Projects page.
- Fixed: long pages (notes, busy days, calendar panel) could not be scrolled.
- New `skills/panel-vault`: a skill + helper script so AI agents can brief you and update the vault safely.

## 2.0.0 — 2026-09-29

Complete rewrite.

- New interface: Today, Inbox, Week board, Calendar, Meetings, Board (notes), Projects; light/dark mode; English/Spanish.
- Week board with drag & drop between days, inline editing, task menu (move to today / tomorrow / next week / inbox / any date).
- Quick add from anywhere (N) with date and project; overdue tasks can be moved to today in one click.
- Real Markdown rendering (tables, callouts, wikilinks, tags, highlights, images) with interactive checkboxes.
- Editor with live preview, autosave, list continuation, [[link]] autocomplete, image paste/drop.
- Global search / command palette (Ctrl/⌘+K), keyboard shortcuts, undo for every change.
- New vault layout (ISO week files, projects with README + meetings, notes, templates, assets) documented for humans and AI agents.
- Conflict-safe writes (etags), live reload of external changes, deletes go to `.trash`.
- Cross-platform launchers (Windows, macOS, Linux), `--vault`, `--port`, `--demo`, `panel.config.json`.
- Automatic migration from the v1 `boveda/` layout.
