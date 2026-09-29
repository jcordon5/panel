<div align="center">

<img src="app/favicon.svg" width="64" alt="">

# Panel

**Tareas, reuniones, proyectos y notas sobre una carpeta de archivos Markdown.**
Local, sin cuentas, sin nube, sin instalar nada. Funciona en Windows, macOS y Linux.

[English](README.md) · [Empezar](#empezar) · [Cómo es la bóveda](#la-bóveda) · [Para agentes de IA](#pensado-también-para-agentes-de-ia)

<img src="docs/img/week.png" alt="Tablero semanal" width="100%">

</div>

---

Panel nace para quien no puede (o no quiere) usar Notion u Obsidian en el trabajo pero quiere un sitio cómodo
para planificar la semana, tomar notas de reuniones y mantener una pequeña base de conocimiento.

Todo lo que haces en Panel se guarda en archivos `.md` normales dentro de una carpeta tuya — **tu bóveda**.
Puedes abrirla con cualquier editor de texto, sincronizarla como quieras, leerla con Obsidian o dársela a un agente de IA.
Panel es solo una ventana bonita a esos archivos.

## Qué hace

- **Tablero semanal**: una columna por día más la bandeja. Arrastra tareas entre días, reordénalas y haz clic para editarlas.
  Las reuniones van *dentro* del plan del día: pon encima lo que quieres tener hecho antes y debajo lo de después.
  Arrastrar una reunión a otro día la reprograma. Las atrasadas se traen a hoy con un clic.
- **Hoy**: tareas del día, atrasadas, reuniones de hoy, los próximos días de un vistazo y las acciones pendientes de tus reuniones.
- **Añadir desde cualquier sitio**: pulsa <kbd>N</kbd>, escribe una tarea por línea y elige *Hoy / Mañana / Bandeja / cualquier fecha* y, si quieres, un proyecto.
- **Reuniones**: crea una con <kbd>M</kbd> y empieza a escribir. Varias plantillas (retro, 1:1, entrevista…): elige una al crear la reunión y edítalas en *Ajustes → Plantillas*.
  Las líneas `- [ ]` de una reunión son acciones que aparecen en Hoy y en el proyecto.
- **Proyectos**: resumen (README), reuniones, tareas (lo etiquetado con `#proyecto` y lo pendiente en sus documentos) y documentos.
  Si marcas un proyecto como *en pausa* o *terminado* sale de la barra lateral, pero sigue en la página Proyectos (y se puede reabrir cuando quieras).
- **Calendario** mensual con reuniones y carga de tareas; suelta una tarea en un día para cambiarla de fecha.
- **Tablón**: notas generales en tarjetas; fija las importantes.
- **Markdown de verdad**: tablas, avisos (`> [!tip]`), `[[enlaces]]` con autocompletado, `#etiquetas`, `==resaltado==`, código, imágenes (pégalas o arrástralas al editor) y checkboxes que funcionan en todas partes.
- **Editor** con vista previa en vivo, guardado automático, continuación de listas y <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Enter</kbd> para marcar tareas.
- **Tu calendario** (Outlook de escritorio en Windows o cualquier enlace `.ics`): las reuniones aparecen solas; un clic para tomar notas.
- **Instalación en una línea y actualización con un clic**, exportación/copia de la bóveda y elección de dónde vive (OneDrive, Dropbox…).
- **Búsqueda global** con <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd>: archivos, contenido y acciones.
- **Deshacer** (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd>) cualquier cambio; lo borrado va a la carpeta `.trash` de la bóveda — nunca se pierde nada.
- **Convive con otras herramientas**: si un archivo cambia en disco (Obsidian, un script, un agente de IA), Panel lo detecta en segundos y nunca pisa esos cambios.
- Modo claro y oscuro, español e inglés, atajos de teclado (<kbd>?</kbd>) y adaptado a pantallas pequeñas.

<table>
<tr>
<td><img src="docs/img/today.png" alt="Hoy"></td>
<td><img src="docs/img/meeting.png" alt="Notas de reunión"></td>
</tr>
<tr>
<td><img src="docs/img/editor.png" alt="Editor con vista previa"></td>
<td><img src="docs/img/search.png" alt="Búsqueda"></td>
</tr>
</table>

## Instalar

**Windows** — abre *PowerShell* y pega (no necesita permisos de administrador; si no tienes Python descarga una copia privada):

```powershell
irm https://raw.githubusercontent.com/jcordon5/panel/main/install.ps1 | iex
```

**macOS / Linux** — abre un terminal y pega:

```bash
curl -fsSL https://raw.githubusercontent.com/jcordon5/panel/main/install.sh | sh
```

Y ya: Panel se abre en el navegador y tienes un acceso directo *Panel* (Escritorio y menú Inicio en Windows,
`~/Applications/Panel.command` en macOS, menú de aplicaciones en Linux). Comparte esas dos líneas con quien quiera probarlo.

<details>
<summary>Instalación manual (ZIP)</summary>

1. Descarga la [última versión](../../releases/latest) (o haz `git clone`) y descomprímela donde quieras.
2. Arráncalo: **Windows** doble clic en `panel.bat` · **macOS** doble clic en `panel.command` (la primera vez: clic derecho → *Abrir*) · **Linux** `./panel.sh`.

Necesitas Python 3.7+ (viene en macOS/Linux; en Windows desde [python.org](https://www.python.org/downloads/) marcando *“Add python.exe to PATH”*).
</details>

Panel funciona en `http://127.0.0.1:8765`. La primera vez eliges el idioma y Panel crea tu bóveda.
Deja abierta la ventanita de la terminal (minimizada vale) mientras lo uses.

¿Quieres curiosear antes? `python3 server.py --demo` abre una bóveda temporal con datos de ejemplo.

### Actualizaciones

Panel mira en GitHub si hay versión nueva al arrancar. Si la hay, pulsa **Actualizar** (barra lateral o *Ajustes → Actualizaciones*):
hace copia de tu bóveda en `backups/`, sustituye solo el código (tu bóveda, ajustes y copias no se tocan) y se reinicia solo.
Si lo instalaste con `git clone`, hace `git pull`. Las actualizaciones mantienen el formato de la bóveda compatible; si algún día
evoluciona, Panel migra tus archivos de forma segura (siempre con copia previa).

### Tus datos: sincronizar, exportar, cambiar de ordenador

- En *Ajustes → Bóveda* eliges dónde vive la bóveda. Ponla en **OneDrive, Dropbox, iCloud o Syncthing** y la tendrás sincronizada entre ordenadores.
- **Exportar bóveda (.zip)** descarga todo; **Hacer copia ahora** guarda una copia en `backups/`.
- Cambiar de ordenador = instalar Panel, copiar la carpeta de la bóveda (o descomprimir la exportación) y elegirla en *Ajustes → Bóveda*.

### Calendario (Outlook, Google, iCloud…)

En *Ajustes → Calendario*:

- **Outlook de escritorio (Windows)** — lee el Outlook clásico de tu ordenador (incluidas las reuniones periódicas). Sin configurar nada.
- **Enlaces .ics** — Outlook web (*Configuración → Calendario → Calendarios compartidos → Publicar un calendario → ICS*), Google Calendar
  (*Dirección secreta en formato iCal*), iCloud, Nextcloud… o la ruta a un archivo `.ics`.

Tus reuniones aparecen solas en *Hoy*, *Semana* y *Calendario*. Un clic en una y Panel crea su nota (título, hora, asistentes y lugar)
y la coloca en el plan del día. Panel solo lee los calendarios, nunca los modifica.

### Opciones

```bash
python3 server.py --vault ~/Documentos/notas-trabajo   # cualquier carpeta como bóveda
python3 server.py --port 9000                          # otro puerto
python3 server.py --no-browser                         # sin abrir el navegador
```

Lo mismo se puede poner en `panel.config.json` junto a `server.py` (mira `panel.config.example.json`)
o en las variables de entorno `PANEL_VAULT` / `PANEL_PORT`.

## La bóveda

```
vault/
├── README.md                         cómo se organiza la bóveda (para personas e IAs)
├── inbox.md                          tareas sin fecha (Bandeja)
├── weeks/2026-W40.md                 un archivo por semana ISO, una sección "## " por día
├── meetings/2026-09-29-sync.md       reuniones que no son de ningún proyecto
├── projects/<proyecto>/README.md     ficha del proyecto
├── projects/<proyecto>/meetings/…    reuniones del proyecto
├── projects/<proyecto>/*.md          otros documentos del proyecto
├── notes/*.md                        notas generales (el Tablón)
├── templates/meeting.md …            plantillas personalizables
└── assets/2026-09/…                  imágenes pegadas
```

Un archivo de semana es Markdown sin más:

```markdown
---
type: week
week: 2026-W40
start: 2026-09-28
---

# Semana 40 · 28 sep – 4 oct 2026

## Lunes · 2026-09-28

- [x] 09:30 Daily del equipo
- [ ] Preparar la retro #equipo
  - [ ] Recopilar métricas

## Martes · 2026-09-29

- [ ] Llamar al banco
```

Convenciones:

- **Cabecera YAML** con `type` (`week`, `meeting`, `project`, `note`, `inbox`), `title`, `date`, `time`, `project`, `attendees`, `tags`, `created`, `updated`. Las claves que no conoce las respeta.
- **Tareas**: `- [ ]` / `- [x]`; lo indentado debajo es su detalle (subtareas, notas) y se mueve con ella.
- Una hora al principio (`10:30 Llamar a Ana`) se muestra como hora. `#carpeta-del-proyecto` asocia la tarea a un proyecto.
- Los títulos de día llevan la fecha ISO — es lo que lee Panel; el nombre del día es para las personas.
- Una línea `- [[archivo-de-reunion]]` dentro de un día coloca esa reunión en el plan del día (Panel la añade al crear la reunión y la mantiene al día si la renombras o cambias de fecha).
- Las plantillas están en `templates/`: `meeting.md` / `note.md` son las de por defecto y `meeting-<nombre>.md` / `note-<nombre>.md` son alternativas. Admiten `{{title}}`, `{{date}}`, `{{time}}`, `{{project}}`, `{{attendees}}`, `{{today}}`.

Es 100 % compatible con Obsidian: abre la carpeta allí y funciona tal cual.

### Si vienes de Panel v1 (`boveda/`)

Copia tu carpeta `boveda` **junto a `server.py`** (por ejemplo `%LOCALAPPDATA%\Panel\boveda` si usaste el instalador de Windows)
antes de arrancar por primera vez. Panel la detecta y ofrece **migrarla**.
La carpeta original no se toca — todo se copia al formato nuevo (semanas, proyectos, reuniones, tablón, `tareas.md` → `inbox.md`).
También a mano: `python3 tools/migrate_v1.py ruta/a/boveda ruta/a/vault es`.

## Pensado también para agentes de IA

Como la bóveda es Markdown estructurado, cualquier agente de IA que lea archivos puede trabajar con ella:
*“resúmeme las reuniones de esta semana”*, *“¿qué tengo pendiente del proyecto X?”*, *“planifícame mañana”*,
*“convierte los próximos pasos de la reunión de hoy en tareas para el jueves”*.
El `README.md` de la propia bóveda le explica las convenciones al agente, y Panel muestra sus cambios al momento.

**Skill para Claude (y otros agentes):** [`skills/panel-vault`](skills/panel-vault) le enseña a un agente el formato de la bóveda e incluye un pequeño
script (`panel_vault.py`, solo librería estándar) para leer el día o la semana, listar reuniones y acciones pendientes, ver el estado de un proyecto,
y añadir, completar o mover tareas y crear reuniones igual que lo hace la app.

- Claude Code: copia la carpeta a `~/.claude/skills/panel-vault` (o a `.claude/skills/` dentro de un proyecto).
- Apps de Claude: comprime la carpeta en un zip (o usa un `panel-vault.skill` publicado) y añádela en *Ajustes → Capacidades → Skills*.
- Otros agentes: apúntales a `skills/panel-vault/SKILL.md`.

## Móvil

La interfaz es responsive y funciona en el navegador del móvil, pero Panel corre en tu ordenador (`127.0.0.1`), así que el móvil
aún no puede llegar a él. En la hoja de ruta: un *modo red local* opcional (usarlo desde el móvil en la misma Wi-Fi) y una web
alojada que guarda la bóveda en un repositorio Git privado — sin servidor de Panel, con los mismos archivos Markdown.

## Privacidad y seguridad

- El servidor solo escucha en `127.0.0.1`: no es accesible desde otros equipos.
- Rechaza peticiones de otras webs (cabecera propia + comprobación de Host): ninguna página puede leer ni escribir tu bóveda.
- Solo lee/escribe dentro de la bóveda. Las únicas conexiones externas son la comprobación de actualizaciones (GitHub) y los calendarios que configures.
- El Markdown se sanea (sin HTML crudo ni enlaces `javascript:`) y los archivos de la bóveda se sirven aislados.

## Desarrollo

Sin compilación y sin dependencias: la app es HTML/CSS/módulos ES en `app/` y el servidor es `server.py` (librería estándar).
[marked](https://github.com/markedjs/marked) (MIT) va incluido en `app/vendor/`.

```bash
python3 server.py --demo      # arrancar con datos de ejemplo
npm test                      # = node --test tests/*.test.js && python3 -m unittest discover -s tests
```

Las contribuciones son bienvenidas, sobre todo traducciones (`app/js/strings.js`).

## Licencia

[MIT](LICENSE)
