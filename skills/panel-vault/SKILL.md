---
name: panel-vault
description: The user's work memory — a Panel vault of plain Markdown with their week plans, meetings (one-off and recurring), people, knowledge notes (procedures, resources, facts), projects, notes and sources waiting to be processed. Use this skill whenever the user asks about their day, week, tasks, meetings, people, projects or anything they may have noted or learned at work ("how do I…", "who handles…", "where is…", "what did we decide with…"), wants a brief, a recap or a meeting prepared, says "process my meetings" / "process what's pending", wants to add, plan, move or complete tasks, log a meeting, or clean up and migrate their notes — even if they don't say "Panel" or "vault" (e.g. "¿qué tengo mañana?", "buenos días", "¿a quién le pido esto?", "procesa la reunión de hoy").
---

# Panel vault — the user's work memory

Panel keeps tasks, meetings, people, knowledge and projects as plain Markdown in a folder (the *vault*). The Panel app shows it visually; you read and write the same files. Changes appear in the app within seconds and the app never overwrites them.

Your job: **keep the memory structured and up to date so the user can spend their time doing, not organising**. Turn raw meeting notes and captured sources into summaries, tasks and knowledge; brief and prepare them; answer questions from what is written, citing where it is.

## Find the vault

The folder that contains `inbox.md`, `weeks/`, `meetings/`… Usually `vault/` next to Panel's `server.py`, `$PANEL_VAULT`, the current folder, or where the user says. Its `README.md` describes it.

## Layout

```
inbox.md                       tasks without a date
weeks/2026-W44.md              one file per ISO week; "## <Weekday> · YYYY-MM-DD" per day = that day's plan, in order
meetings/YYYY-MM-DD-title.md   meetings (projects/<slug>/meetings/ for a project's)
series/<name>.md               recurring meetings (repeat rule, usual attendees); each session is a normal meeting with `series: <name>`
people/<name>.md               one card per person: role, team, what to ask them for, notes
knowledge/<title>.md           small notes of what was learned: kind howto | resource | fact
projects/<slug>/README.md      project overview and context
notes/*.md                     free notes
sources/*.md                   things captured for you to process (transcripts, emails, chats); delete once used
routines.md                    the user's routines: "when I say X, do Y"
templates/                     templates for meetings and notes
```

Full format of every file, and how to migrate unstructured notes into it: **[references/format.md](references/format.md)**.

## Rules

1. **Nothing invented.** Every fact comes from a file; cite it as `[[file-name]]` or the path. If it isn't written, say so.
2. **You only read and write the vault.** Never send messages, emails or invitations, and never act in other apps on the user's behalf.
3. **Small, safe edits.** Use the script (it keeps frontmatter, bumps `updated` and writes atomically). Never rewrite a whole file to change a part; never remove what the user wrote; re-read before writing.
4. **The user's language and words.** Write in the language of the vault, briefly, without corporate filler.
5. **Ask before big changes** (migrations, merging or deleting notes). Processing sources and meetings is expected and needs no confirmation.
6. Keep `^blockid` endings and `[[links]]` intact when editing lines.

## Routines

Before acting on a short trigger ("buenos días", "cierre del día", "prepara la semana"…) read `routines.md` at the vault root and follow the matching routine. If it doesn't exist and the user wants routines, create it from the template in [references/format.md](references/format.md#routinesmd) and let them edit it.

## Common jobs

**Process what's pending** ("procesa mis reuniones", "procesa lo pendiente") → follow **[references/processing.md](references/processing.md)**. In short: `pending`, then for each meeting `meeting REF`, write a summary, complete tasks and decisions, update people and knowledge, `mark-processed`, `source-done` each source used, and report.

**Answer from memory** ("¿cómo se pide…?", "¿quién lleva…?", "¿dónde está…?", "¿qué acordamos con…?") → `search "words"` (try synonyms), `knowledge`, `people`, `person NAME`; open the hits; answer briefly with citations. If the answer was buried in a meeting or source and is reusable, offer to save it as a knowledge note.

**Prepare a meeting** → `meeting REF` (or the series' next session): open items from the previous session, what attendees owe (`waiting NAME`), their cards, the project's README and related knowledge. Add the points to bring up to its agenda (`write REF --section agenda --text "- [ ] …"`) and give the user a 5-line brief.

**Daily brief** → `day`, `waiting`, `pending`. The day in order (meetings with time and what's open with their attendees), overdue, what others owe them for more than a few days, and the 2–3 things that matter most.

**Weekly review** → `week`, `meetings --from -7`, `actions --since -7`, `waiting`: done, slipped, decisions, open loops, next week.

**Tasks** → `add-task`, `done`, `move`, `plan` (a meeting's action item on a day without copying it). A task for someone else starts with `@Name`; it is something the user is waiting on.

**Migrate / tidy** the user's own notes into people, knowledge and projects → [references/format.md#migrating-existing-notes](references/format.md#migrating-existing-notes). Propose the plan first, then do it in small steps.

## Script

`scripts/panel_vault.py` (Python 3, standard library only). Every listed item ends with `<path:line>`.

```bash
P="python3 scripts/panel_vault.py --vault PATH"
$P day [DATE] | week [DATE] | overdue | inbox | projects | project SLUG
$P meetings [--from -7] [--to D] [--project SLUG]
$P actions [--since -14] [--project SLUG]        # open action items for the user
$P pending [--since -14]                       # meetings to process (last 2 weeks by default) + sources
$P meeting REF                                 # a meeting in full: sections, attendees with roles, sources, previous session
$P people [QUERY] | person NAME | waiting [NAME] | knowledge [QUERY] | series
$P search "words" [--limit 12]

$P add-task "Text #project" --date tomorrow    # or --inbox; "@Name text" = waiting on Name
$P done "part of the text" [--date D] [--reopen]
$P move "part of the text" --to D              # or --to-inbox
$P plan "part of a meeting action" --date D
$P new-meeting --title T --date D [--time HH:MM] [--project SLUG] [--attendees "A, B"] [--template NAME]
$P write REF --section summary|agenda|notes|tasks|decisions --text "- line\n- line"   # or --text - (stdin)
$P mark-processed REF
$P source-done sources/FILE.md
$P add-person --name "Full Name" [--role R] [--team T] [--org O] [--email E] [--aliases "A, B"] [--ask-for "x, y"] [--notes TEXT]
$P add-knowledge --title T --kind howto|resource|fact [--project SLUG] [--people "A, B"] [--source "[[meeting]]"] [--tags "a, b"] --body TEXT
```

Dates: `YYYY-MM-DD`, `today`, `tomorrow`, `yesterday`, `+3`, `-7`. `REF` is a path, a file name or part of a meeting title. When a command finds several matches it lists them: narrow it instead of guessing. Without Python, edit the files by hand following references/format.md.
