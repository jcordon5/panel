<div align="center">

<img src="app/icon-192.png" width="72" alt="">

# Panel

**Tu memoria de trabajo: la semana, las reuniones, la gente y lo que vas aprendiendo — en Markdown que es tuyo,
con una IA que hace el trabajo pesado.**

Sin cuentas. Sin nubes en las que tengas que confiar. Sin permisos de administrador.<br>
Windows, macOS y Linux.

[**Descargar para Windows**](https://github.com/jcordon5/panel/releases/latest/download/Panel-Windows.zip) ·
[macOS / Linux](#empezar) ·
[English](README.md)

<img src="docs/img/week.png" alt="Panel: el tablero semanal" width="100%">

</div>

---

## El problema

Días enteros de reunión en reunión. Al día siguiente, el hueco libre se va en repasar notas, buscar en el chat lo que se dijo, rehacer
la lista de tareas… *tareas para crear tareas*. Y aun así se escapan cosas: quién quedó en mandar qué, cómo se pedía aquel acceso,
dónde estaba aquel documento.

Panel está hecho para que **atiendas a la reunión** y luego **hagas**, no para que organices.

## Cómo funciona

1. **Planificas la semana** en un tablero: tareas y reuniones en el orden en que ocurren.
2. **Tomas notas en la propia nota de la reunión**: toda la pantalla es la nota, con un botón por sección que se queda arriba y lo
   que sigue abierto plegado al lado, así que funciona en media pantalla del portátil junto a la llamada. Debajo, Markdown normal: `- [ ]` una
   tarea, `@Ana …` algo que esperas de Ana. ¿Hay transcripción? La sueltas encima.
3. **Tu IA lo procesa** (Claude u otro agente, con la [skill](skills/panel-vault) incluida): «procesa mis reuniones» y escribe el
   resumen, completa tareas y decisiones que se te escaparon, actualiza las fichas de las personas y guarda como conocimiento lo que
   vale la pena recordar. Las fuentes que usó se borran: no se acumula basura.
4. **Le hablas como a un compañero**: «recuérdame que para el proyecto Alfa tengo que pedir el presupuesto», «registra que hemos cerrado
   la migración» (busca la tarea relacionada y la cierra, o lo apunta como hecho), «he aprendido que los presupuestos se aprueban antes del
   día 20», «Ana se encarga de las facturas», «prepara la próxima daily» (mira la anterior, lo pendiente de cada uno y lo que has hecho
   desde entonces, y te rellena «Para comentar»).
5. **Preguntas a tu memoria**: «¿cómo se daba de alta a un proveedor?», «¿qué me debe Luis?», «¿dónde está la plantilla del informe?».
   La respuesta sale de tus notas y documentos, con la fuente.

Todo son archivos `.md` normales en una carpeta tuya. Los lees tú, los ve Panel con estructura y los lee y edita tu IA.

## Qué incluye

<table>
<tr>
<td><img src="docs/img/meeting.png" alt="Una nota de reunión"></td>
<td><img src="docs/img/today.png" alt="Hoy"></td>
</tr>
<tr>
<td><img src="docs/img/people.png" alt="Ficha de una persona"></td>
<td><img src="docs/img/knowledge.png" alt="Conocimiento"></td>
</tr>
<tr>
<td colspan="2"><img src="docs/img/graph.png" alt="Grafo"></td>
</tr>
</table>

- **Semana y plan del día** — una columna por día más la bandeja; arrastra tareas y reuniones; lo atrasado a hoy con un clic.
- **Reuniones recurrentes** — una daily, un seguimiento cada dos semanas, el primer lunes de mes… Con sus asistentes habituales. Cada
  sesión aparece sola en su día y su nota se crea al entrar, con lo que quedó sin comentar en la anterior.
- **Reuniones** — su página muestra hora, asistentes (personas o equipos enteros) y adjuntos; mientras escribes, solo la nota, un botón
  por sección para saltar a ella y el contexto plegado (lo abierto de la sesión anterior, lo que te deben los asistentes). Hoy y la semana marcan
  qué reuniones aún no se han celebrado y cuáles faltan por procesar.
- **Proyectos con código** — dale a un proyecto un código corto y todo lo que lo mencione (o `#código`) se asocia a él; sus tareas
  llevan su color en todas partes.
- **Grafo** — un mapa de tu memoria de trabajo: proyectos, personas, reuniones y conocimiento, y dónde se concentra más.
- **Personas** — fichas con puesto, equipos (uno o varios) y *para qué acudir a ellas*; en cada una, sus reuniones y lo que te debe. Panel te enseña
  quién aparece en tus reuniones sin ficha y la crea con un clic. Selector de asistentes con autocompletado.
- **Conocimiento** — notas pequeñas de *procedimientos* (cómo se hace algo), *recursos* (dónde está) y *datos* (lo que conviene
  recordar), enlazadas con proyectos y personas.
- **Documentos fuera de la bóveda** — indica las carpetas con tus plantillas, guías o documentación (por ejemplo en OneDrive): Panel los
  lista en *Documentos*, los encuentra al buscar (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd>) y los abre con su programa, y tu IA sabe que
  existen. No se copia nada.
- **Para tu IA** — suelta o pega transcripciones (.vtt, .docx), correos (.eml, o .msg arrastrado desde Outlook) o chats; Hoy te dice
  qué está pendiente de procesar.
- **Esperando a otros** — cualquier tarea que empieza por `@Nombre`; aparece en Hoy, en la ficha de la persona y en sus reuniones.
- **Sin aprender sintaxis** — proyecto, persona, etiquetas y hora de una tarea se eligen en un diálogo; quien prefiera escribir
  `09:30 @Ana enviar el presupuesto #proyecto` puede hacerlo igual.
- **Editor como Obsidian** — formateado mientras escribes; el Markdown solo aparece donde está el cursor. También modo código y lectura.
- **Calendario** — tus reuniones de Outlook/Google/iCloud aparecen solas; un clic crea la nota.
- **Proyectos, tablón de notas, búsqueda global** (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd>), **deshacer cualquier cosa**, atajos de
  teclado, claro/oscuro, español/inglés.
- **Copias cifradas** de toda la bóveda con tu contraseña, también automáticas a una carpeta en la nube.

## Por qué así

**Tus datos sobreviven a la app.** Todo es Markdown en una carpeta que eliges. Sin base de datos ni formato propietario: ábrela con
cualquier editor, Obsidian, VS Code o Git. Si Panel desapareciera mañana, no perderías nada.

**La IA trabaja sobre lo que tú controlas.** Panel no conecta con tu correo ni lee tus chats por su cuenta: tú decides qué le das, y tu
agente de IA (el que ya uses, con tu cuenta) lo destila en la bóveda. Nada sale de tu equipo salvo lo que tú le pidas a tu IA.

**Privado por diseño.** Sin servidores, cuentas ni analítica. Un programa pequeño que solo escucha en tu propio ordenador.

**Funciona en un ordenador de empresa.** Sin instalar nada como administrador, sin extensiones, sin acceso a otras aplicaciones. Pon
la bóveda en el OneDrive de la empresa y se sincroniza como cualquier documento.

**Simple a propósito.** Semana, reuniones, personas, conocimiento y proyectos. Sin bases de datos que diseñar ni plugins que configurar.

## Empezar

- **Windows** — [descarga `Panel-Windows.zip`](https://github.com/jcordon5/panel/releases/latest/download/Panel-Windows.zip), descomprímelo y
  haz doble clic en **`panel.bat`**. Lleva Python incluido: nada más que instalar y sin permisos de administrador.
- **macOS / Linux** — [descarga `panel.zip`](https://github.com/jcordon5/panel/releases/latest/download/panel.zip), descomprímelo y haz doble
  clic en `panel.command` (macOS; la primera vez, clic derecho → *Abrir*) o ejecuta `./panel.sh`. Necesita Python 3.7+. O en una línea:
  `curl -fsSL https://raw.githubusercontent.com/jcordon5/panel/main/install.sh | sh`

Panel se abre en tu navegador en `http://127.0.0.1:8765`. `python3 server.py --demo` lo arranca con datos de ejemplo.

**Conecta tu IA**: copia [`skills/panel-vault`](skills/panel-vault) a `~/.claude/skills/` (Claude Code, también la extensión de VS Code)
o añádela como skill en la app de Claude; a otros agentes, apúntales a `skills/panel-vault/SKILL.md`. Después: «procesa mis reuniones».

## Tu IA y tus rutinas

La skill enseña a tu agente el formato de la bóveda y le da un script (solo librería estándar de Python) para hacer cada cosa igual que
la app: ver qué está pendiente, leer una reunión con su contexto, escribir el resumen, crear fichas y notas de conocimiento, planificar
y mover tareas, buscar en todo.

En la bóveda hay un `routines.md` con tus rutinas, en lenguaje normal: *cuando diga «buenos días», procesa lo pendiente y dame el día*.
Lo editas tú; tu IA lo sigue.

## Tus datos

- **Sincronizar**: pon la carpeta de la bóveda en OneDrive, Dropbox, iCloud o Syncthing.
- **Exportar**: *Ajustes → Bóveda → Exportar bóveda (.zip)*.
- **Copias cifradas**: *Ajustes → Copias* crea un archivo con toda la bóveda cifrado con tu contraseña (AES-256-GCM, clave derivada con
  PBKDF2-SHA256 y 600.000 iteraciones). Panel puede hacer una al día en la carpeta que elijas (una de OneDrive, por ejemplo). Restaurar
  pide la contraseña y deja los archivos sustituidos en `.trash`, o te da un `.zip`. Si el equipo recuerda la contraseña, guarda una clave
  que solo sirve para *cifrar*: nadie con acceso a ese equipo puede abrir las copias.
- **Redes de seguridad**: lo borrado va a `.trash` dentro de la bóveda; antes de cada actualización se hace una copia.
- **Actualizaciones**: Panel mira en GitHub al arrancar y se actualiza con un clic. Solo se sustituye el código; tu bóveda y tus ajustes no
  se tocan. **Las bóvedas antiguas siguen funcionando tal cual**: lo nuevo es opcional y tu IA puede migrar tus notas cuando quieras.

## Calendario

*Ajustes → Calendario.* Un enlace de suscripción **.ics** (Outlook web, Google Calendar, iCloud, Nextcloud…), que se refresca solo, o el
**Outlook de escritorio** de Windows, para empresas que no permiten publicar el calendario. Las reuniones aparecen en Hoy, Semana y
Calendario; un clic crea su nota. Los calendarios solo se leen.

## La bóveda

```
vault/
├── README.md                     cómo se organiza (para personas e IAs)
├── routines.md                   tus rutinas para la IA
├── inbox.md                      tareas sin fecha
├── weeks/2026-W44.md             una semana por archivo, una sección por día (el plan del día, en orden)
├── meetings/2026-10-29-….md      reuniones (projects/<p>/meetings/ si son de un proyecto)
├── series/<nombre>.md            reuniones recurrentes
├── people/<nombre>.md            personas
├── knowledge/<título>.md         conocimiento: procedimientos, recursos, datos
├── projects/<proyecto>/README.md proyectos
├── notes/*.md                    notas (el Tablón)
├── sources/*.md                  lo que dejas para tu IA (se borra al procesarlo)
└── templates/, assets/           plantillas e imágenes
```

```markdown
## Jueves · 2026-10-29

- [ ] 09:00 Revisar el informe #proyecto-alfa
- [[2026-10-29-seguimiento-alfa]]          ← la reunión, donde ocurre
- [ ] @Ana enviar el presupuesto            ← esperando a Ana
- [[2026-10-28-seguimiento-alfa#^k3x9pa]]   ← una tarea de otra reunión, planificada hoy
```

El formato completo de cada archivo está en [`skills/panel-vault/references/format.md`](skills/panel-vault/references/format.md).
Compatible con Obsidian.

**¿Vienes de Panel v1 (`boveda/`)?** Pon la carpeta `boveda` junto a `server.py` antes de arrancar la primera vez y Panel te ofrece
migrarla (la original no se toca), o ejecuta `python3 tools/migrate_v1.py ruta/a/boveda ruta/a/vault es`.

## Privacidad y seguridad

- Sin servidores, cuentas, analítica ni rastreo.
- El servidor solo escucha en `127.0.0.1`, rechaza peticiones de otras webs y solo puede tocar archivos dentro de la bóveda.
- El Markdown se sanea (sin HTML crudo ni enlaces `javascript:`) y se aplica una política de seguridad de contenido estricta.
- Lo que sueltas para tu IA pasa por un filtro que oculta contraseñas y tokens evidentes, y se borra al procesarlo.
- Las únicas conexiones externas son las que configuras: tus calendarios y la comprobación de actualizaciones.

## Desarrollo

Sin compilación y sin dependencias: HTML/CSS/módulos ES en `app/`, `server.py` (solo librería estándar), y
[marked](https://github.com/markedjs/marked) y [CodeMirror 6](https://codemirror.net) incluidos (`tools/vendor/build-codemirror.sh`
regenera CodeMirror; solo hace falta para actualizarlo).

```bash
python3 server.py --demo   # con datos de ejemplo
npm test                   # node --test tests/*.test.js && python3 -m unittest discover -s tests
```

Las contribuciones son bienvenidas, sobre todo traducciones (`app/js/strings.js`).

## Licencia

[MIT](LICENSE) — libre para usar, modificar y compartir.
