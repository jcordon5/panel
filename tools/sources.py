# -*- coding: utf-8 -*-
"""
Sources: what you hand to Panel so your AI can turn it into minutes, tasks and knowledge
(a meeting transcript, an email, a chat you pasted). Standard library only.

    to_markdown(name, data) -> {"kind", "title", "date", "from", "text"}

Formats: .vtt and .docx (Teams/Zoom/Meet transcripts), .eml, .msg (Outlook), .txt, .md.
Obvious secrets (passwords, tokens, private keys) are hidden before anything is stored.
Sources are temporary: the AI deletes each one once it has been processed.
"""
import email
import html
import io
import re
import struct
import zipfile
from datetime import datetime, timedelta, timezone
from email import policy

SOURCE_EXT = (".vtt", ".docx", ".eml", ".msg", ".txt", ".md")


# --------------------------------------------------------------------------- secrets

_SECRET_KV = re.compile(r"(?i)\b(password|passwd|contrase(?:ñ|n)a|pwd|secret|token|api[_ -]?key|clave)(\s*[:=]\s*)(\S+)")
_BEARER = re.compile(r"(?i)\b(bearer\s+)[A-Za-z0-9._~+/=-]{12,}")
_PRIVATE_KEY = re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----")


def redact(text):
    """Hide obvious secrets: "password: x", bearer tokens, private keys."""
    text = _PRIVATE_KEY.sub("[private key removed]", text or "")
    text = _BEARER.sub(r"\1[removed]", text)
    return _SECRET_KV.sub(lambda m: m.group(1) + m.group(2) + "[removed]", text)


# --------------------------------------------------------------------------- transcripts

_CUE = re.compile(r"(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{3}[^\n]*")


def vtt_to_text(text):
    """WebVTT -> "Speaker: what they said" lines, consecutive turns of the same speaker merged."""
    turns = []
    for block in re.split(r"\n\s*\n", text.replace("\r\n", "\n")):
        m = _CUE.search(block)
        if not m:
            continue
        body = block[m.end():].strip()
        if not body:
            continue
        speaker = ""
        voices = re.findall(r"<v\s+([^>]+)>(.*?)(?:</v>|$)", body, re.S)
        if voices:
            speaker = voices[0][0].strip()
            body = " ".join(v[1] for v in voices)
        else:
            sm = re.match(r"^([^:\n]{2,60}):\s+(.*)$", body, re.S)
            if sm:
                speaker, body = sm.group(1).strip(), sm.group(2)
        body = re.sub(r"<[^>]+>", "", body).replace("\n", " ").strip()
        if not body:
            continue
        if turns and turns[-1][0] == speaker:
            turns[-1][1].append(body)
        else:
            turns.append((speaker, [body]))
    return "\n\n".join(("**%s:** " % s if s else "") + " ".join(b) for s, b in turns)


def docx_to_text(data):
    """Paragraphs of a .docx (a Teams transcript downloaded as Word, or any document)."""
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        xml = z.read("word/document.xml").decode("utf-8", "replace")
    paras = []
    for p in re.findall(r"<w:p[ >].*?</w:p>", xml, re.S):
        t = "".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", p, re.S))
        t = html.unescape(re.sub(r"<[^>]+>", "", t)).strip()
        if t:
            paras.append(t)
    return "\n\n".join(paras)


# --------------------------------------------------------------------------- email

def _html_to_text(s):
    s = re.sub(r"(?is)<(script|style|head)[^>]*>.*?</\1>", "", s)
    s = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>|</tr>", "\n", s)
    s = html.unescape(re.sub(r"<[^>]+>", "", s))
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", s)).strip()


def eml_to_text(data):
    msg = email.message_from_bytes(data, policy=policy.default)
    body = msg.get_body(preferencelist=("plain", "html"))
    text = body.get_content() if body else ""
    if body is not None and body.get_content_type() == "text/html":
        text = _html_to_text(text)
    date = None
    try:
        date = email.utils.parsedate_to_datetime(msg["date"]).date().isoformat() if msg["date"] else None
    except (TypeError, ValueError):
        pass
    return {"title": str(msg["subject"] or ""), "from": str(msg["from"] or ""), "to": str(msg["to"] or ""), "cc": str(msg["cc"] or ""),
            "date": date, "text": text.strip()}


class _Cfb:
    """Just enough of the Compound File Binary format (what an Outlook .msg is) to read its top-level streams."""

    def __init__(self, data):
        if data[:8] != b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
            raise ValueError("not an Outlook .msg file")
        self.d = data
        self.ss = 1 << struct.unpack_from("<H", data, 0x1E)[0]
        self.mss = 1 << struct.unpack_from("<H", data, 0x20)[0]
        self.cutoff = struct.unpack_from("<I", data, 0x38)[0]
        difat = [x for x in struct.unpack_from("<109I", data, 0x4C) if x < 0xFFFFFFFA]
        nxt, n = struct.unpack_from("<II", data, 0x44)
        per = self.ss // 4 - 1
        while n and nxt < 0xFFFFFFFA:
            vals = struct.unpack_from("<%dI" % (per + 1), data, self._off(nxt))
            difat += [x for x in vals[:per] if x < 0xFFFFFFFA]
            nxt, n = vals[per], n - 1
        self.fat = []
        for s in difat:
            self.fat += struct.unpack_from("<%dI" % (self.ss // 4), data, self._off(s))
        dirs = self._chain(struct.unpack_from("<I", data, 0x30)[0])
        self.entries = []
        for i in range(len(dirs) // 128):
            e = dirs[i * 128:(i + 1) * 128]
            n_len = struct.unpack_from("<H", e, 64)[0]
            self.entries.append({
                "name": e[:max(0, n_len - 2)].decode("utf-16-le", "replace"), "type": e[66],
                "left": struct.unpack_from("<I", e, 68)[0], "right": struct.unpack_from("<I", e, 72)[0], "child": struct.unpack_from("<I", e, 76)[0],
                "start": struct.unpack_from("<I", e, 116)[0], "size": struct.unpack_from("<I", e, 120)[0]})
        root = self.entries[0]
        self.mini = self._chain(root["start"]) if root["start"] < 0xFFFFFFFA else b""
        mf = struct.unpack_from("<I", data, 0x3C)[0]
        mfat = self._chain(mf) if mf < 0xFFFFFFFA else b""
        self.minifat = list(struct.unpack_from("<%dI" % (len(mfat) // 4), mfat)) if mfat else []

    def _off(self, sector):
        return (sector + 1) * self.ss

    def _chain(self, start):
        out, s, seen = [], start, set()
        while s < 0xFFFFFFFA and s not in seen and s < len(self.fat):
            seen.add(s)
            out.append(self.d[self._off(s):self._off(s) + self.ss])
            s = self.fat[s]
        return b"".join(out)

    def _stream(self, e):
        if e["size"] >= self.cutoff:
            return self._chain(e["start"])[:e["size"]]
        out, s, seen = [], e["start"], set()
        while s < 0xFFFFFFFA and s not in seen and s < len(self.minifat):
            seen.add(s)
            out.append(self.mini[s * self.mss:(s + 1) * self.mss])
            s = self.minifat[s]
        return b"".join(out)[:e["size"]]

    def top_streams(self):
        """{name: bytes} of the streams directly under the root (the message's own properties)."""
        out, stack, seen = {}, [self.entries[0]["child"]], set()
        while stack:
            i = stack.pop()
            if i >= len(self.entries) or i in seen:
                continue
            seen.add(i)
            e = self.entries[i]
            stack += [e["left"], e["right"]]
            if e["type"] == 2:
                out[e["name"]] = self._stream(e)
        return out


def msg_to_text(data):
    """Subject, sender, recipients, date and body of an Outlook .msg (dragged out of Outlook)."""
    streams = _Cfb(data).top_streams()

    def prop(pid):
        for kind, codec in (("001F", "utf-16-le"), ("001E", "cp1252")):
            raw = streams.get("__substg1.0_%s%s" % (pid, kind))
            if raw is not None:
                return raw.decode(codec, "replace").rstrip("\x00")
        return ""

    text = prop("1000")
    if not text.strip():
        raw = streams.get("__substg1.0_10130102")
        text = _html_to_text(raw.decode("utf-8", "replace")) if raw else ""
    date = None
    props = streams.get("__properties_version1.0", b"")
    for off in range(32, len(props) - 15, 16):
        ptype, pid = struct.unpack_from("<HH", props, off)
        if pid in (0x0039, 0x0E06) and ptype == 0x0040:
            ft = struct.unpack_from("<Q", props, off + 8)[0]
            if ft:
                date = (datetime(1601, 1, 1, tzinfo=timezone.utc) + timedelta(microseconds=ft // 10)).date().isoformat()
                break
    sender = prop("0C1A")
    addr = prop("0C1F") or prop("5D01")
    return {"title": prop("0037"), "from": "%s <%s>" % (sender, addr) if sender and "@" in addr else sender or addr,
            "to": prop("0E04"), "cc": prop("0E03"), "date": date, "text": text.replace("\r\n", "\n").strip()}


# --------------------------------------------------------------------------- entry point

def to_markdown(name, data=None, text=None):
    """A file (name + bytes) or pasted text -> {"kind", "title", "date", "from", "text"} (Markdown body)."""
    low = (name or "").lower()
    out = {"kind": "note", "title": re.sub(r"\.[a-z0-9]+$", "", name or "").strip(), "date": None, "from": "", "text": ""}
    if text is not None:
        out["text"] = text.strip()
    elif low.endswith(".vtt"):
        out.update(kind="transcript", text=vtt_to_text(data.decode("utf-8-sig", "replace")))
    elif low.endswith(".docx"):
        out.update(kind="transcript" if re.search(r"transcri", low) else "document", text=docx_to_text(data))
    elif low.endswith(".eml") or low.endswith(".msg"):
        m = eml_to_text(data) if low.endswith(".eml") else msg_to_text(data)
        head = ["**%s** %s" % (label, m[k]) for label, k in (("From:", "from"), ("To:", "to"), ("Cc:", "cc")) if m.get(k)]
        out.update(kind="email", title=m["title"] or out["title"], date=m["date"], text="\n".join(head) + ("\n\n" if head else "") + m["text"])
        out["from"] = m["from"]
    elif low.endswith((".txt", ".md")):
        out["text"] = data.decode("utf-8-sig", "replace").replace("\r\n", "\n").strip()
    else:
        raise ValueError("unsupported file type")
    out["text"] = redact(out["text"])
    return out
