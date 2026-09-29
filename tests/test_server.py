# -*- coding: utf-8 -*-
"""Server + migration tests (standard library only): python3 -m unittest discover -s tests"""
import http.client
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "tools"))

import server  # noqa: E402
import migrate_v1  # noqa: E402


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="panel-test-")
        server.VAULT = os.path.realpath(os.path.join(cls.tmp, "vault"))
        os.makedirs(server.VAULT)
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def req(self, method, path, body=None, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        h = {"X-Panel": "1", "Content-Type": "application/json"}
        h.update(headers or {})
        c.request(method, path, body=json.dumps(body) if body is not None else None, headers=h)
        r = c.getresponse()
        data = r.read()
        c.close()
        try:
            return r.status, json.loads(data.decode("utf-8"))
        except ValueError:
            return r.status, data

    def write(self, path, content, **extra):
        body = {"path": path, "content": content}
        body.update(extra)
        return self.req("POST", "/api/write", body)

    def test_info_and_app(self):
        st, info = self.req("GET", "/api/info")
        self.assertEqual(st, 200)
        self.assertEqual(info["app"], "panel")
        st, html = self.req("GET", "/")
        self.assertEqual(st, 200)
        self.assertIn(b"<title>Panel</title>", html)

    def test_write_read_and_etag_conflict(self):
        st, res = self.write("notes/a.md", "hola\r\n")
        self.assertEqual(st, 200)
        with open(os.path.join(server.VAULT, "notes", "a.md"), "rb") as f:
            self.assertEqual(f.read(), b"hola\n")  # CRLF normalised
        etag = res["etag"]
        st, res = self.write("notes/a.md", "v2", etag=etag)
        self.assertEqual(st, 200)
        st, res = self.write("notes/a.md", "v3", etag=etag)  # stale etag
        self.assertEqual(st, 409)
        self.assertEqual(res["reason"], "conflict")
        self.assertEqual(res["content"], "v2")
        st, res = self.write("notes/new.md", "x", etag=None)  # expects "does not exist"
        self.assertEqual(st, 200)
        st, res = self.write("notes/new.md", "y", create=True)
        self.assertEqual(st, 409)
        st, res = self.req("POST", "/api/read", {"paths": ["notes/a.md", "nope.md"]})
        self.assertEqual(res["files"]["notes/a.md"]["content"], "v2")
        self.assertIsNone(res["files"]["nope.md"])

    def test_path_safety(self):
        for bad in ["../x.md", "/etc/passwd", "a/../../x.md", ".trash/x.md", "notes/.hidden.md", "x.txt", "a\x00.md"]:
            st, _ = self.write(bad, "x")
            self.assertEqual(st, 400, bad)
        st, _ = self.req("GET", "/vault/../server.py")
        self.assertNotEqual(st, 200)
        st, _ = self.req("GET", "/../server.py")
        self.assertNotEqual(st, 200)

    def test_csrf_and_host_guards(self):
        st, _ = self.req("POST", "/api/write", {"path": "x.md", "content": "x"}, headers={"X-Panel": "0"})
        self.assertEqual(st, 403)
        st, _ = self.req("GET", "/api/info", headers={"Host": "evil.example:80"})
        self.assertEqual(st, 403)

    def test_delete_goes_to_trash_and_move(self):
        self.write("meetings/m.md", "m")
        st, res = self.req("POST", "/api/move", {"from": "meetings/m.md", "to": "projects/p/meetings/m.md"})
        self.assertEqual(st, 200)
        self.assertTrue(os.path.isfile(os.path.join(server.VAULT, "projects/p/meetings/m.md")))
        self.write("meetings/other.md", "o")
        st, _ = self.req("POST", "/api/move", {"from": "meetings/other.md", "to": "projects/p/meetings/m.md"})
        self.assertEqual(st, 409)
        st, res = self.req("POST", "/api/delete", {"path": "projects/p"})
        self.assertEqual(st, 200)
        self.assertFalse(os.path.exists(os.path.join(server.VAULT, "projects/p")))
        self.assertTrue(os.path.isdir(os.path.join(server.VAULT, res["trash"])))
        st, files = self.req("GET", "/api/files")
        self.assertFalse(any(f["path"].startswith(".trash") for f in files["files"]))

    def test_upload_and_serve_asset(self):
        import base64
        png = base64.b64encode(b"\x89PNG\r\n\x1a\nfake").decode()
        st, res = self.req("POST", "/api/upload", {"name": "Captura de pantalla.png", "data": png})
        self.assertEqual(st, 200)
        self.assertTrue(res["path"].startswith("assets/"))
        c = http.client.HTTPConnection("127.0.0.1", self.port)
        c.request("GET", "/vault/" + res["path"])
        r = c.getresponse()
        self.assertEqual(r.status, 200)
        self.assertIn("sandbox", r.getheader("Content-Security-Policy"))
        r.read()
        c.close()
        st, _ = self.req("POST", "/api/upload", {"name": "x.html", "data": png})
        self.assertEqual(st, 400)


class UpdaterTest(unittest.TestCase):
    def test_update_keeps_user_data(self):
        import io
        import zipfile
        import updater
        tmp = tempfile.mkdtemp(prefix="panel-upd-")
        try:
            root = os.path.join(tmp, "panel")
            files = {"server.py": "OLD", "app/index.html": "old", "app/js/removed.js": "x", "vault/notes/a.md": "mine",
                     "panel.config.json": '{"vault": "vault"}', "python/python.exe": "py", "README.md": "old readme"}
            for rel, text in files.items():
                p = os.path.join(root, rel)
                os.makedirs(os.path.dirname(p), exist_ok=True)
                with open(p, "w") as f:
                    f.write(text)
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w") as z:
                z.writestr("jcordon5-panel-abc123/server.py", "NEW")
                z.writestr("jcordon5-panel-abc123/app/index.html", "new")
                z.writestr("jcordon5-panel-abc123/README.md", "new readme")
                z.writestr("jcordon5-panel-abc123/panel.sh", "#!/bin/sh")
                z.writestr("jcordon5-panel-abc123/vault/evil.md", "should not land")
            orig = (updater.latest_release, updater._get)
            updater.latest_release = lambda repo: {"version": "9.0.0", "notes": "", "url": "", "zip": "http://x/z.zip"}
            updater._get = lambda url, timeout=15: buf.getvalue()
            try:
                self.assertTrue(updater.check("2.1.0", "x/y", force=True)["newer"])
                res = updater.apply(root, os.path.join(root, "vault"), "2.1.0", "x/y")
            finally:
                updater.latest_release, updater._get = orig
            read = lambda rel: open(os.path.join(root, rel)).read()
            self.assertEqual(res["version"], "9.0.0")
            self.assertEqual(read("server.py"), "NEW")
            self.assertEqual(read("app/index.html"), "new")
            self.assertFalse(os.path.exists(os.path.join(root, "app/js/removed.js")))  # app/ is replaced as a whole
            self.assertEqual(read("vault/notes/a.md"), "mine")
            self.assertFalse(os.path.exists(os.path.join(root, "vault/evil.md")))
            self.assertEqual(read("panel.config.json"), '{"vault": "vault"}')
            self.assertEqual(read("python/python.exe"), "py")
            self.assertTrue(os.path.isfile(res["backup"]))
            with zipfile.ZipFile(res["backup"]) as z:
                self.assertIn("notes/a.md", z.namelist())
            self.assertEqual(read("backups/app-2.1.0/server.py"), "OLD")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_backups_are_pruned(self):
        import updater
        tmp = tempfile.mkdtemp(prefix="panel-bk-")
        try:
            vault = os.path.join(tmp, "vault")
            os.makedirs(vault)
            open(os.path.join(vault, "a.md"), "w").write("x")
            b = os.path.join(tmp, "backups")
            os.makedirs(b)
            for i in range(8):
                open(os.path.join(b, "vault-2026010%d-000000-before-update-from-2.%d.0.zip" % (i + 1, i)), "w").write("z")
            updater.backup_vault(vault, b, "before-update-from-2.9.0")
            left = sorted(n for n in os.listdir(b) if "before-update" in n)
            self.assertEqual(len(left), 5)
            self.assertTrue(any("2.9.0" in n for n in left))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_versions(self):
        import updater
        self.assertGreater(updater.parse_version("v2.10.0"), updater.parse_version("2.9.9"))
        self.assertEqual(updater.parse_version("2.1"), (2, 1, 0))


class CalendarTest(unittest.TestCase):
    def test_ics_recurrence_exceptions_and_timezones(self):
        import calendars
        ics = "\r\n".join([
            "BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:w", "SUMMARY:Weekly", "DTSTART:20260928T100000",
            "DTEND:20260928T110000", "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4", "EXDATE:20260930T100000", "END:VEVENT",
            "BEGIN:VEVENT", "UID:w", "RECURRENCE-ID:20261005T100000", "SUMMARY:Weekly (moved)",
            "DTSTART:20261006T090000", "DTEND:20261006T093000", "END:VEVENT",
            "BEGIN:VEVENT", "UID:m", "SUMMARY:First Friday", "DTSTART:20260102T120000", "RRULE:FREQ=MONTHLY;BYDAY=1FR", "END:VEVENT",
            "BEGIN:VEVENT", "UID:x", "SUMMARY:Cancelled", "STATUS:CANCELLED", "DTSTART:20260929T100000", "END:VEVENT",
            "END:VCALENDAR"])
        from datetime import datetime
        evs = calendars.events_from_ics(ics, datetime(2026, 9, 28), datetime(2026, 10, 12), "ics")
        got = [(e["start"], e["title"]) for e in evs]
        self.assertIn(("2026-09-28T10:00", "Weekly"), got)
        self.assertNotIn(("2026-09-30T10:00", "Weekly"), got)       # EXDATE
        self.assertIn(("2026-10-06T09:00", "Weekly (moved)"), got)    # RECURRENCE-ID
        self.assertNotIn(("2026-10-05T10:00", "Weekly"), got)
        self.assertIn(("2026-10-02T12:00", "First Friday"), got)
        self.assertFalse(any(t == "Cancelled" for _, t in got))
        self.assertEqual(len([g for g in got if g[1].startswith("Weekly")]), 3)  # COUNT=4 minus EXDATE


class MigrationTest(unittest.TestCase):
    def test_v1_vault(self):
        tmp = tempfile.mkdtemp(prefix="panel-mig-")
        try:
            src = os.path.join(tmp, "boveda")
            files = {
                "semanas/semana_2026-09-14.md": "---\ntitulo: Semana\ntipo: semana\ninicio: 2026-09-14\nestado: activa\n---\n# Semana del 14\n\n## Lunes 14\n\n### Mañana\n\n### Tarde\n\n## Viernes 18\n\n### Mañana\n\n- [ ] Tarea 1\n  - sub\n\n### Tarde\n",
                "semanas/archivadas/semana_2026-09-07.md": "---\ntipo: semana\n---\n## Martes 8\n\n### Tarde\n- [x] Vieja\n",
                "proyectos/red_team/notas.md": "---\ntitulo: Red Team\ntipo: notas\nproyecto: red_team\n---\n# Red Team\n",
                "proyectos/red_team/reuniones/260914_01_kickoff.md": "---\ntitulo: Kickoff\ntipo: reunion\nfecha: 2026-09-14\nproyecto: red_team\n---\n# Kickoff\n",
                "misc/reuniones/260915_02_cafe_con_ana.md": "---\ntitulo: Café\ntipo: reunion\n---\nhola\n",
                "misc/enlaces_interes.md": "---\ntitulo: Enlaces\ntipo: notas\n---\n",
                u"tablón/260903_01_plan.md": "---\ntitulo: Plan\ntipo: nota\nfecha: 2026-09-03\n---\n# Plan\n",
                "tareas.md": "---\ntitulo: Tareas\ntipo: tareas\n---\n- [ ] algo\n",
            }
            for rel, text in files.items():
                p = os.path.join(src, rel)
                os.makedirs(os.path.dirname(p), exist_ok=True)
                with open(p, "w", encoding="utf-8") as f:
                    f.write(text)
            self.assertTrue(migrate_v1.looks_like_v1(src))
            dst = os.path.join(tmp, "vault")
            rep = migrate_v1.migrate(src, dst, "es")
            self.assertEqual(rep["written"], 8)

            def read(rel):
                with open(os.path.join(dst, rel), encoding="utf-8") as f:
                    return f.read()
            w38 = read("weeks/2026-W38.md")
            self.assertIn("## Lunes · 2026-09-14\n\n## Martes", w38)  # empty Mañana/Tarde dropped
            self.assertIn("## Viernes · 2026-09-18\n\n### Mañana\n- [ ] Tarea 1\n  - sub\n", w38)
            self.assertIn("type: week", w38)
            self.assertNotIn("estado", w38)
            self.assertIn("- [x] Vieja", read("weeks/2026-W37.md"))
            readme = read("projects/red_team/README.md")
            self.assertIn("type: project", readme)
            self.assertIn("title: Red Team", readme)
            m = read("projects/red_team/meetings/2026-09-14-kickoff.md")
            self.assertIn("type: meeting", m)
            self.assertIn("date: 2026-09-14", m)
            self.assertIn("date: 2026-09-15", read("meetings/2026-09-15-cafe-con-ana.md"))
            self.assertIn("pinned: true", read("notes/plan.md"))
            self.assertIn("type: inbox", read("inbox.md"))
            self.assertTrue(os.path.isfile(os.path.join(src, "tareas.md")))  # source untouched
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
