# -*- coding: utf-8 -*-
"""The agent skill's script reads and writes the vault exactly like the app."""
import contextlib
import io
import os
import shutil
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.path.insert(0, os.path.join(ROOT, "skills", "panel-vault", "scripts"))
import make_demo  # noqa: E402
import panel_vault  # noqa: E402


class SkillTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="panel-skill-")
        self.vault = make_demo.make(os.path.join(self.tmp, "vault"), "es")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_cmd(self, *args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            panel_vault.main(["--vault", self.vault] + list(args))
        return out.getvalue()

    def read(self, rel):
        with open(os.path.join(self.vault, rel), encoding="utf-8") as f:
            return f.read()

    def test_memory_commands(self):
        pending = self.run_cmd("pending")
        self.assertIn("1-1-con-javi", pending)
        self.assertIn("## Sources to process (0)", pending)
        self.assertIn("Ana García — Responsable de compras", self.run_cmd("people"))
        waiting = self.run_cmd("waiting")
        self.assertIn("@Ana revisar el contrato marco", waiting)
        self.assertIn("@Luis enviar el inventario", waiting)
        self.assertNotIn("@", self.run_cmd("actions"), "others' tasks are not your actions")
        self.assertNotIn("Coste del servicio gestionado", self.run_cmd("actions"), "agenda items are not actions")
        self.assertIn("Daily del equipo · weekdays", self.run_cmd("series"))
        self.assertIn("dar-de-alta-un-proveedor", self.run_cmd("search", "alta proveedor"))
        meeting = self.run_cmd("meeting", "sync con el proveedor")
        self.assertIn("Ana García  → Ana García (Responsable de compras, Compras)", meeting)
        self.assertIn("Proveedor  (no person card)", meeting)

    def test_processing_a_meeting(self):
        rel = "meetings/" + [n for n in os.listdir(os.path.join(self.vault, "meetings")) if "daily" in n][0]
        self.run_cmd("write", rel, "--section", "summary", "--text", "- Todo en verde.\n- Falta hablar de vacaciones.")
        self.run_cmd("write", rel, "--section", "tasks", "--text", "- [ ] @Sara compartir los diseños")
        self.run_cmd("mark-processed", rel)
        text = self.read(rel)
        self.assertRegex(text, r"# Daily del equipo\n\n## Resumen\n\n- Todo en verde\.\n- Falta hablar de vacaciones\.\n\n## Para comentar")
        self.assertRegex(text, r"- \[ \] @Luis revisar los permisos de red\n- \[ \] @Sara compartir los diseños\n")
        self.assertRegex(text, r"processed: \d{4}-\d{2}-\d{2}")
        self.assertNotIn("daily-del-equipo", self.run_cmd("pending"))
        self.run_cmd("add-person", "--name", "Jorge Martín", "--role", "Desarrollador", "--ask-for", "API, despliegues")
        self.assertRegex(self.read("people/jorge-martin.md"), r"type: person\ntitle: Jorge Martín\nrole: Desarrollador\naliases: \[\]\nask_for: \[API, despliegues\]")
        self.run_cmd("add-knowledge", "--title", "Cómo desplegar", "--kind", "howto", "--people", "Jorge Martín", "--body", "1. Pedirlo.")
        self.assertIn("kind: howto", self.read("knowledge/como-desplegar.md"))
        self.assertIn("Cómo desplegar", self.run_cmd("person", "jorge"))
        os.makedirs(os.path.join(self.vault, "sources"), exist_ok=True)
        with open(os.path.join(self.vault, "sources", "2026-10-29-chat.md"), "w", encoding="utf-8") as f:
            f.write("---\ntype: source\nkind: chat\ntitle: Chat\n---\n\nhola\n")
        self.assertIn("[chat] Chat", self.run_cmd("pending"))
        self.run_cmd("source-done", "sources/2026-10-29-chat.md")
        self.assertFalse(os.path.exists(os.path.join(self.vault, "sources", "2026-10-29-chat.md")))
        self.assertTrue(any("chat" in n for n in os.listdir(os.path.join(self.vault, ".trash"))))


if __name__ == "__main__":
    unittest.main()
