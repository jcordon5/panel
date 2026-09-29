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

## Para agentes de IA

Puedes leer y editar estos archivos directamente. Por ejemplo:

- **Tareas de hoy**: en \`weeks/<año>-W<semana ISO>.md\`, sección \`## ... · <fecha de hoy>\`.
- **Añadir una tarea**: una línea \`- [ ] texto\` al final de la sección del día (o en \`inbox.md\` si no tiene fecha). Si el archivo de la semana no existe, créalo con la misma estructura.
- **Crear una reunión**: archivo en \`meetings/\` (o \`projects/<p>/meetings/\`) a partir de \`templates/meeting*.md\`, y una línea \`- [[nombre-del-archivo]]\` en el plan de su día.
- **Resumir reuniones**: lee \`meetings/\` y \`projects/*/meetings/\`; la fecha está en \`date\`.
- **Acciones pendientes**: las líneas \`- [ ]\` de las reuniones.
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

## For AI agents

You can read and edit these files directly. For example:

- **Today's tasks**: in \`weeks/<year>-W<ISO week>.md\`, section \`## ... · <today's date>\`.
- **Add a task**: a \`- [ ] text\` line at the end of that day's section (or in \`inbox.md\` when it has no date). If the week file does not exist, create it with the same structure.
- **Create a meeting**: a file in \`meetings/\` (or \`projects/<p>/meetings/\`) from \`templates/meeting*.md\`, plus a \`- [[file-name]]\` line in its day plan.
- **Summarise meetings**: read \`meetings/\` and \`projects/*/meetings/\`; the date is in \`date\`.
- **Pending actions**: the \`- [ ]\` lines inside meetings.
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

Esto es una nota del **Tablón**. Pulsa **Editar** (o la tecla \`E\`) para cambiarla: a la izquierda escribes Markdown y a la derecha ves el resultado. Se guarda sola.

## Lo básico

- [ ] Añade una tarea con la tecla \`N\` o el botón **Nueva tarea**
- [ ] Abre **Semana** y arrastra tareas de un día a otro
- [ ] Crea tu primer proyecto desde la barra lateral
- [ ] Registra una reunión con la tecla \`M\`
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

This is a note on your **Board**. Press **Edit** (or the \`E\` key) to change it: write Markdown on the left and see the result on the right. It saves itself.

## The basics

- [ ] Add a task with the \`N\` key or the **New task** button
- [ ] Open **Week** and drag tasks from one day to another
- [ ] Create your first project from the sidebar
- [ ] Log a meeting with the \`M\` key
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
  const wk = weekPath(weekId(today()));
  await ensure(wk, weekTemplate(mondayOf(today())));
  if (welcome) await ensure(l === "es" ? "notes/bienvenida.md" : "notes/welcome.md", WELCOME[l].replace(/\{\{today\}\}/g, today()));
  void write;
}
