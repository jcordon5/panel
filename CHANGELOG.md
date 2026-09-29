# Changelog

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
