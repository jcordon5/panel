# Everyday requests

The user talks to you in plain words; you turn it into the right change in the vault, using Panel's format so everything stays linked. The aim: the user never has to file, tidy or cross-check by hand.

## The contract (every time you write)

- **Tasks** start with a verb and say what, so they can be acted on tomorrow without context: `- [ ] Send Ana the updated quote #proyecto-alfa`.
- **Project**: if it is about a project, add `#slug` (see `projects`). If you can't tell which one and it matters, ask once.
- **People**: a task for someone else starts with `@Name` (the user is waiting on them). Mention people by the name on their card. If a person matters and has no card, create it (`add-person`) with whatever is known.
- **Dates**: a stated day goes to that day ("on Thursday" → that date); "tomorrow", "next week" → that day / its Monday; no date → today if it's for now, otherwise the inbox. Never invent deadlines.
- **Sources**: when something comes from a meeting or document, link it (`[[file-name]]`) in knowledge notes and person notes.
- **Order in the day**: a day plan is read top to bottom as the day goes. Never just append: place each task where it would be done (see *Placing tasks in a day*).
- **One home per fact**: search before creating; update the existing note, card or task instead of duplicating.
- Report in one or two lines what you changed and where.

## "Remind me…", "I have to…", "note down…"

`add-task "verb + what #project" --date D` (or `--inbox`). If it's for someone else: `add-task "@Name what" --date D`. Several things at once → several tasks, each in its place in the day (below).

## Placing tasks in a day

A day in Panel is a list in the order things happen: meetings at their time, tasks between them. Before adding or moving anything into a day, run `day D` (items are numbered) and put each task where it belongs:

- **Before the meeting it serves**: preparing, reviewing material, getting data for it → `--before "meeting words"`. If it takes a while, leave a gap (put it before the previous meeting, or first thing).
- **After the meeting that triggers it**: minutes, follow-ups, sending what was promised → `--after "meeting words"`.
- **In a free slot**: short tasks fit between two meetings → `--at HH:MM` (it lands among the meetings and timed tasks by time). Something with a fixed time ("call at 16:00") → `--time 16:00` (writes the time on the task too).
- **Focused work** (writing, analysis): in the longest free stretch, usually away from meeting-heavy parts of the day.
- **Low priority / "when you can"**: at the end of the day (no option = end) or in the inbox if it has no day.
- **Dependencies**: if B needs A, A goes first (`--after "A words"` for B).
- Several tasks at once: decide the whole order first, then add them (or chain them with `--after` the previous one). Same for `move` and `plan`, which take the same options.
- If the day is already full (back-to-back meetings, many open tasks), say so and propose another day instead of piling on.
- Report where each one went in a few words ("before the sync", "after lunch, between the two meetings", "at the end").

`--at` only knows the times of meetings and timed tasks; to put something next to an untimed task, use `--before`/`--after` with its words or number.

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

The result is a **script the user can glance at during the call and read out naturally** — not a list of fragments. If they have to stop to decode a line, or it raises something already settled, it failed.

1. `prepare "X"` (a recurring meeting by name, or a past meeting to follow up). Read every section of its output; it separates **NEWS** (closed since last time), **STILL OPEN** on the user's side and on others' side, **NOT DISCUSSED**, and context. Check anything doubtful before using it (`find-task`, the meeting note): never put on the agenda something that is already closed, unless it is news to report once.
2. Look at what happened between the two sessions: tasks done on the project since then, notes and decisions in other meetings with the same people, new knowledge. That is what makes the script useful.
3. The session note: if it doesn't exist yet, `new-session "X" --date D`.
4. Write the script into its agenda (`write SESSION --section agenda --text -`), replacing nothing the user wrote:

   ```markdown
   - [ ] **Network ticket** — It's open since Tuesday; networking still has to approve it.
     - Ask Luis: can he push for approval this week?
   - [ ] **Managed service quote** — I asked the vendor on Monday; no answer yet. I'll chase them tomorrow.
   - [ ] **Framework contract (Ana)** — Ana, do you have it reviewed? We need it to close the quote.
   - [ ] **Decide** — Pilot date: 15 Nov or wait for the network change?
   - [ ] **Close** — Recap: Luis → approval this week; me → quote by Friday; Ana → contract. Next: Thursday 10:30.
   ```

   - One topic per line: **bold short topic** — one sentence in first person, as the user would say it, with the fact needed (date, number, who) right there.
   - At most one indented sub-line, only for the question to ask or the data to show.
   - Order: news (what I did / what got closed) → what I need from others → decisions to take → **Close**. Keep it to what fits the meeting (usually 4–8 lines).
   - **Always end with a Close line**: the agreements to recap, who does what by when, and the next meeting — so the user can wrap up on time without long silences.
   - Plain words; no task ids, no file names, no "[[links]]", no "Pending from X:" prefixes, no copying task text verbatim when a natural sentence reads better.
5. Tell the user in 2–3 lines where things stand and what the key point of the meeting is.

## "Plan my week / my day"

`week`, `overdue`, `waiting`, `actions`, `pending`. Propose a distribution (what goes where and why: deadlines, meetings that day, what unblocks others) **and the order inside each day**, following *Placing tasks in a day*. Apply it (`move`, `plan`, `add-task` with `--before`/`--after`/`--at`) only after the user agrees.

## "What do I know about…", "who…", "where…", "how…"

`search`, `knowledge`, `people`, `person`, `docs`. Answer briefly with citations (`[[file]]` or path). If you had to dig it out of a meeting or a source and it is reusable, offer to save it as knowledge.
