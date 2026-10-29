# -*- coding: utf-8 -*-
"""Sources: transcripts, emails and pasted text become Markdown for the AI to process."""
import io
import os
import struct
import sys
import unittest
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))
import sources  # noqa: E402

END, FREE, FATSECT = 0xFFFFFFFE, 0xFFFFFFFF, 0xFFFFFFFD


def make_cfb(streams):
    """A minimal Compound File (v3, 512-byte sectors) with small streams in the mini stream, like Outlook writes."""
    names = list(streams)
    mini, minifat, starts = b"", [], []
    for n in names:
        data = streams[n]
        first = len(mini) // 64
        nsec = max(1, (len(data) + 63) // 64)
        starts.append(first)
        minifat += [first + i + 1 for i in range(nsec - 1)] + [END]
        mini += data.ljust(nsec * 64, b"\0")
    nd = ((len(names) + 1) * 128 + 511) // 512
    nm = max(1, (len(minifat) * 4 + 511) // 512)
    s0 = 1 + nd + nm  # sectors: FAT, directory, mini FAT, mini stream
    entries = [("Root Entry", 5, 1 if names else FREE, FREE, s0, len(mini))]
    for i, n in enumerate(names):
        entries.append((n, 2, FREE, i + 2 if i + 1 < len(names) else FREE, starts[i], len(streams[n])))
    dir_bytes = b""
    for name, typ, child, right, start, size in entries:
        nb = (name + "\0").encode("utf-16-le")
        e = nb.ljust(64, b"\0") + struct.pack("<HBB", len(nb), typ, 1) + struct.pack("<III", FREE, right, child)
        e += b"\0" * 36 + struct.pack("<III", start, size, 0)
        dir_bytes += e
    dir_bytes = dir_bytes.ljust(((len(dir_bytes) + 511) // 512) * 512, b"\0")
    mf_bytes = struct.pack("<%dI" % len(minifat), *minifat)
    mf_bytes = mf_bytes.ljust(((len(mf_bytes) + 511) // 512) * 512, b"\xff")
    ms_bytes = mini.ljust(((len(mini) + 511) // 512) * 512, b"\0")
    ns = len(ms_bytes) // 512
    fat = [FATSECT]
    def chain(first, n):
        return [first + i + 1 for i in range(n - 1)] + [END]
    d0 = 1; fat += chain(d0, nd)
    m0 = d0 + nd; fat += chain(m0, nm)
    s0 = m0 + nm; fat += chain(s0, ns)
    fat_bytes = struct.pack("<%dI" % len(fat), *fat).ljust(512, b"\xff")
    header = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\0" * 16 + struct.pack("<HHHHH", 0x3E, 3, 0xFFFE, 9, 6) + b"\0" * 6
    header += struct.pack("<IIIIIIIII", 0, 1, d0, 0, 4096, m0, nm, END, 0)
    header += struct.pack("<109I", 0, *([FREE] * 108))
    return header + fat_bytes + dir_bytes + mf_bytes + ms_bytes


class SourcesTest(unittest.TestCase):
    def test_vtt_turns_are_merged_by_speaker(self):
        vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n<v Ana García>Hola a todos.</v>\n\n00:00:03.500 --> 00:00:05.000\n<v Ana García>Empezamos.</v>\n\n00:00:06.000 --> 00:00:08.000\n<v Luis>¿Qué tal el piloto?</v>\n"
        out = sources.to_markdown("Reunión semanal.vtt", vtt.encode())
        self.assertEqual(out["kind"], "transcript")
        self.assertEqual(out["text"], "**Ana García:** Hola a todos. Empezamos.\n\n**Luis:** ¿Qué tal el piloto?")

    def test_docx_paragraphs(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("word/document.xml", '<w:document><w:body><w:p><w:r><w:t>Ana  0:01</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Hola &amp; adiós</w:t></w:r></w:p></w:body></w:document>')
        out = sources.to_markdown("transcripcion.docx", buf.getvalue())
        self.assertEqual((out["kind"], out["text"]), ("transcript", "Ana  0:01\n\nHola & adiós"))

    def test_eml_with_html_body(self):
        eml = ("From: Ana <ana@example.com>\r\nTo: yo@example.com\r\nSubject: Agenda del taller\r\nDate: Tue, 27 Oct 2026 10:00:00 +0100\r\n"
               "Content-Type: text/html; charset=utf-8\r\n\r\n<p>Hola,</p><p>El taller empieza a las diez.<br>Un saludo</p>").encode()
        out = sources.to_markdown("correo.eml", eml)
        self.assertEqual((out["kind"], out["title"], out["date"]), ("email", "Agenda del taller", "2026-10-27"))
        self.assertIn("**From:** Ana <ana@example.com>", out["text"])
        self.assertIn("El taller empieza a las diez.\nUn saludo", out["text"])

    def test_outlook_msg(self):
        u = lambda s: s.encode("utf-16-le")
        props = b"\0" * 32 + struct.pack("<HHIQ", 0x0040, 0x0039, 0, 133432272000000000)  # 2023-10-27 (FILETIME)
        msg = make_cfb({
            "__substg1.0_0037001F": u("Presupuesto del evento"),
            "__substg1.0_0C1A001F": u("Luis Pérez"),
            "__substg1.0_0C1F001F": u("luis@example.com"),
            "__substg1.0_0E04001F": u("Yo"),
            "__substg1.0_1000001F": u("Te adjunto el presupuesto revisado.\r\nSaludos"),
            "__properties_version1.0": props,
        })
        out = sources.to_markdown("Presupuesto.msg", msg)
        self.assertEqual((out["kind"], out["title"], out["from"]), ("email", "Presupuesto del evento", "Luis Pérez <luis@example.com>"))
        self.assertEqual(out["date"][:4], "2023")
        self.assertIn("Te adjunto el presupuesto revisado.\nSaludos", out["text"])
        with self.assertRaises(ValueError):
            sources.to_markdown("x.msg", b"not a msg")

    def test_pasted_text_and_secrets(self):
        out = sources.to_markdown("", text="Chat:\nla clave: hunter2 y el token=abc123\nBearer abcdefghijklmnopqrstuvwxyz")
        self.assertEqual(out["kind"], "note")
        self.assertNotIn("hunter2", out["text"])
        self.assertNotIn("abc123", out["text"])
        self.assertNotIn("abcdefghijklmnop", out["text"])
        with self.assertRaises(ValueError):
            sources.to_markdown("x.exe", b"MZ")


if __name__ == "__main__":
    unittest.main()
