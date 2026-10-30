# Processing meetings and sources

Goal: after a day of meetings the user should not have to re-read notes, rewatch recordings or "make tasks to make tasks". You turn what they captured (quick notes, transcripts, emails, chats) into a summary, complete tasks and decisions, up-to-date people cards and reusable knowledge — then clean up the sources.

## 1. See what is pending

```bash
python3 scripts/panel_vault.py --vault PATH pending
```

Process meetings oldest first. Sources attached to a meeting (`meeting:` field) are processed with that meeting; the rest on their own (step 4).

## 2. For each meeting

```bash
python3 scripts/panel_vault.py --vault PATH meeting REF
```

This prints the note, the attendees with their roles, attached sources, the previous session of the series with its open tasks, and what the attendees owe the user. Read the attached sources (they are Markdown files) and, if useful, the project README and `person NAME` of key attendees.

Then write, in the vault's language:

**Summary** — `write REF --section summary --text "…"`. 3–8 bullet points a colleague who wasn't there would understand: the situation, what changed, what was agreed, what is blocked and by whom, dates. Use the notes' own facts; expand the user's shorthand with context from the sources, previous session and project, but never add facts that aren't in any of them. If notes and transcript disagree, prefer the transcript and mention the doubt.

**Tasks** — the user's notes may have missed some. From the transcript/notes, add what is clearly an action:
- for the user: `- [ ] text` (concrete verb, enough context to act tomorrow without re-reading; add `#project` if the meeting has one and the task is about it);
- for someone else: `- [ ] @Name text` (the user waits on them).
Append with `write REF --section tasks`. Don't duplicate existing lines; don't re-add tasks that are already done.

**Decisions** — `write REF --section decisions` for agreements that are not already listed.

**Open questions** (`- ? …` in the notes) — if the answer is in the vault (`search`), add it to the summary with a citation; otherwise add a task to find out (`- [ ] Ask X about …`).

**People** — for each attendee or person mentioned:
- no card yet and they matter (they owe something, they own a topic, the user will deal with them again) → `add-person` with role/team if known;
- something new learned (new role, takes over a topic, "ask her for X") → append a dated line to their card's notes, or update `role`/`team`/`ask_for` in the frontmatter.
Don't create cards for one-off mentions.

**Knowledge** — only what stays true and useful *after* this meeting, for any future situation: how something is done (howto), where something is (resource), a general rule, contact or number worth remembering (fact). Most meetings produce **none**; that is the normal case.

- **Never a summary, recap, status or outcome of the meeting** — that is the meeting's own `summary` section. "The pilot is two weeks late", "we agreed to review costs", "Ana will send the contract" are *not* knowledge (status, decision and task: they go in the meeting, its tasks and the project).
- Test before saving: *would this help someone in six months, in a different meeting, who never saw this one?* and *can it be said in 1–3 sentences without mentioning this meeting?* If not, skip it.
- Examples that **are** knowledge: "Purchase orders over a threshold need the finance director's approval", "The deployment checklist lives in the ops wiki", "Network changes are requested through the infrastructure ticket queue".
- One topic per note, short (a sentence to a few lines; a howto can be numbered steps). Title it by the topic ("How to request a network change"), never by the meeting or date.
- `search` / `knowledge` first and update the existing note instead of creating a near-duplicate; otherwise `add-knowledge` with `--source "[[meeting-file]]"` and `--people` of who knows about it.
- When in doubt, don't create it: mention it in the report as a possible knowledge note and let the user decide.

**Project** — if the meeting changes the project's state and its README has a status/decisions section, append a dated line.

Finish with:
```bash
python3 scripts/panel_vault.py --vault PATH mark-processed REF
python3 scripts/panel_vault.py --vault PATH source-done sources/<each source used>.md
```

## 3. Quality bar

- Faithful: everything traceable to the notes, a source or the vault. When unsure, say so in the summary ("unclear whether…").
- Useful tomorrow: tasks start with a verb and name the thing; summaries name people and dates.
- Short: no filler, no repeating the notes back.
- The user's notes stay as they are (fix nothing in them; add the summary on top).

## 4. Sources without a meeting

- **Email / chat**: requests to the user → tasks (with the sender as context: "Reply to Ana about …"); requests the user made to others → `@Name` tasks; facts and how-tos → knowledge; new people → cards.
- **Document / note**: project context, and knowledge notes only for the reusable procedures, locations and rules it contains (one per topic) — never a summary of the document.
- Then `source-done`.

## 5. Report

Tell the user, briefly: which meetings were processed (one line each), the tasks created for them (so they can plan them — in Panel, by dragging them to a day or from the task menu), new people cards and knowledge notes, and anything unclear that needs their input. Don't plan their tasks for them unless they ask.
