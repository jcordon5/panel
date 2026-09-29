#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Migrate a Panel v1 vault ("boveda/" with semanas/, proyectos/, misc/, tablón/)
to the v2 layout. The source is never modified: everything is copied.

    python3 tools/migrate_v1.py path/to/boveda path/to/vault

v1 -> v2
    semanas/semana_2026-09-14.md (+ archivadas/)  -> weeks/2026-W38.md
    proyectos/<p>/notas.md                          -> projects/<p>/README.md
    proyectos/<p>/reuniones/260914_01_x.md          -> projects/<p>/meetings/2026-09-14-x.md
    misc/reuniones/*.md                             -> meetings/*.md
    misc/*.md                                       -> notes/*.md
    tablón/*.md                                     -> notes/*.md   (pinned: true)
    tareas.md                                       -> inbox.md
Frontmatter keys are translated (titulo -> title, fecha -> date, ...).
"""
import os
import re
import shutil
import sys
import unicodedata
from datetime import date, timedelta

KEY_MAP = {
    "titulo": "title", "título": "title", "tipo": "type", "fecha": "date",
    "proyecto": "project", "creado": "created", "actualizado": "updated",
    "inicio": "start", "asistentes": "attendees", "etiquetas": "tags",
    "hora": "time", "estado": "status",
}
TYPE_MAP = {"reunion": "meeting", "reunión": "meeting", "nota": "note", "notas": "note",
            "semana": "week", "info": "note", "tareas": "inbox"}
DAYS_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
DAYS_EN = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
DAY_LABEL = {"es": ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"],
             "en": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]}
MONTHS = {"es": ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
          "en": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]}
WEEK_WORD = {"es": "Semana", "en": "Week"}


def nfc(s):
    return unicodedata.normalize("NFC", s)


def looks_like_v1(path):
    if not path or not os.path.isdir(path):
        return False
    names = {nfc(n).lower() for n in os.listdir(path)}
    return bool(names & {"semanas", "proyectos", "misc", "tablón", "tablon"})


def read(path):
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        return f.read().replace("\r\n", "\n").replace("\r", "\n")


def write(path, text, report):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    base, ext = os.path.splitext(path)
    n = 2
    while os.path.exists(path):
        path = "%s-%d%s" % (base, n, ext)
        n += 1
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    report["written"] += 1
    return path


def slugify(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:60] or "untitled"


def split_fm(text):
    m = re.match(r"^---\n(.*?)\n---\n?", text, re.S)
    if not m:
        return [], text
    return m.group(1).split("\n"), text[m.end():]


def fm_get(lines, *keys):
    for line in lines:
        m = re.match(r"^([\wÀ-ſ-]+):\s*(.*)$", line)
        if m and nfc(m.group(1)).lower() in keys:
            return m.group(2).strip().strip('"\'')
    return None


def translate_fm(lines, overrides=None, drop=()):
    """Translate v1 keys/values; overrides replace or append keys (ordered)."""
    overrides = dict(overrides or {})
    out, seen = [], set()
    for line in lines:
        m = re.match(r"^([\wÀ-ſ-]+):(.*)$", line)
        if not m:
            out.append(line)
            continue
        key = KEY_MAP.get(nfc(m.group(1)).lower(), m.group(1))
        val = m.group(2)
        if key in drop or key in seen:
            continue
        seen.add(key)
        if key in overrides:
            val = " " + str(overrides.pop(key))
        elif key == "type":
            val = " " + TYPE_MAP.get(val.strip().lower(), val.strip())
        out.append(key + ":" + val)
    for k, v in overrides.items():
        out.append("%s: %s" % (k, v))
    return out


def join_fm(lines, body):
    return "---\n" + "\n".join(lines) + "\n---\n" + (body if body.startswith("\n") else "\n" + body)


def date_from_prefix(name):
    m = re.match(r"^(\d{2})(\d{2})(\d{2})_", name)
    if m:
        return "20%s-%s-%s" % m.groups()
    m = re.match(r"^(\d{4}-\d{2}-\d{2})", name)
    return m.group(1) if m else None


def strip_prefix(name):
    name = re.sub(r"^\d{6}_(\d+_)?", "", name)
    return re.sub(r"\.md$", "", name)


def iso_week(d):
    y, w, _ = d.isocalendar()
    return "%d-W%02d" % (y, w)


# --------------------------------------------------------------------------- weeks

def convert_week(text, start, lang):
    fm, body = split_fm(text)
    days = [start + timedelta(days=i) for i in range(7)]
    sections = [[] for _ in range(7)]  # lines per day
    preamble, cur = [], None
    for line in body.split("\n"):
        m = re.match(r"^##\s+(\S+)", line)
        if m and not line.startswith("###"):
            word = nfc(m.group(1)).lower().strip(":·,")
            idx = DAYS_ES.index(word) if word in DAYS_ES else DAYS_EN.index(word) if word in DAYS_EN else None
            if idx is not None:
                cur = idx
                continue
        if cur is None:
            if not re.match(r"^#\s", line):  # the old H1 is regenerated
                preamble.append(line)
        else:
            sections[cur].append(line)

    def clean_day(lines):
        # drop empty "### Mañana" / "### Tarde" blocks, keep everything else verbatim
        blocks, curb = [], {"head": None, "lines": []}
        for line in lines:
            if line.startswith("### "):
                blocks.append(curb)
                curb = {"head": line, "lines": []}
            else:
                curb["lines"].append(line)
        blocks.append(curb)
        out = []
        for b in blocks:
            content = [l for l in b["lines"]]
            while content and not content[-1].strip():
                content.pop()
            while content and not content[0].strip():
                content.pop(0)
            if b["head"] is None:
                out.extend(content)
            elif content:
                if out:
                    out.append("")
                out.append(b["head"])
                out.extend(content)
        return out

    end = days[6]
    m1, m2 = MONTHS[lang][start.month - 1], MONTHS[lang][end.month - 1]
    title = "%s %d · %d %s – %d %s %d" % (WEEK_WORD[lang], start.isocalendar()[1], start.day, m1, end.day, m2, end.year)
    new_fm = translate_fm(fm, overrides={"type": "week", "week": iso_week(start), "start": start.isoformat(), "title": title}, drop=("status",))
    order = ["type", "title", "week", "start"]
    new_fm.sort(key=lambda l: order.index(l.split(":")[0]) if l.split(":")[0] in order else 99)
    out = ["# " + title, ""]
    pre = "\n".join(preamble).strip()
    if pre:
        out += [pre, ""]
    for i, d in enumerate(days):
        out.append("## %s · %s" % (DAY_LABEL[lang][i], d.isoformat()))
        out.append("")
        lines = clean_day(sections[i])
        if lines:
            out += lines + [""]
    return join_fm(new_fm, "\n".join(out).rstrip() + "\n")


# --------------------------------------------------------------------------- main

def migrate(src, dst, lang="es"):
    lang = lang if lang in DAY_LABEL else "es"
    report = {"written": 0, "items": [], "warnings": []}

    def note(a, b):
        report["items"].append({"from": os.path.relpath(a, src).replace(os.sep, "/"),
                                "to": os.path.relpath(b, dst).replace(os.sep, "/")})

    handled = set()
    entries = {nfc(n).lower(): os.path.join(src, n) for n in os.listdir(src)}

    # ---- weeks: pick the newest copy when active and archived versions coexist
    weeks = {}
    sem = entries.get("semanas")
    if sem:
        for folder in (sem, os.path.join(sem, "archivadas")):
            if not os.path.isdir(folder):
                continue
            for name in os.listdir(folder):
                p = os.path.join(folder, name)
                m = re.match(r"^semana_(\d{4}-\d{2}-\d{2})\.md$", name)
                if not m:
                    if name.lower() != "leeme.md" and os.path.isfile(p):
                        report["warnings"].append("skipped " + os.path.relpath(p, src))
                    handled.add(p)
                    continue
                handled.add(p)
                key = m.group(1)
                if key not in weeks or os.path.getmtime(p) > os.path.getmtime(weeks[key]):
                    weeks[key] = p
        for key, p in sorted(weeks.items()):
            y, mo, d = map(int, key.split("-"))
            start = date(y, mo, d)
            start -= timedelta(days=start.weekday())
            out = os.path.join(dst, "weeks", iso_week(start) + ".md")
            note(p, write(out, convert_week(read(p), start, lang), report))

    # ---- projects
    proy = entries.get("proyectos")
    if proy and os.path.isdir(proy):
        for pname in sorted(os.listdir(proy)):
            pdir = os.path.join(proy, pname)
            if not os.path.isdir(pdir):
                continue
            pslug = pname if re.match(r"^[A-Za-z0-9_-]+$", pname) else slugify(pname)
            has_readme = False
            for dirpath, _dn, files in os.walk(pdir):
                for name in sorted(files):
                    p = os.path.join(dirpath, name)
                    handled.add(p)
                    rel = os.path.relpath(p, pdir).replace(os.sep, "/")
                    if name == ".gitkeep":
                        continue
                    if not name.endswith(".md"):
                        out = os.path.join(dst, "projects", pslug, rel)
                        os.makedirs(os.path.dirname(out), exist_ok=True)
                        shutil.copy2(p, out)
                        note(p, out)
                        continue
                    fm, body = split_fm(read(p))
                    if rel.lower() == "notas.md":
                        title = fm_get(fm, "titulo", "title") or pname.replace("_", " ").capitalize()
                        lines = translate_fm(fm, overrides={"type": "project", "title": title, "project": pslug, "status": "active"})
                        out = os.path.join(dst, "projects", pslug, "README.md")
                        has_readme = True
                        if not body.strip():
                            body = "\n# %s\n" % title
                    elif rel.lower().startswith("reuniones/"):
                        dt = fm_get(fm, "fecha", "date") or date_from_prefix(name) or "0000-00-00"
                        lines = translate_fm(fm, overrides={"type": "meeting", "date": dt, "project": pslug})
                        out = os.path.join(dst, "projects", pslug, "meetings", "%s-%s.md" % (dt, slugify(strip_prefix(name))))
                    else:
                        lines = translate_fm(fm, overrides={"project": pslug}) if fm else []
                        out = os.path.join(dst, "projects", pslug, rel)
                    text = join_fm(lines, body) if lines else body
                    note(p, write(out, text, report))
            if not has_readme:
                title = pname.replace("_", " ").capitalize()
                out = os.path.join(dst, "projects", pslug, "README.md")
                write(out, join_fm(["type: project", "title: " + title, "project: " + pslug, "status: active"], "\n# %s\n" % title), report)

    # ---- misc: meetings + loose notes
    misc = entries.get("misc")
    if misc and os.path.isdir(misc):
        for dirpath, _dn, files in os.walk(misc):
            for name in sorted(files):
                p = os.path.join(dirpath, name)
                handled.add(p)
                if name == ".gitkeep":
                    continue
                rel = os.path.relpath(p, misc).replace(os.sep, "/")
                if not name.endswith(".md"):
                    out = os.path.join(dst, "notes", rel)
                    os.makedirs(os.path.dirname(out), exist_ok=True)
                    shutil.copy2(p, out)
                    continue
                fm, body = split_fm(read(p))
                if rel.lower().startswith("reuniones/"):
                    dt = fm_get(fm, "fecha", "date") or date_from_prefix(name) or "0000-00-00"
                    lines = translate_fm(fm, overrides={"type": "meeting", "date": dt})
                    out = os.path.join(dst, "meetings", "%s-%s.md" % (dt, slugify(strip_prefix(name))))
                else:
                    lines = translate_fm(fm, overrides={"type": "note"})
                    out = os.path.join(dst, "notes", slugify(strip_prefix(name)) + ".md")
                note(p, write(out, join_fm(lines, body), report))

    # ---- tablón (board) -> pinned notes
    tab = entries.get("tablón") or entries.get("tablon")
    if tab and os.path.isdir(tab):
        for dirpath, _dn, files in os.walk(tab):
            for name in sorted(files):
                p = os.path.join(dirpath, name)
                handled.add(p)
                if not name.endswith(".md"):
                    continue
                fm, body = split_fm(read(p))
                dt = fm_get(fm, "fecha", "date") or date_from_prefix(name)
                ov = {"type": "note", "pinned": "true"}
                if dt:
                    ov["date"] = dt
                out = os.path.join(dst, "notes", slugify(strip_prefix(name)) + ".md")
                note(p, write(out, join_fm(translate_fm(fm, overrides=ov), body), report))

    # ---- tareas.md -> inbox.md
    tareas = entries.get("tareas.md")
    if tareas:
        handled.add(tareas)
        fm, body = split_fm(read(tareas))
        lines = translate_fm(fm, overrides={"type": "inbox"})
        note(tareas, write(os.path.join(dst, "inbox.md"), join_fm(lines, body), report))

    # ---- anything else: copied as-is (keeping relative paths)
    for dirpath, _dn, files in os.walk(src):
        for name in files:
            p = os.path.join(dirpath, name)
            if p in handled or name.startswith(".") or (name.lower() == "leeme.md" and dirpath != src):
                continue
            rel = os.path.relpath(p, src)
            out = os.path.join(dst, "notes", "legacy", rel) if name.endswith(".md") else os.path.join(dst, "assets", "legacy", rel)
            if name.endswith(".md"):
                fm, body = split_fm(read(p))
                note(p, write(out, join_fm(translate_fm(fm), body) if fm else body, report))
            else:
                os.makedirs(os.path.dirname(out), exist_ok=True)
                shutil.copy2(p, out)
                note(p, out)
    return report


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 1
    src, dst = argv[1], argv[2]
    lang = argv[3] if len(argv) > 3 else "es"
    if not looks_like_v1(src):
        print("Source does not look like a Panel v1 vault: " + src)
        return 1
    if os.path.isdir(dst) and any(n.endswith(".md") for _d, _n, fs in os.walk(dst) for n in fs):
        print("Destination already contains Markdown files; choose an empty folder.")
        return 1
    rep = migrate(src, dst, lang)
    for it in rep["items"]:
        print("  %s  ->  %s" % (it["from"], it["to"]))
    for w in rep["warnings"]:
        print("  ! " + w)
    print("Done: %d files written to %s" % (rep["written"], dst))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
