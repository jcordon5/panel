// Demo vault for the web version ("Try it with sample data"): generated around today's date.
// Same content as tools/make_demo.py.

import { today, addDays, mondayOf, isoWeek, slugify, parseISO } from "./util.js";

const DATA = {
"es": {
"days": [
"Lunes",
"Martes",
"Miércoles",
"Jueves",
"Viernes",
"Sábado",
"Domingo"
],
"months": [
"ene",
"feb",
"mar",
"abr",
"may",
"jun",
"jul",
"ago",
"sep",
"oct",
"nov",
"dic"
],
"week": "Semana",
"inbox": "Bandeja",
"tasks": {
"-3": [
"- [x] Revisar presupuesto Q4 #migracion-cloud",
"- [ ] Enviar acta de la reunión con proveedores"
],
"-1": [
"- [x] 09:30 Daily del equipo",
"- [x] Preparar demo para dirección",
"  - Datos de uso del último mes",
"  - Capturas del nuevo panel",
"- [ ] Responder a Marta sobre las vacaciones"
],
"0": [
"- [ ] 09:30 Daily del equipo",
"- [x] Revisar PR de autenticación #migracion-cloud",
"- [ ] Preparar la retro del sprint",
"  - [ ] Recopilar métricas",
"  - [ ] Proponer 3 temas",
"- [ ] Llamar al banco",
"- [ ] Leer el informe de seguridad [[auditoria-seguridad]]"
],
"1": [
"- [ ] 10:00 Workshop de arquitectura #migracion-cloud",
"- [ ] Actualizar la documentación del API"
],
"2": [
"- [ ] Entrega del informe mensual",
"- [ ] Comprar regalo cumpleaños Lucía"
],
"4": [
"- [ ] Planificar la semana que viene",
"- [ ] Cerrar tickets pendientes #portal-clientes"
],
"5": [
"- [ ] Ir al mercado"
]
},
"inbox_tasks": [
"- [ ] Investigar herramientas de observabilidad",
"- [ ] Renovar el pasaporte",
"- [ ] Ideas para el offsite de equipo #portal-clientes"
],
"projects": [
[
"migracion-cloud",
"Migración a la nube",
"blue",
"Mover los servicios del CPD propio a la nube antes de final de año, sin cortes de servicio.",
"## Objetivos\n\n- Migrar los 12 servicios críticos\n- Reducir un 30 % el coste de infraestructura\n- Cero incidencias graves durante la migración\n\n## Hitos\n\n| Hito | Fecha | Estado |\n| --- | --- | --- |\n| Inventario de servicios | Septiembre | ✅ |\n| Piloto con 2 servicios | Octubre | En curso |\n| Migración completa | Diciembre | Pendiente |\n\n## Enlaces\n\n- [[plan-de-carrera]]\n- Documentación del proveedor: https://example.com/docs\n"
],
[
"portal-clientes",
"Portal de clientes",
"rose",
"Nuevo portal para que los clientes consulten sus pedidos y facturas.",
"## Objetivos\n\n- Lanzar la beta con 20 clientes\n- NPS > 40\n\n> [!warning] Riesgo\n> El equipo de diseño solo está disponible hasta noviembre.\n"
]
],
"meetings": [
[
0,
"10:30",
"Sync con el proveedor cloud",
"migracion-cloud",
[
"Ana",
"Luis",
"Proveedor"
],
"## Notas\n\n- El piloto va con **dos semanas de retraso** por permisos de red.\n- Proponen usar su servicio gestionado de base de datos.\n\n## Acuerdos\n\n- Abrir ticket con redes hoy mismo\n- Revisar costes del servicio gestionado\n\n## Próximos pasos\n\n- [ ] Abrir ticket de red #migracion-cloud\n- [ ] Pedir presupuesto del servicio gestionado\n- [x] Compartir el inventario actualizado\n"
],
[
-2,
"16:00",
"Kickoff portal de clientes",
"portal-clientes",
[
"Marta",
"Jorge",
"Sara"
],
"## Notas\n\nArrancamos con un alcance mínimo: consulta de pedidos y descarga de facturas.\n\n## Acuerdos\n\n- Sprints de 2 semanas\n- Demo cada viernes\n\n## Próximos pasos\n\n- [ ] Preparar backlog inicial\n- [ ] Invitar a los 20 clientes beta\n"
],
[
-7,
"09:00",
"1:1 con Javi",
null,
[
"Javi"
],
"## Notas\n\n- Feedback muy positivo sobre la demo.\n- Hablar de formación en Kubernetes.\n\n## Próximos pasos\n\n- [ ] Buscar cursos de Kubernetes\n"
],
[
3,
"12:00",
"Comité de seguridad",
null,
[
"Seguridad",
"Legal"
],
"## Notas\n\n\n## Acuerdos\n\n\n## Próximos pasos\n\n"
]
],
"notes": [
[
"plan-de-carrera",
"Plan de carrera",
true,
"## Este año\n\n- [x] Certificación cloud\n- [ ] Liderar un proyecto transversal\n- [ ] Mentorizar a alguien del equipo\n\n## Ideas\n\n> [!tip] Recordatorio\n> Revisar este plan cada trimestre.\n"
],
[
"enlaces-de-interes",
"Enlaces de interés",
true,
"- [Markdown Guide](https://www.markdownguide.org)\n- [Obsidian](https://obsidian.md)\n- ==Guía interna de estilo== en la wiki\n"
],
[
"auditoria-seguridad",
"Auditoría de seguridad",
false,
"Resumen del informe de la auditoría externa.\n\n## Hallazgos\n\n1. Contraseñas sin rotar en 3 servicios\n2. Logs sin centralizar\n3. Falta MFA en el VPN\n\n```bash\n# comprobar certificados\nopenssl s_client -connect example.com:443\n```\n"
],
[
"ideas-offsite",
"Ideas para el offsite",
false,
"- Taller de escritura técnica\n- Hackathon de un día\n- Ruta por la sierra 🥾\n"
]
]
},
"en": {
"days": [
"Monday",
"Tuesday",
"Wednesday",
"Thursday",
"Friday",
"Saturday",
"Sunday"
],
"months": [
"Jan",
"Feb",
"Mar",
"Apr",
"May",
"Jun",
"Jul",
"Aug",
"Sep",
"Oct",
"Nov",
"Dec"
],
"week": "Week",
"inbox": "Inbox",
"tasks": {
"-3": [
"- [x] Review Q4 budget #cloud-migration",
"- [ ] Send minutes of the vendor meeting"
],
"-1": [
"- [x] 09:30 Team daily",
"- [x] Prepare demo for management",
"  - Usage data from last month",
"  - Screenshots of the new dashboard",
"- [ ] Reply to Marta about holidays"
],
"0": [
"- [ ] 09:30 Team daily",
"- [x] Review authentication PR #cloud-migration",
"- [ ] Prepare the sprint retro",
"  - [ ] Gather metrics",
"  - [ ] Propose 3 topics",
"- [ ] Call the bank",
"- [ ] Read the security report [[security-audit]]"
],
"1": [
"- [ ] 10:00 Architecture workshop #cloud-migration",
"- [ ] Update the API docs"
],
"2": [
"- [ ] Deliver the monthly report",
"- [ ] Buy Lucy's birthday present"
],
"4": [
"- [ ] Plan next week",
"- [ ] Close pending tickets #customer-portal"
],
"5": [
"- [ ] Farmers market"
]
},
"inbox_tasks": [
"- [ ] Research observability tools",
"- [ ] Renew passport",
"- [ ] Ideas for the team offsite #customer-portal"
],
"projects": [
[
"cloud-migration",
"Cloud migration",
"blue",
"Move services from our own data centre to the cloud before year end, with zero downtime.",
"## Goals\n\n- Migrate the 12 critical services\n- Cut infrastructure cost by 30%\n- No major incidents during the migration\n\n## Milestones\n\n| Milestone | Date | Status |\n| --- | --- | --- |\n| Service inventory | September | ✅ |\n| Pilot with 2 services | October | In progress |\n| Full migration | December | Pending |\n\n## Links\n\n- [[career-plan]]\n- Vendor docs: https://example.com/docs\n"
],
[
"customer-portal",
"Customer portal",
"rose",
"New portal where customers check their orders and invoices.",
"## Goals\n\n- Launch the beta with 20 customers\n- NPS > 40\n\n> [!warning] Risk\n> The design team is only available until November.\n"
]
],
"meetings": [
[
0,
"10:30",
"Sync with the cloud vendor",
"cloud-migration",
[
"Ana",
"Luis",
"Vendor"
],
"## Notes\n\n- The pilot is **two weeks late** because of network permissions.\n- They suggest their managed database service.\n\n## Decisions\n\n- Open a ticket with networking today\n- Review managed service costs\n\n## Next steps\n\n- [ ] Open network ticket #cloud-migration\n- [ ] Ask for a managed service quote\n- [x] Share the updated inventory\n"
],
[
-2,
"16:00",
"Customer portal kickoff",
"customer-portal",
[
"Marta",
"Jorge",
"Sara"
],
"## Notes\n\nWe start with a minimal scope: order lookup and invoice download.\n\n## Decisions\n\n- 2-week sprints\n- Demo every Friday\n\n## Next steps\n\n- [ ] Prepare the initial backlog\n- [ ] Invite the 20 beta customers\n"
],
[
-7,
"09:00",
"1:1 with Javi",
null,
[
"Javi"
],
"## Notes\n\n- Very positive feedback on the demo.\n- Talk about Kubernetes training.\n\n## Next steps\n\n- [ ] Look for Kubernetes courses\n"
],
[
3,
"12:00",
"Security committee",
null,
[
"Security",
"Legal"
],
"## Notes\n\n\n## Decisions\n\n\n## Next steps\n\n"
]
],
"notes": [
[
"career-plan",
"Career plan",
true,
"## This year\n\n- [x] Cloud certification\n- [ ] Lead a cross-team project\n- [ ] Mentor someone in the team\n\n## Ideas\n\n> [!tip] Reminder\n> Review this plan every quarter.\n"
],
[
"useful-links",
"Useful links",
true,
"- [Markdown Guide](https://www.markdownguide.org)\n- [Obsidian](https://obsidian.md)\n- ==Internal style guide== in the wiki\n"
],
[
"security-audit",
"Security audit",
false,
"Summary of the external audit report.\n\n## Findings\n\n1. Passwords not rotated in 3 services\n2. Logs not centralised\n3. No MFA on the VPN\n\n```bash\n# check certificates\nopenssl s_client -connect example.com:443\n```\n"
],
[
"offsite-ideas",
"Offsite ideas",
false,
"- Technical writing workshop\n- One-day hackathon\n- Mountain hike 🥾\n"
]
]
}
};

/** { "path.md": "content" } */
export function demoFiles(lang) {
  const L = DATA[lang] || DATA.en;
  const out = {};
  const t0 = today();
  const stamp = t0;
  const byDay = {};
  for (const [off, lines] of Object.entries(L.tasks)) byDay[addDays(t0, +off)] = [...lines];
  for (const [off, time, title, proj] of L.meetings) {
    const d = addDays(t0, off);
    const day = (byDay[d] = byDay[d] || []);
    let at = day.length;
    for (let i = 0; i < day.length; i++) {
      const m = /^- \[.\] (\d{2}:\d{2}) /.exec(day[i]);
      if (m && m[1] > time) { at = i; break; }
      if (!m && /^- \[.\] /.test(day[i])) { at = i; break; }
    }
    day.splice(at, 0, `- [[${d}-${slugify(title)}]]`);
    void proj;
  }
  for (const wk of [-7, 0, 7]) {
    const start = addDays(mondayOf(t0), wk);
    const end = addDays(start, 6);
    const { year, week } = isoWeek(start);
    const s = parseISO(start), e = parseISO(end);
    const title = `${L.week} ${week} · ${s.getDate()} ${L.months[s.getMonth()]} – ${e.getDate()} ${L.months[e.getMonth()]} ${e.getFullYear()}`;
    const lines = ["---", "type: week", "title: " + title, `week: ${year}-W${String(week).padStart(2, "0")}`, "start: " + start, "created: " + stamp, "updated: " + stamp, "---", "", "# " + title, ""];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      lines.push(`## ${L.days[i]} · ${d}`, "");
      if (byDay[d]) lines.push(...byDay[d], "");
    }
    out[`weeks/${year}-W${String(week).padStart(2, "0")}.md`] = lines.join("\n");
  }
  out["inbox.md"] = `---\ntype: inbox\ntitle: ${L.inbox}\n---\n\n# ${L.inbox}\n\n${L.inbox_tasks.join("\n")}\n`;
  for (const [s, title, color, desc, body] of L.projects) {
    out[`projects/${s}/README.md`] = `---\ntype: project\ntitle: ${title}\nstatus: active\ncolor: ${color}\ncreated: ${stamp}\nupdated: ${stamp}\n---\n\n# ${title}\n\n${desc}\n\n${body}`;
  }
  for (const [off, time, title, proj, people, body] of L.meetings) {
    const d = addDays(t0, off);
    const folder = proj ? `projects/${proj}/meetings` : "meetings";
    const fm = ["---", "type: meeting", "title: " + title, "date: " + d, "time: " + time];
    if (proj) fm.push("project: " + proj);
    fm.push(`attendees: [${people.join(", ")}]`, "created: " + stamp, "updated: " + stamp, "---", "", "# " + title, "", body);
    out[`${folder}/${d}-${slugify(title)}.md`] = fm.join("\n");
  }
  for (const [s, title, pinned, body] of L.notes) {
    out[`notes/${s}.md`] = `---\ntype: note\ntitle: ${title}\n${pinned ? "pinned: true\n" : ""}created: ${stamp}\nupdated: ${stamp}\n---\n\n# ${title}\n\n${body}`;
  }
  return out;
}
