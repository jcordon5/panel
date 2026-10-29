#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Create a demo vault with realistic content around today's date.

    python3 tools/make_demo.py DEST [es|en]

Also used by `python3 server.py --demo`.
"""
import os
import sys
from datetime import date, timedelta

T = {
    "es": {
        "days": ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"],
        "months": ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
        "week": "Semana", "inbox": "Bandeja",
        "tasks": {
            -3: ["- [x] Revisar presupuesto Q4 #migracion-cloud", "- [ ] Enviar acta de la reunión con proveedores"],
            -1: ["- [x] Preparar demo para dirección", "  - Datos de uso del último mes", "  - Capturas del nuevo panel", "- [ ] Responder a Marta sobre las vacaciones"],
            0: ["- [x] Revisar PR de autenticación #migracion-cloud", "- [ ] @Luis enviar el inventario de servicios", "- [ ] Preparar la retro del sprint", "  - [ ] Recopilar métricas", "  - [ ] Proponer 3 temas", "- [ ] Llamar al banco", "- [ ] Leer el informe de seguridad [[auditoria-seguridad]]"],
            1: ["- [ ] 10:00 Workshop de arquitectura #migracion-cloud", "- [ ] Actualizar la documentación del API"],
            2: ["- [ ] Entrega del informe mensual", "- [ ] Comprar regalo cumpleaños Lucía"],
            4: ["- [ ] Planificar la semana que viene", "- [ ] Cerrar tickets pendientes #portal-clientes"],
            5: ["- [ ] Ir al mercado"],
        },
        "inbox_tasks": ["- [ ] Investigar herramientas de observabilidad", "- [ ] Renovar el pasaporte", "- [ ] Ideas para el offsite de equipo #portal-clientes"],
        "projects": [
            ("migracion-cloud", "Migración a la nube", "blue", "Mover los servicios del CPD propio a la nube antes de final de año, sin cortes de servicio.",
             "## Objetivos\n\n- Migrar los 12 servicios críticos\n- Reducir un 30 % el coste de infraestructura\n- Cero incidencias graves durante la migración\n\n## Hitos\n\n| Hito | Fecha | Estado |\n| --- | --- | --- |\n| Inventario de servicios | Septiembre | ✅ |\n| Piloto con 2 servicios | Octubre | En curso |\n| Migración completa | Diciembre | Pendiente |\n\n## Enlaces\n\n- [[plan-de-carrera]]\n- Documentación del proveedor: https://example.com/docs\n"),
            ("portal-clientes", "Portal de clientes", "rose", "Nuevo portal para que los clientes consulten sus pedidos y facturas.",
             "## Objetivos\n\n- Lanzar la beta con 20 clientes\n- NPS > 40\n\n> [!warning] Riesgo\n> El equipo de diseño solo está disponible hasta noviembre.\n"),
        ],
        "meetings": [
            (0, "10:30", "Sync con el proveedor cloud", "migracion-cloud", ["Ana García", "Luis Pérez", "Proveedor"],
             "## Para comentar\n\n- [x] Retraso del piloto\n- [ ] Coste del servicio gestionado\n\n## Notas\n\n- El piloto va con **dos semanas de retraso** por permisos de red.\n- Proponen usar su servicio gestionado de base de datos.\n- ? ¿Quién aprueba el cambio de red?\n\n## Tareas\n\n- [ ] Abrir ticket de red #migracion-cloud\n- [ ] Pedir presupuesto del servicio gestionado\n- [ ] @Ana revisar el contrato marco\n- [x] Compartir el inventario actualizado\n\n## Decisiones\n\n- Abrir ticket con redes hoy mismo\n- Revisar costes del servicio gestionado\n"),
            (-2, "16:00", "Kickoff portal de clientes", "portal-clientes", ["Marta Ruiz", "Jorge", "Sara Gómez"],
             "## Notas\n\nArrancamos con un alcance mínimo: consulta de pedidos y descarga de facturas.\n\n## Acuerdos\n\n- Sprints de 2 semanas\n- Demo cada viernes\n\n## Próximos pasos\n\n- [ ] Preparar backlog inicial\n- [ ] Invitar a los 20 clientes beta\n"),
            (-7, "09:00", "1:1 con Javi", None, ["Javi"],
             "## Notas\n\n- Feedback muy positivo sobre la demo.\n- Hablar de formación en Kubernetes.\n\n## Próximos pasos\n\n- [ ] Buscar cursos de Kubernetes\n"),
            (3, "12:00", "Comité de seguridad", None, ["Seguridad", "Legal"], "## Notas\n\n\n## Acuerdos\n\n\n## Próximos pasos\n\n"),
        ],
        "people": [
            ("ana-garcia", "Ana García", "Responsable de compras", "Compras", "ana.garcia@example.com", ["contratos con proveedores", "presupuestos"], "Lleva los contratos marco. Prefiere que le escribas por correo con todo el contexto."),
            ("luis-perez", "Luis Pérez", "Ingeniero de sistemas", "Infraestructura", "luis.perez@example.com", ["accesos a servidores", "inventario"], ""),
            ("marta-ruiz", "Marta Ruiz", "Product owner", "Portal de clientes", "marta.ruiz@example.com", ["prioridades del portal"], ""),
            ("sara-gomez", "Sara Gómez", "Diseñadora", "Portal de clientes", "sara.gomez@example.com", [], ""),
        ],
        "series": [
            ("daily-del-equipo", "Daily del equipo", "weekdays", "09:30", ["Ana García", "Luis Pérez", "Sara Gómez"], None,
             (-1, "## Para comentar\n\n- [x] Estado del piloto\n- [ ] Vacaciones de diciembre\n\n## Notas\n\n- Todo en verde salvo el piloto.\n\n## Tareas\n\n- [ ] @Luis revisar los permisos de red\n\n## Decisiones\n\n")),
        ],
        "knowledge": [
            ("pedir-acceso-a-un-entorno", "Cómo pedir acceso a un entorno", "howto", "migracion-cloud", ["Luis Pérez"],
             "1. Abre una solicitud en el portal de servicio, categoría «Accesos».\n2. Indica el entorno y para qué lo necesitas.\n3. Pide a tu responsable que la apruebe.\n\n> [!tip]\n> Si es urgente, avisa a Luis en cuanto la abras.\n"),
            ("documentacion-del-api", "Documentación del API", "resource", "portal-clientes", ["Marta Ruiz"],
             "- Referencia: https://example.com/api\n- Entorno de pruebas: https://sandbox.example.com\n"),
            ("presupuestos-antes-del-dia-20", "Los presupuestos se aprueban antes del día 20", "fact", None, ["Ana García"],
             "Lo que llega después del día 20 pasa al mes siguiente.\n"),
        ],
        "notes": [
            ("plan-de-carrera", "Plan de carrera", True, "## Este año\n\n- [x] Certificación cloud\n- [ ] Liderar un proyecto transversal\n- [ ] Mentorizar a alguien del equipo\n\n## Ideas\n\n> [!tip] Recordatorio\n> Revisar este plan cada trimestre.\n"),
            ("enlaces-de-interes", "Enlaces de interés", True, "- [Markdown Guide](https://www.markdownguide.org)\n- [Obsidian](https://obsidian.md)\n- ==Guía interna de estilo== en la wiki\n"),
            ("auditoria-seguridad", "Auditoría de seguridad", False, "Resumen del informe de la auditoría externa.\n\n## Hallazgos\n\n1. Contraseñas sin rotar en 3 servicios\n2. Logs sin centralizar\n3. Falta MFA en el VPN\n\n```bash\n# comprobar certificados\nopenssl s_client -connect example.com:443\n```\n"),
            ("ideas-offsite", "Ideas para el offsite", False, "- Taller de escritura técnica\n- Hackathon de un día\n- Ruta por la sierra 🥾\n"),
        ],
    },
    "en": {
        "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        "months": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        "week": "Week", "inbox": "Inbox",
        "tasks": {
            -3: ["- [x] Review Q4 budget #cloud-migration", "- [ ] Send minutes of the vendor meeting"],
            -1: ["- [x] Prepare demo for management", "  - Usage data from last month", "  - Screenshots of the new dashboard", "- [ ] Reply to Marta about holidays"],
            0: ["- [x] Review authentication PR #cloud-migration", "- [ ] @Luis send the service inventory", "- [ ] Prepare the sprint retro", "  - [ ] Gather metrics", "  - [ ] Propose 3 topics", "- [ ] Call the bank", "- [ ] Read the security report [[security-audit]]"],
            1: ["- [ ] 10:00 Architecture workshop #cloud-migration", "- [ ] Update the API docs"],
            2: ["- [ ] Deliver the monthly report", "- [ ] Buy Lucy's birthday present"],
            4: ["- [ ] Plan next week", "- [ ] Close pending tickets #customer-portal"],
            5: ["- [ ] Farmers market"],
        },
        "inbox_tasks": ["- [ ] Research observability tools", "- [ ] Renew passport", "- [ ] Ideas for the team offsite #customer-portal"],
        "projects": [
            ("cloud-migration", "Cloud migration", "blue", "Move services from our own data centre to the cloud before year end, with zero downtime.",
             "## Goals\n\n- Migrate the 12 critical services\n- Cut infrastructure cost by 30%\n- No major incidents during the migration\n\n## Milestones\n\n| Milestone | Date | Status |\n| --- | --- | --- |\n| Service inventory | September | ✅ |\n| Pilot with 2 services | October | In progress |\n| Full migration | December | Pending |\n\n## Links\n\n- [[career-plan]]\n- Vendor docs: https://example.com/docs\n"),
            ("customer-portal", "Customer portal", "rose", "New portal where customers check their orders and invoices.",
             "## Goals\n\n- Launch the beta with 20 customers\n- NPS > 40\n\n> [!warning] Risk\n> The design team is only available until November.\n"),
        ],
        "meetings": [
            (0, "10:30", "Sync with the cloud vendor", "cloud-migration", ["Ana García", "Luis Pérez", "Vendor"],
             "## To discuss\n\n- [x] Pilot delay\n- [ ] Managed service cost\n\n## Notes\n\n- The pilot is **two weeks late** because of network permissions.\n- They suggest their managed database service.\n- ? Who approves the network change?\n\n## Tasks\n\n- [ ] Open network ticket #cloud-migration\n- [ ] Ask for a managed service quote\n- [ ] @Ana review the framework contract\n- [x] Share the updated inventory\n\n## Decisions\n\n- Open a ticket with networking today\n- Review managed service costs\n"),
            (-2, "16:00", "Customer portal kickoff", "customer-portal", ["Marta Ruiz", "Jorge", "Sara Gómez"],
             "## Notes\n\nWe start with a minimal scope: order lookup and invoice download.\n\n## Decisions\n\n- 2-week sprints\n- Demo every Friday\n\n## Next steps\n\n- [ ] Prepare the initial backlog\n- [ ] Invite the 20 beta customers\n"),
            (-7, "09:00", "1:1 with Javi", None, ["Javi"],
             "## Notes\n\n- Very positive feedback on the demo.\n- Talk about Kubernetes training.\n\n## Next steps\n\n- [ ] Look for Kubernetes courses\n"),
            (3, "12:00", "Security committee", None, ["Security", "Legal"], "## Notes\n\n\n## Decisions\n\n\n## Next steps\n\n"),
        ],
        "people": [
            ("ana-garcia", "Ana García", "Purchasing manager", "Purchasing", "ana.garcia@example.com", ["supplier contracts", "quotes"], "Owns the framework contracts. Prefers an email with all the context."),
            ("luis-perez", "Luis Pérez", "Systems engineer", "Infrastructure", "luis.perez@example.com", ["server access", "inventory"], ""),
            ("marta-ruiz", "Marta Ruiz", "Product owner", "Customer portal", "marta.ruiz@example.com", ["portal priorities"], ""),
            ("sara-gomez", "Sara Gómez", "Designer", "Customer portal", "sara.gomez@example.com", [], ""),
        ],
        "series": [
            ("team-daily", "Team daily", "weekdays", "09:30", ["Ana García", "Luis Pérez", "Sara Gómez"], None,
             (-1, "## To discuss\n\n- [x] Pilot status\n- [ ] December holidays\n\n## Notes\n\n- All green except the pilot.\n\n## Tasks\n\n- [ ] @Luis review the network permissions\n\n## Decisions\n\n")),
        ],
        "knowledge": [
            ("request-access-to-an-environment", "How to request access to an environment", "howto", "cloud-migration", ["Luis Pérez"],
             "1. Open a request in the service portal, category “Access”.\n2. Say which environment and what you need it for.\n3. Ask your manager to approve it.\n\n> [!tip]\n> If it's urgent, tell Luis as soon as you open it.\n"),
            ("api-documentation", "API documentation", "resource", "customer-portal", ["Marta Ruiz"],
             "- Reference: https://example.com/api\n- Sandbox: https://sandbox.example.com\n"),
            ("quotes-before-the-20th", "Quotes are approved before the 20th", "fact", None, ["Ana García"],
             "Anything that arrives after the 20th moves to the next month.\n"),
        ],
        "notes": [
            ("career-plan", "Career plan", True, "## This year\n\n- [x] Cloud certification\n- [ ] Lead a cross-team project\n- [ ] Mentor someone in the team\n\n## Ideas\n\n> [!tip] Reminder\n> Review this plan every quarter.\n"),
            ("useful-links", "Useful links", True, "- [Markdown Guide](https://www.markdownguide.org)\n- [Obsidian](https://obsidian.md)\n- ==Internal style guide== in the wiki\n"),
            ("security-audit", "Security audit", False, "Summary of the external audit report.\n\n## Findings\n\n1. Passwords not rotated in 3 services\n2. Logs not centralised\n3. No MFA on the VPN\n\n```bash\n# check certificates\nopenssl s_client -connect example.com:443\n```\n"),
            ("offsite-ideas", "Offsite ideas", False, "- Technical writing workshop\n- One-day hackathon\n- Mountain hike 🥾\n"),
        ],
    },
}


def w(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def slug(s):
    import re
    import unicodedata
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def make(dest, lang="es"):
    L = T[lang]
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    stamp = today.isoformat()

    # weeks (last, current, next)
    by_day = {}
    for off, lines in L["tasks"].items():
        by_day[today + timedelta(days=off)] = list(lines)
    # place each meeting in its day plan ("- [[file]]"), ordered by time
    import re
    for off, time, title, proj, people, body in L["meetings"]:
        d = today + timedelta(days=off)
        day = by_day.setdefault(d, [])
        ref = "- [[%s-%s]]" % (d.isoformat(), slug(title))
        at = len(day)
        for i, line in enumerate(day):
            m = re.match(r"^- \[.\] (\d{2}:\d{2}) ", line)
            if m and m.group(1) > time:
                at = i
                break
            if not m and re.match(r"^- \[.\] ", line):  # untimed tasks go after the meeting
                at = i
                break
        day.insert(at, ref)
    for wk in (-7, 0, 7):
        start = monday + timedelta(days=wk)
        end = start + timedelta(days=6)
        y, n, _ = start.isocalendar()
        title = "%s %d · %d %s – %d %s %d" % (L["week"], n, start.day, L["months"][start.month - 1], end.day, L["months"][end.month - 1], end.year)
        out = ["---", "type: week", "title: " + title, "week: %d-W%02d" % (y, n), "start: " + start.isoformat(),
               "created: " + stamp, "updated: " + stamp, "---", "", "# " + title, ""]
        for i in range(7):
            d = start + timedelta(days=i)
            out += ["## %s · %s" % (L["days"][i], d.isoformat()), ""]
            if d in by_day:
                out += by_day[d] + [""]
        w(os.path.join(dest, "weeks", "%d-W%02d.md" % (y, n)), "\n".join(out))

    w(os.path.join(dest, "inbox.md"), "---\ntype: inbox\ntitle: %s\n---\n\n# %s\n\n%s\n" % (L["inbox"], L["inbox"], "\n".join(L["inbox_tasks"])))

    for s, title, color, desc, body in L["projects"]:
        w(os.path.join(dest, "projects", s, "README.md"),
          "---\ntype: project\ntitle: %s\nstatus: active\ncolor: %s\ncreated: %s\nupdated: %s\n---\n\n# %s\n\n%s\n\n%s" % (title, color, stamp, stamp, title, desc, body))

    for off, time, title, proj, people, body in L["meetings"]:
        d = (today + timedelta(days=off)).isoformat()
        folder = os.path.join(dest, "projects", proj, "meetings") if proj else os.path.join(dest, "meetings")
        fm = ["---", "type: meeting", "title: " + title, "date: " + d, "time: " + time]
        if proj:
            fm.append("project: " + proj)
        fm += ["attendees: [%s]" % ", ".join(people), "created: " + stamp, "updated: " + stamp, "---", "", "# " + title, "", body]
        w(os.path.join(folder, "%s-%s.md" % (d, slug(title))), "\n".join(fm))

    for s, title, role, team, email, ask, about in L["people"]:
        w(os.path.join(dest, "people", s + ".md"), "---\ntype: person\ntitle: %s\nrole: %s\nteam: %s\nemail: %s\nask_for: [%s]\ncreated: %s\nupdated: %s\n---\n\n# %s\n\n%s" % (
            title, role, team, email, ", ".join(ask), stamp, stamp, title, about + "\n" if about else ""))

    for s, title, repeat, time, people, proj, (off, body) in L["series"]:
        start = (today - timedelta(days=14)).isoformat()
        w(os.path.join(dest, "series", s + ".md"), "---\ntype: series\ntitle: %s\nrepeat: %s\nstart: %s\ntime: \"%s\"\nattendees: [%s]\ncreated: %s\nupdated: %s\n---\n\n# %s\n\n" % (
            title, repeat, start, time, ", ".join(people), start, stamp, title))
        d = today + timedelta(days=off)
        while d.weekday() > 4:  # the last session was on a weekday
            d -= timedelta(days=1)
        w(os.path.join(dest, "meetings", "%s-%s.md" % (d.isoformat(), s)), "\n".join(["---", "type: meeting", "title: " + title, "date: " + d.isoformat(),
            'time: "%s"' % time, "attendees: [%s]" % ", ".join(people), "series: " + s, "created: " + stamp, "updated: " + stamp, "---", "", "# " + title, "", body]))

    for s, title, kind, proj, people, body in L["knowledge"]:
        w(os.path.join(dest, "knowledge", s + ".md"), "---\ntype: knowledge\nkind: %s\ntitle: %s\n%speople: [%s]\ncreated: %s\nupdated: %s\n---\n\n# %s\n\n%s" % (
            kind, title, "project: %s\n" % proj if proj else "", ", ".join(people), stamp, stamp, title, body))

    for s, title, pinned, body in L["notes"]:
        fm = "---\ntype: note\ntitle: %s\n%screated: %s\nupdated: %s\n---\n\n# %s\n\n" % (title, "pinned: true\n" if pinned else "", stamp, stamp, title)
        w(os.path.join(dest, "notes", s + ".md"), fm + body)
    return dest


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    print("Demo vault created in " + make(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "es"))
