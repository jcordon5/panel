// Files created for a brand-new vault (in the chosen language).

import { today, mondayOf, weekId } from "./util.js";
import { exists, create, write, content } from "./store.js";
import { weekTemplate, inboxTemplate } from "./ops.js";
import { builtinMeetingTemplate, builtinNoteTemplate, builtinProjectTemplate } from "./actions.js";
import { weekPath } from "./model.js";

const README = {
  es: `---
type: note
title: Cómo funciona esta bóveda
---

# Cómo funciona esta bóveda

Esta carpeta es tu base de conocimiento. **Todo son archivos Markdown normales**: puedes abrirlos con Panel, con cualquier editor de texto, con Obsidian o dárselos a un agente de IA. Panel solo los lee y los escribe.

## Estructura

\`\`\`
inbox.md                         Bandeja: tareas sin fecha
weeks/2026-W40.md                Una semana por archivo; una sección "## " por día
meetings/2026-09-29-titulo.md    Reuniones que no son de ningún proyecto
projects/<proyecto>/README.md    Ficha del proyecto (descripción, objetivos...)
projects/<proyecto>/meetings/    Reuniones del proyecto
projects/<proyecto>/*.md         Otros documentos del proyecto
notes/*.md                       Notas generales (el "Tablón"); pinned: true = fijada
series/<nombre>.md               Reuniones recurrentes (cada sesión es una reunión con series: <nombre>)
people/<nombre>.md               Fichas de personas: puesto, equipo, para qué acudir a ellas
knowledge/<titulo>.md            Conocimiento: procedimientos, recursos y datos
sources/*.md                     Lo que dejas para que tu IA lo procese (se borra al procesarlo)
routines.md                      Tus rutinas: «cuando diga X, haz Y»
templates/*.md                   Plantillas para reuniones, notas y proyectos
assets/                          Imágenes pegadas en las notas
\`\`\`

## Convenciones

- Cabecera YAML al principio de cada archivo: \`type\` (week, meeting, project, note, inbox), \`title\`, \`date\` (AAAA-MM-DD), \`time\` (HH:MM), \`project\`, \`attendees\`, \`tags\`, \`created\`, \`updated\`.
- Tareas: \`- [ ] pendiente\` y \`- [x] hecha\`. Los detalles van indentados (2 espacios) debajo de la tarea.
- Una hora al principio de la tarea (\`10:30 Llamar a Ana\`) se muestra como hora.
- \`#proyecto\` en una tarea la asocia a ese proyecto (el nombre de su carpeta).
- En los archivos de semana, cada día es \`## Lunes · 2026-09-28\`; la fecha ISO es lo que cuenta. El día es un plan ordenado: las reuniones aparecen como líneas \`- [[2026-09-28-nombre-reunion]]\` entre las tareas, en el momento en que ocurren.
- Plantillas: \`templates/meeting.md\` es la de por defecto; \`templates/meeting-retro.md\`, \`templates/meeting-1-1.md\`… son alternativas (igual con \`note\`).
- Enlaces entre notas: \`[[nombre-de-archivo]]\` o \`[[Título]]\`.
- Nombres de archivo: \`AAAA-MM-DD-titulo.md\` para reuniones; minúsculas y guiones.
- Una tarea que empieza por \`@Nombre\` es de otra persona: algo que esperas de ella.
- En una reunión, las secciones se reconocen por su título: *Para comentar* (lo que quieres sacar; sus casillas no son tareas), *Notas*, *Tareas*, *Decisiones* y *Resumen* (lo escribe tu IA al procesarla, y entonces pone \`processed: fecha\`).

## Para agentes de IA

Puedes leer y editar estos archivos directamente. Por ejemplo:

- **Tareas de hoy**: en \`weeks/<año>-W<semana ISO>.md\`, sección \`## ... · <fecha de hoy>\`.
- **Añadir una tarea**: una línea \`- [ ] texto\` al final de la sección del día (o en \`inbox.md\` si no tiene fecha). Si el archivo de la semana no existe, créalo con la misma estructura.
- **Crear una reunión**: archivo en \`meetings/\` (o \`projects/<p>/meetings/\`) a partir de \`templates/meeting*.md\`, y una línea \`- [[nombre-del-archivo]]\` en el plan de su día.
- **Resumir reuniones**: lee \`meetings/\` y \`projects/*/meetings/\`; la fecha está en \`date\`.
- **Acciones pendientes**: las líneas \`- [ ]\` de las reuniones (fuera de *Para comentar*).
- **Procesar reuniones y fuentes**: resumen, tareas, decisiones, fichas de personas y notas de conocimiento; después borra cada fuente usada.
- **Rutinas**: lee \`routines.md\` cuando el usuario use una de sus frases.
- La skill \`panel-vault\` de Panel explica el formato completo y trae un script que hace todo esto.
- Mantén la cabecera YAML y actualiza \`updated\` al modificar un archivo.
`,
  en: `---
type: note
title: How this vault works
---

# How this vault works

This folder is your knowledge base. **Everything is plain Markdown**: open it with Panel, any text editor, Obsidian, or hand it to an AI agent. Panel just reads and writes these files.

## Layout

\`\`\`
inbox.md                         Inbox: tasks without a date
weeks/2026-W40.md                One file per week; one "## " section per day
meetings/2026-09-29-title.md     Meetings that belong to no project
projects/<project>/README.md     Project overview (description, goals...)
projects/<project>/meetings/     Project meetings
projects/<project>/*.md          Other project documents
notes/*.md                       General notes (the board); pinned: true = pinned
series/<name>.md                 Recurring meetings (each session is a meeting with series: <name>)
people/<name>.md                 People cards: role, team, what to go to them for
knowledge/<title>.md             Knowledge: procedures, resources and facts
sources/*.md                     Things left for your AI to process (deleted once processed)
routines.md                      Your routines: "when I say X, do Y"
templates/*.md                   Templates for meetings, notes and projects
assets/                          Images pasted into notes
\`\`\`

## Conventions

- YAML frontmatter at the top of each file: \`type\` (week, meeting, project, note, inbox), \`title\`, \`date\` (YYYY-MM-DD), \`time\` (HH:MM), \`project\`, \`attendees\`, \`tags\`, \`created\`, \`updated\`.
- Tasks: \`- [ ] open\` and \`- [x] done\`. Details go indented (2 spaces) under the task.
- A leading time (\`10:30 Call Ana\`) is shown as the task time.
- \`#project\` in a task links it to that project (its folder name).
- In week files each day is \`## Monday · 2026-09-28\`; the ISO date is what matters. A day is an ordered plan: meetings appear as \`- [[2026-09-28-meeting-name]]\` lines among the tasks, where they happen.
- Templates: \`templates/meeting.md\` is the default; \`templates/meeting-retro.md\`, \`templates/meeting-1-1.md\`… are alternatives (same with \`note\`).
- Links between notes: \`[[file-name]]\` or \`[[Title]]\`.
- File names: \`YYYY-MM-DD-title.md\` for meetings; lowercase with dashes.
- A task that starts with \`@Name\` belongs to someone else: something you are waiting on.
- In a meeting, sections are recognised by their heading: *To discuss* (what you want to bring up; its checkboxes are not tasks), *Notes*, *Tasks*, *Decisions* and *Summary* (written by your AI when it processes the meeting, which then gets \`processed: date\`).

## For AI agents

You can read and edit these files directly. For example:

- **Today's tasks**: in \`weeks/<year>-W<ISO week>.md\`, section \`## ... · <today's date>\`.
- **Add a task**: a \`- [ ] text\` line at the end of that day's section (or in \`inbox.md\` when it has no date). If the week file does not exist, create it with the same structure.
- **Create a meeting**: a file in \`meetings/\` (or \`projects/<p>/meetings/\`) from \`templates/meeting*.md\`, plus a \`- [[file-name]]\` line in its day plan.
- **Summarise meetings**: read \`meetings/\` and \`projects/*/meetings/\`; the date is in \`date\`.
- **Pending actions**: the \`- [ ]\` lines inside meetings (outside *To discuss*).
- **Process meetings and sources**: summary, tasks, decisions, people cards and knowledge notes; then delete each source used.
- **Routines**: read \`routines.md\` when the user says one of their phrases.
- Panel's \`panel-vault\` skill documents the full format and has a script that does all of this.
- Keep the YAML frontmatter and update \`updated\` when you change a file.
`,
};

const WELCOME = {
  es: `---
type: note
title: Bienvenida a Panel
pinned: true
created: {{today}}
updated: {{today}}
---

# Bienvenida a Panel

Esto es una nota del **Tablón**. Pulsa **Editar** (o la tecla \`E\`) para cambiarla: la ves formateada mientras escribes y el Markdown solo aparece donde está el cursor. Se guarda sola.

## Lo básico

- [ ] Añade una tarea con la tecla \`N\` o el botón **Nueva tarea**
- [ ] Abre **Semana** y arrastra tareas de un día a otro
- [ ] Crea tu primer proyecto desde la barra lateral
- [ ] Registra una reunión con la tecla \`M\`; si se repite, márcalo y no tendrás que crearla cada vez
- [ ] Crea fichas de las personas con las que trabajas (tecla \`U\`)
- [ ] Busca lo que sea con \`Ctrl/⌘ + K\`

> [!tip] Consejo
> Escribe \`[[\` para enlazar otra nota, pega imágenes directamente en el editor y usa \`#proyecto\` en una tarea para asociarla a un proyecto.

| Formato | Se escribe |
| --- | --- |
| **Negrita** | \`**texto**\` |
| ==Resaltado== | \`==texto==\` |
| Tarea | \`- [ ] texto\` |

Todos tus datos están en la carpeta de la bóveda, como archivos \`.md\`. Lee [[README]] para ver cómo se organiza.
`,
  en: `---
type: note
title: Welcome to Panel
pinned: true
created: {{today}}
updated: {{today}}
---

# Welcome to Panel

This is a note on your **Board**. Press **Edit** (or the \`E\` key) to change it: it looks formatted while you write and the Markdown only shows where the cursor is. It saves itself.

## The basics

- [ ] Add a task with the \`N\` key or the **New task** button
- [ ] Open **Week** and drag tasks from one day to another
- [ ] Create your first project from the sidebar
- [ ] Log a meeting with the \`M\` key; if it repeats, say so and you won't have to create it every time
- [ ] Add cards for the people you work with (\`U\` key)
- [ ] Find anything with \`Ctrl/⌘ + K\`

> [!tip] Tip
> Type \`[[\` to link another note, paste images straight into the editor and use \`#project\` in a task to link it to a project.

| Format | You type |
| --- | --- |
| **Bold** | \`**text**\` |
| ==Highlight== | \`==text==\` |
| Task | \`- [ ] text\` |

All your data lives in the vault folder as \`.md\` files. Read [[README]] to see how it is organised.
`,
};

const ROUTINES = {
  es: `# Rutinas

Lo que mi IA hace cuando le digo estas frases. Cámbialas o añade las tuyas cuando quieras.

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
2. Lista lo que quedó sin hacer y propón a qué día moverlo (sin moverlo hasta que lo diga).

## «Revisión semanal»
Lo hecho, lo que se retrasó, decisiones de la semana, lo que espero de otros y lo de la semana que viene.
`,
  en: `# Routines

What my AI does when I say these phrases. Change them or add your own whenever you like.

## "Good morning"
1. Process what's pending (unprocessed meetings and sources).
2. Give me the day: meetings in order with what's open with each attendee, tasks, overdue
   and what I've been waiting on from others for more than 3 days.
3. Tell me the 3 most important things today.

## "Prepare the meeting with …"
What's open from the previous session, what the attendees owe me, their cards and the
project's context. Add to "To discuss" what I should bring up.

## "Prepare the next …"
Look at the last session, what's still open on each side, what I've done on the project since and what I'm owed,
and write it into "To discuss" of the next session ("Done: …", "Pending from …", "Still open on my side: …").

## "End of day"
1. Process today's meetings.
2. List what's left undone and suggest a day for each (don't move anything until I say so).

## "Weekly review"
What got done, what slipped, this week's decisions, what I'm waiting on and what's coming next week.
`,
};

async function ensure(path, text) {
  if (!exists(path) && content(path) === null) await create(path, text);
}

/** Create the standard files that are missing (never overwrites). */
export async function scaffold(lang, { welcome = true } = {}) {
  const l = README[lang] ? lang : "en";
  await ensure("README.md", README[l]);
  await ensure("inbox.md", inboxTemplate());
  await ensure("templates/meeting.md", builtinMeetingTemplate());
  await ensure("templates/note.md", builtinNoteTemplate());
  await ensure("templates/project.md", builtinProjectTemplate());
  await ensure("routines.md", ROUTINES[l]);
  const wk = weekPath(weekId(today()));
  await ensure(wk, weekTemplate(mondayOf(today())));
  if (welcome) await ensure(l === "es" ? "notes/bienvenida.md" : "notes/welcome.md", WELCOME[l].replace(/\{\{today\}\}/g, today()));
  void write;
}
