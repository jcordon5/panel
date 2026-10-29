# Everyday requests

The user talks to you in plain words; you turn it into the right change in the vault, using Panel's format so everything stays linked. The aim: the user never has to file, tidy or cross-check by hand.

## The contract (every time you write)

- **Tasks** start with a verb and say what, so they can be acted on tomorrow without context: `- [ ] Send Ana the updated quote #proyecto-alfa`.
- **Project**: if it is about a project, add `#slug` (see `projects`). If you can't tell which one and it matters, ask once.
- **People**: a task for someone else starts with `@Name` (the user is waiting on them). Mention people by the name on their card. If a person matters and has no card, create it (`add-person`) with whatever is known.
- **Dates**: a stated day goes to that day ("on Thursday" → that date); "tomorrow", "next week" → that day / its Monday; no date → today if it's for now, otherwise the inbox. Never invent deadlines.
- **Sources**: when something comes from a meeting or document, link it (`[[file-name]]`) in knowledge notes and person notes.
- **One home per fact**: search before creating; update the existing note, card or task instead of duplicating.
- Report in one or two lines what you changed and where.

## "Remind me…", "I have to…", "note down…"

`add-task "verb + what #project" --date D` (or `--inbox`). If it's for someone else: `add-task "@Name what" --date D`. Several things at once → several tasks.

## "I did…", "we've finished…", "log that…"

1. `find-task "key words"` (also with `--project slug`). Read the hits.
2. If an open task is clearly the same thing: `done PATH:LINE` (use the exact location the command printed). If it was planned for a later day, also `move` it to today, so the plan shows when it really happened. A meeting's action item is closed in its meeting (`done` does that).
3. If several tasks are covered by what was done, close each one.
4. If nothing matched, record it: `log "what was done #project"` (a checked task on today, for traceability).
5. If it unblocks or answers something someone was waiting for, say so.

When the user is working with you on something else (e.g. code in a repository) and says "log what we did", summarise the work as one line per real outcome, then do steps 1–4 with the project that repository belongs to (ask once if unsure).

## "I learned that…", "to do X you have to…", "the document for Y is at…"

Knowledge. `knowledge "topic"` / `search` first.
- procedure → `add-knowledge --kind howto` with numbered steps (or add the missing step to the existing note);
- where something is (link, folder, document) → `--kind resource` (for files in the document folders, give the path; `docs "name"` finds them);
- a rule, number or fact → `--kind fact`.
Add `--people` (who knows / who said it) and `--source`.

## "X handles…", "X is the new…", "ask X about…"

`person-set "X" --role … --team … --ask-for "topic" --note "what was learned" --source "[[meeting]]"`. No card yet → `add-person` first. A change of owner may also be worth a line in the related knowledge note or project README.

## "We decided…"

In the meeting it came from (`write REF --section decisions`), and a dated line in the project README's decisions/status section if it changes the project.

## "Prepare the next X meeting", "what should I bring up with…"

1. `prepare "X"` (a recurring meeting by name, or a past meeting to follow up). It shows the last session (summary, notes, decisions, what was left to discuss), the state of its tasks now, what was done on the project since then, what is still open, and what the attendees owe.
2. The session note: if it doesn't exist yet, `new-session "X" --date D` (it carries over the undiscussed items).
3. Write the agenda (`write SESSION --section agenda --text "…"`), one line each, short:
   - `- [ ] Done: <what was closed since last time>` — the user's tasks from last session that are done, and project work logged since;
   - `- [ ] Pending from Ana: <task>` — what others owe;
   - `- [ ] Still open on my side: <task>` — the user's open tasks from last session (so they can give status);
   - `- [ ] Follow up: <open question / unresolved point>`;
   Skip what is already in the agenda. Don't add new topics the user didn't have; they add those.
4. Give the user a 3–5 line brief of where things stand.

## "Plan my week / my day"

`week`, `overdue`, `waiting`, `actions`, `pending`. Propose a distribution (what goes where and why: deadlines, meetings that day, what unblocks others). Apply it (`move`, `plan`, `add-task`) only after the user agrees.

## "What do I know about…", "who…", "where…", "how…"

`search`, `knowledge`, `people`, `person`, `docs`. Answer briefly with citations (`[[file]]` or path). If you had to dig it out of a meeting or a source and it is reusable, offer to save it as knowledge.
