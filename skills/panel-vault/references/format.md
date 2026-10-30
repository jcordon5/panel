# Panel vault format

Plain Markdown with YAML frontmatter. Readable by people, the Panel app, Obsidian and agents. Unknown frontmatter keys are always kept. File names: lowercase, words joined with `-`, no accents (`ana-garcia.md`). Links: `[[file-name]]` without `.md`. All examples below are generic.

Contents: [Weeks and tasks](#weeks-and-tasks) · [Meetings](#meetings) · [Recurring meetings](#recurring-meetings-series) · [People](#people) · [Knowledge](#knowledge) · [Documents](#documentsmd) · [Projects](#projects) · [Sources](#sources) · [routines.md](#routinesmd) · [Migrating existing notes](#migrating-existing-notes)

## Weeks and tasks

`weeks/2026-W44.md` — one file per ISO week, one section per day. The ISO date in the heading is what counts; the weekday word is decoration in the vault's language.

```markdown
---
type: week
week: 2026-W44
start: 2026-10-26
---

# Semana 44 · 26 oct – 1 nov 2026

## Jueves · 2026-10-29

- [ ] 09:00 Revisar el informe #proyecto-alfa
- [[2026-10-29-seguimiento-alfa]]          ← a meeting, placed where it happens
- [ ] @Ana enviar el presupuesto            ← waiting on Ana
- [[2026-10-28-seguimiento-alfa#^k3x9pa]]   ← an action item of a meeting, planned for this day
  - details are indented under their line and move with it
```

- `- [ ]` / `- [x]`; a leading `HH:MM` is the time; `#slug` links the task to `projects/<slug>/`.
- **`@Name` at the start** = a task for someone else (the user is waiting on them). `Name` is a person's first name, alias or file name; for full names use `@[[Ana García]]`.
- `inbox.md`: tasks without a date, same syntax.
- A ` ^abc123` at the end of a task line is a block id that a day plan links to (`[[file#^abc123]]`): the task stays in its meeting and the day only points at it. Keep it when editing.

## Meetings

`meetings/2026-10-29-seguimiento-alfa.md`, or `projects/<slug>/meetings/…` for a project's meetings.

```markdown
---
type: meeting
title: Seguimiento Alfa
date: 2026-10-29
time: "10:30"
project: proyecto-alfa
attendees: [Ana García, Luis Pérez, Proveedor]
series: seguimiento-alfa          # when it is a session of a recurring meeting
processed: 2026-10-29             # set once the summary is written (by you)
---

# Seguimiento Alfa

## Resumen
- The pilot is two weeks late because a supplier delivery slipped; new date: 15 Nov.
- Agreed to compare the managed service's cost before deciding.

## Para comentar
- [x] Pilot delay                 ← agenda: ticked when discussed (NOT action items)
- [ ] Holidays in December        ← not discussed: carried to the next session

## Notas
- the pilot slips another week
- ? who approves the budget       ← "? " = an open question

## Tareas
- [ ] Prepare a summary for management          ← the user's
- [ ] @Ana review the framework contract         ← someone else's

## Decisiones
- The demo moves to Friday
```

Sections are recognised by their heading, in any language and with the names people use in their own templates: **summary** (Resumen, Acta, Summary, Minutes) · **agenda** (Para comentar, Comentar, Agenda, To discuss) · **notes** (Notas, Apuntes, Notes) · **tasks** (Tareas, Acciones, Próximos pasos, Tasks, Action items, Next steps — "Tareas para mí" too) · **decisions** (Decisiones, Acuerdos, Decisions). Older meetings without these sections are valid; when you add to them, `write` creates the section in the right place.

- `attendees` are names as written; each resolves to a person card by title, alias, file name or unique first name. Names without a card are fine.
- Notes are written live in meeting mode, often terse: `! x` became a task, `@Name x` a task for Name, `> x` a decision, `? x` a question. Keep them; the summary goes on top.
- Open `- [ ]` lines outside the agenda are **action items**; the day plan can link to them (`plan`).

## Recurring meetings (series)

`series/seguimiento-alfa.md` — the rule; each session is a normal meeting note with `series: seguimiento-alfa`, created when the user opens it in Panel (or with `new-meeting` + adding `series:`).

```markdown
---
type: series
title: Seguimiento Alfa
repeat: weekly          # daily | weekdays | weekly | monthly
days: [tue, thu]        # weekly: which days (mon … sun)
interval: 2             # every 2 weeks (default 1)
nth: 1                  # monthly on the 1st (2, 3, 4, -1 = last) weekday in `days`; omit = same date each month
start: 2026-11-03
until: 2027-06-30       # optional
skip: [2026-12-24]      # cancelled sessions
time: "10:30"
attendees: [Ana García, Luis Pérez]
project: proyecto-alfa
template: templates/meeting-seguimiento.md   # optional
status: paused          # optional: no new sessions
---

# Seguimiento Alfa

What this meeting is for, how it runs, useful links.
```

Unticked agenda items of the last session are copied into the next one.

## People

`people/ana-garcia.md`

```markdown
---
type: person
title: Ana García
role: Responsable de compras
team: [Compras, Proyecto Alfa]   # one team or several
org: Acme
email: ana.garcia@example.com
phone:
aliases: [Ana, AG]
ask_for: [contratos con proveedores, presupuestos]
---

# Ana García

Free notes: how they like to work, context, history. Add dated lines with their source:
- 2026-10-29: takes over the supplier contracts from January ([[2026-10-29-seguimiento-alfa]])
```

A whole team can be an attendee: `attendees: [Equipo Compras, Luis Pérez]` (also `Compras team`, or just the team name) means everyone whose `team` includes it. The `meeting` command lists who that is.

Panel shows on their page what they owe the user (`@Ana` tasks), their meetings, recurring meetings and related knowledge — computed, never written into the file.

## Knowledge

`knowledge/dar-de-alta-un-proveedor.md` — one small note per thing worth remembering.

```markdown
---
type: knowledge
kind: howto                 # howto = how to do something · resource = where something is · fact = something to remember
title: Cómo dar de alta a un proveedor
project: proyecto-alfa      # optional
people: [Ana García]        # who knows about it / who told
source: "[[2026-10-29-seguimiento-alfa]]"   # or a URL, or "email from Ana, 2026-10-12"
tags: [compras]
---

# Cómo dar de alta a un proveedor

1. Ask the supplier for their tax details and a bank certificate.
2. Fill in the supplier form and attach the documents.
3. Purchasing reviews it in about three days.
```

- **howto**: numbered steps, prerequisites, who to ask, pitfalls. **resource**: the link(s) and what is there. **fact**: one or two sentences.
- A resource that is a file can say where it is with `location: "C:\\Templates\\report.docx"` (or a URL): Panel shows an *Open* button. Links like `[report](file:///C:/Templates/report.docx)` in any note open the file too.
- One topic per note; update an existing note instead of creating a near-duplicate (search first). Add `updated` changes as dated lines if the knowledge changed.

## documents.md

Folders with useful documents that live outside the vault (company templates, guides, shared documentation). One folder per list line; Panel lists their files by name (Knowledge → Documents) and opens them with their own app; `docs "words"` finds them. Nothing is copied into the vault. Edited from Settings → Vault or by hand.

```markdown
---
type: documents
title: Documentos
---

# Documentos

Carpetas con documentos útiles que viven fuera de la bóveda.

- C:\Users\me\OneDrive - Acme\Plantillas
- /Users/me/Documents/Guías
```

## Projects

`projects/<slug>/README.md` with `type: project`, `title`, `status: active|paused|done`, `color`, and optionally `code` (a short word such as `ABC`). A task or note belongs to the project when it has `#<slug>`, `#<code>` or the code as a whole word, or lives in the project folder; `tasks --project` and `find-task --project` follow the same rule. The body is the project's living context: goal, who is who, state, decisions, risks, links. Keep a "## Estado" / "## Status" or "## Decisiones" section up to date when processing meetings if the project has one (append dated lines; don't rewrite what the user wrote).

## Sources

`sources/2026-10-29-chat-seguimiento.md` — created by Panel when the user drops or pastes something (Teams/Zoom transcript, `.eml`/`.msg` email, chat, notes). Temporary: **delete each one with `source-done` once its content is in the right places.**

```markdown
---
type: source
kind: transcript            # transcript | email | chat | document | note
title: Seguimiento Alfa
date: 2026-10-29
from: "Ana García <ana.garcia@example.com>"   # emails
meeting: "[[2026-10-29-seguimiento-alfa]]"   # when it belongs to a meeting
project: proyecto-alfa
---

# Seguimiento Alfa

**Ana García:** …
```

## routines.md

At the vault root. The user's own triggers; follow them literally. Template (use the vault's language):

```markdown
# Rutinas

Lo que mi IA hace cuando le digo estas frases. Puedo cambiarlas cuando quiera.

## «Buenos días»
1. Procesa lo pendiente (reuniones sin procesar y fuentes).
2. Dame el día: reuniones en orden con lo abierto con cada asistente, tareas, atrasadas
   y lo que espero de otros desde hace más de 3 días.
3. Dime las 3 cosas más importantes de hoy.

## «Prepara la reunión de …»
Lo abierto de la sesión anterior, lo que me deben los asistentes, sus fichas y el contexto
del proyecto. Añade a «Para comentar» lo que debería sacar yo.

## «Prepara la siguiente …»
Mira la última sesión, qué quedó abierto de cada uno, qué he hecho desde entonces en el proyecto y qué me deben,
y escríbelo en «Para comentar» de la próxima sesión («Hecho: …», «Pendiente de …», «Abierto por mi parte: …»).

## «Cierre del día»
1. Procesa las reuniones de hoy.
2. Lista lo que quedó sin hacer y propón a qué día moverlo (sin moverlo hasta que diga).

## «Revisión semanal»
Lo hecho, lo que se retrasó, decisiones de la semana, lo que espero de otros y lo de la semana que viene.
```

## Migrating existing notes

The user may have unstructured notes (a "useful stuff" note, a table of people, a long project context note, meeting notes in old templates). Nothing needs migrating to keep working: old files stay valid. When the user asks to tidy up:

1. **Read and propose first**: list the people cards, knowledge notes and project updates you would create, with their titles. Wait for a yes.
2. **People**: one card per person (`add-person`), with role, team, `ask_for` from what the notes say they handle, and the rest as notes. Check `people` first to avoid duplicates; use the exact names used in meeting attendees (or add those as `aliases`).
3. **Knowledge**: split a catch-all note into one note per topic (`add-knowledge`) with the right kind; keep links and wording; set `source` to the original note.
4. **Project context**: move project-wide context into the project's README sections (append, don't overwrite).
5. **Leave the original** with a line at the top: `> Migrated to [[...]], [[...]] on YYYY-MM-DD` — or move it to `.trash/` only if the user says so.
6. Meetings in old templates need no change; Panel recognises their sections.
