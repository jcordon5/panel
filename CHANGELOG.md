# Changelog

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
