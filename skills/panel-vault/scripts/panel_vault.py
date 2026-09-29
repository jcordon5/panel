#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
panel_vault.py — read and update a Panel vault (plain Markdown) from the command line.
Standard library only (Python 3.7+). Output is plain text meant for an AI agent or a human.

Vault location: --vault PATH, else $PANEL_VAULT, else the current folder if it looks like a
vault (inbox.md / weeks/), else ./vault.

Read
  day [DATE]                      plan of a day (tasks + meetings in order), overdue, unplaced meetings
  week [DATE]                     plan of the whole ISO week containing DATE
  overdue                         open tasks from past days
  inbox                           tasks without a date
  meetings [--from D] [--to D] [--project SLUG]
  actions [--project SLUG] [--since D]   open "- [ ]" items inside meetings / notes / project docs
  project SLUG                    status: description, meetings, open tasks
  projects                        list projects and their status

Write (atomic, keeps frontmatter, bumps `updated`)
  add-task TEXT [--date D | --inbox] [--project SLUG]
  done PATTERN [--date D] [--reopen]      check (or uncheck) the task whose text contains PATTERN
  move PATTERN (--to D | --to-inbox) [--from D]
  new-meeting --title T --date D [--time HH:MM] [--project SLUG] [--attendees "Ana, Luis"]
              [--template NAME] [--notes TEXT]

DATE accepts YYYY-MM-DD, "today", "tomorrow", "yesterday" or +N / -N days.
"""
import argparse
import os
import re
import sys
import unicodedata
from datetime import date, timedelta

TASK_RE = re.compile(r"^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s+(\S.*)$")
REF_RE = re.compile(r"^(\s*)[-*+]\s+\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]\s*$")
TIME_RE = re.compile(r"^(\d{1,2}[:.]\d{2})")
FM_RE = re.compile(r"^---[ \t]*\n(.*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)", re.S)
DAYS = {"es": ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"],
        "en": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]}
MONTHS = {"es": ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
          "en": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]}
WEEKDAY_WORDS = [["lunes", "monday"], ["martes", "tuesday"], ["miercoles", "wednesday"], ["jueves", "thursday"],
                 ["viernes", "friday"], ["sabado", "saturday"], ["domingo", "sunday"]]
KEY_ALIASES = {"titulo": "title", "título": "title", "tipo": "type", "fecha": "date", "proyecto": "project",
               "creado": "created", "actualizado": "updated", "asistentes": "attendees", "hora": "time", "estado": "status"}


# --------------------------------------------------------------------------- basics

def fold(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii").lower()


def slugify(s, n=50):
    s = re.sub(r"[^a-z0-9]+", "-", fold(s)).strip("-")
    return s[:n].rstrip("-") or "untitled"


def parse_date(s):
    s = (s or "today").strip().lower()
    t = date.today()
    if s in ("today", "hoy"):
        return t
    if s in ("tomorrow", "mañana", "manana"):
        return t + timedelta(days=1)
    if s in ("yesterday", "ayer"):
        return t - timedelta(days=1)
    if re.match(r"^[+-]\d+$", s):
        return t + timedelta(days=int(s))
    return date.fromisoformat(s)


def monday(d):
    return d - timedelta(days=d.weekday())


def week_id(d):
    y, w, _ = d.isocalendar()
    return "%d-W%02d" % (y, w)


class Vault(object):
    def __init__(self, root):
        self.root = os.path.abspath(root)

    def p(self, rel):
        return os.path.join(self.root, *rel.split("/"))

    def read(self, rel):
        try:
            with open(self.p(rel), encoding="utf-8-sig") as f:
                return f.read().replace("\r\n", "\n")
        except (IOError, OSError):
            return None

    def write(self, rel, text):
        full = self.p(rel)
        d = os.path.dirname(full)
        if not os.path.isdir(d):
            os.makedirs(d)
        tmp = full + ".tmp-agent"
        with open(tmp, "w", encoding="utf-8", newline="\n") as f:
            f.write(text if text.endswith("\n") else text + "\n")
        os.replace(tmp, full)

    def md_files(self, sub=""):
        base = self.p(sub) if sub else self.root
        out = []
        for dp, dn, fn in os.walk(base):
            dn[:] = sorted(x for x in dn if not x.startswith("."))
            for n in sorted(fn):
                if n.endswith(".md"):
                    out.append(os.path.relpath(os.path.join(dp, n), self.root).replace(os.sep, "/"))
        return out

    def lang(self):
        for rel in self.md_files("weeks")[:5]:
            if re.search(r"^## (Lunes|Martes|Miércoles|Jueves|Viernes)", self.read(rel) or "", re.M):
                return "es"
        readme = self.read("README.md") or ""
        return "es" if "bóveda" in readme.lower() else "en"


def frontmatter(text):
    m = FM_RE.match(text or "")
    fm = {}
    if not m:
        return fm, 0
    for line in m.group(1).split("\n"):
        km = re.match(r"^([^\s:#][^:]*?):\s*(.*)$", line)
        if km:
            k = KEY_ALIASES.get(km.group(1).strip().lower(), km.group(1).strip())
            v = km.group(2).strip().strip('"\'')
            if v.startswith("[") and v.endswith("]"):
                v = [x.strip().strip('"\'') for x in v[1:-1].split(",") if x.strip()]
            fm.setdefault(k, v)
    return fm, m.group(0).count("\n") + (0 if m.group(0).endswith("\n") else 1)


def touch(text):
    today = date.today().isoformat()
    m = FM_RE.match(text)
    if not m:
        return text
    if re.search(r"^updated:.*$", m.group(1), re.M):
        head = re.sub(r"^updated:.*$", "updated: " + today, m.group(0), count=1, flags=re.M)
    else:
        head = m.group(0).replace("\n---", "\nupdated: " + today + "\n---", 1)
    return head + text[len(m.group(0)):]


def indent(line):
    return len(line) - len(line.lstrip(" \t"))


def block_end(lines, i, limit=None):
    limit = len(lines) if limit is None else limit
    base, j = indent(lines[i]), i + 1
    while j < limit:
        l = lines[j]
        if not l.strip():
            k = j + 1
            while k < limit and not lines[k].strip():
                k += 1
            if k < limit and indent(lines[k]) > base:
                j = k
                continue
            break
        if indent(l) > base:
            j += 1
            continue
        if re.match(r"^\s*([-*+]|\d+[.)])\s|^#{1,6}\s|^\s*>|^\s*(```|~~~)", l):
            break
        j += 1
    return j


# --------------------------------------------------------------------------- model

def title_of(v, rel):
    text = v.read(rel) or ""
    fm, _ = frontmatter(text)
    if fm.get("title"):
        return fm["title"]
    m = re.search(r"^#\s+(.+)$", text, re.M)
    return m.group(1).strip() if m else os.path.basename(rel)[:-3]


def resolve(v, target, _cache={}):
    key = (v.root, target)
    if key in _cache:
        return _cache[key]
    t = target.strip()
    cand = t if t.endswith(".md") else t + ".md"
    hit = cand if os.path.isfile(v.p(cand)) else None
    if not hit:
        name = fold(os.path.basename(t))
        for rel in v.md_files():
            if fold(os.path.basename(rel)[:-3]) == name:
                hit = rel
                break
    _cache[key] = hit
    return hit


def meeting_info(v, rel):
    text = v.read(rel) or ""
    fm, _ = frontmatter(text)
    d = fm.get("date") or (re.match(r"^(\d{4}-\d{2}-\d{2})", os.path.basename(rel)) or [None, None])[1]
    proj = fm.get("project") or (re.match(r"^projects/([^/]+)/", rel) or [None, None])[1]
    att = fm.get("attendees") or []
    return {"path": rel, "title": title_of(v, rel), "date": d, "time": fm.get("time") or "",
            "project": proj or "", "attendees": att if isinstance(att, list) else [att]}


def all_meetings(v):
    out = []
    for rel in v.md_files():
        if rel.startswith("templates/"):
            continue
        is_m = rel.startswith("meetings/") or re.match(r"^projects/[^/]+/meetings/", rel)
        if not is_m:
            fm, _ = frontmatter(v.read(rel) or "")
            is_m = fm.get("type") == "meeting"
        if is_m:
            out.append(meeting_info(v, rel))
    return sorted(out, key=lambda m: ((m["date"] or ""), m["time"]))


def week_start_of(rel, text):
    fm, _ = frontmatter(text)
    if fm.get("start"):
        return monday(date.fromisoformat(fm["start"][:10]))
    m = re.search(r"(\d{4})-W(\d{1,2})", rel)
    if m:
        return monday(date(int(m.group(1)), 1, 4)) + timedelta(weeks=int(m.group(2)) - 1)
    return None


def day_sections(lines, start, body_line=0):
    heads = [i for i in range(body_line, len(lines)) if re.match(r"^#{1,2}\s", lines[i])]
    out = []
    for n, h in enumerate(heads):
        if not lines[h].startswith("## "):
            continue
        end = heads[n + 1] if n + 1 < len(heads) else len(lines)
        m = re.search(r"(\d{4}-\d{2}-\d{2})", lines[h])
        d = None
        if m:
            d = date.fromisoformat(m.group(1))
        elif start:
            word = fold(lines[h][3:]).split()[0].strip("·:,") if lines[h][3:].split() else ""
            for i, words in enumerate(WEEKDAY_WORDS):
                if word in words:
                    d = start + timedelta(days=i)
        if d:
            out.append({"date": d, "head": h, "start": h + 1, "end": end})
    return out


def items_in(lines, a, b, path, v, day=None):
    """Top-level tasks, meeting refs and sub-headings between lines a..b."""
    out, i = [], a
    while i < b:
        l = lines[i]
        tm, rm = TASK_RE.match(l), REF_RE.match(l)
        if tm:
            e = block_end(lines, i, b)
            out.append({"type": "task", "path": path, "line": i, "done": tm.group(2) != " ", "text": tm.group(3),
                        "details": [x for x in lines[i + 1:e] if x.strip()], "date": day})
            i = e
            continue
        if rm:
            target = resolve(v, rm.group(2))
            info = meeting_info(v, target) if target else None
            out.append({"type": "ref", "path": path, "line": i, "target": rm.group(2), "meeting": info, "date": day})
            i += 1
            continue
        hm = re.match(r"^###+\s+(.*)$", l)
        if hm:
            out.append({"type": "heading", "text": hm.group(1)})
        i += 1
    return out


def week_files(v):
    return [r for r in v.md_files("weeks") if r.endswith(".md")] if os.path.isdir(v.p("weeks")) else []


def day_items(v, d):
    rel = "weeks/%s.md" % week_id(d)
    text = v.read(rel)
    if text is None:
        return []
    lines = text.split("\n")
    _, body = frontmatter(text)
    for s in day_sections(lines, week_start_of(rel, text), body):
        if s["date"] == d:
            return items_in(lines, s["start"], s["end"], rel, v, d)
    return []


def all_day_tasks(v):
    out = []
    for rel in week_files(v):
        text = v.read(rel) or ""
        lines = text.split("\n")
        _, body = frontmatter(text)
        for s in day_sections(lines, week_start_of(rel, text), body):
            out += [x for x in items_in(lines, s["start"], s["end"], rel, v, s["date"]) if x["type"] == "task"]
    return out


def inbox_items(v):
    text = v.read("inbox.md")
    if text is None:
        return []
    lines = text.split("\n")
    _, body = frontmatter(text)
    return items_in(lines, body, len(lines), "inbox.md", v)


# --------------------------------------------------------------------------- printing

def fmt_task(t, show_date=False):
    box = "[x]" if t["done"] else "[ ]"
    where = "%s:%d" % (t["path"], t["line"] + 1)
    extra = (" (%s)" % t["date"].isoformat()) if show_date and t.get("date") else ""
    out = "- %s %s%s   <%s>" % (box, t["text"], extra, where)
    for d in t.get("details", []):
        out += "\n      " + d.strip()
    return out


def fmt_meeting(m):
    bits = [m["time"] or "--:--", m["title"]]
    if m["project"]:
        bits.append("#" + m["project"])
    if m["attendees"]:
        bits.append("with " + ", ".join(m["attendees"]))
    return "- [meeting] %s   <%s>" % (" · ".join(bits), m["path"])


def print_day(v, d, header=True):
    items = day_items(v, d)
    placed = set(i["meeting"]["path"] for i in items if i["type"] == "ref" and i["meeting"])
    if header:
        print("## %s %s" % (DAYS["en"][d.weekday()], d.isoformat()))
    shown = False
    for it in items:
        if it["type"] == "task":
            print(fmt_task(it))
        elif it["type"] == "ref":
            print(fmt_meeting(it["meeting"]) if it["meeting"] else "- [[%s]] (missing file)" % it["target"])
        else:
            print("  ### " + it["text"])
        shown = True
    for m in all_meetings(v):
        if m["date"] == d.isoformat() and m["path"] not in placed:
            print(fmt_meeting(m) + "   (not placed in the day plan)")
            shown = True
    if not shown:
        print("(nothing planned)")


def cmd_day(v, a):
    d = parse_date(a.date)
    print_day(v, d)
    tasks = [t for t in day_items(v, d) if t["type"] == "task"]
    print("\n%d/%d tasks done" % (sum(t["done"] for t in tasks), len(tasks)))
    over = [t for t in all_day_tasks(v) if not t["done"] and t["date"] < d]
    if over and d >= date.today() - timedelta(days=1):
        print("\n## Overdue (open tasks from earlier days)")
        for t in sorted(over, key=lambda t: t["date"]):
            print(fmt_task(t, True))
    inbox = [t for t in inbox_items(v) if t["type"] == "task" and not t["done"]]
    if inbox:
        print("\nInbox: %d open tasks (run `inbox`)" % len(inbox))


def cmd_week(v, a):
    start = monday(parse_date(a.date))
    print("# Week %s (%s – %s)\n" % (week_id(start), start, start + timedelta(days=6)))
    for i in range(7):
        print_day(v, start + timedelta(days=i))
        print()


def cmd_overdue(v, a):
    today = date.today()
    over = [t for t in all_day_tasks(v) if not t["done"] and t["date"] < today]
    for t in sorted(over, key=lambda t: t["date"]):
        print(fmt_task(t, True))
    if not over:
        print("(no overdue tasks)")


def cmd_inbox(v, a):
    items = [t for t in inbox_items(v) if t["type"] == "task"]
    for t in items:
        print(fmt_task(t))
    if not items:
        print("(inbox is empty)")


def cmd_meetings(v, a):
    frm = parse_date(a.from_).isoformat() if a.from_ else None
    to = parse_date(a.to).isoformat() if a.to else None
    for m in all_meetings(v):
        if frm and (m["date"] or "") < frm or to and (m["date"] or "9") > to:
            continue
        if a.project and m["project"] != a.project:
            continue
        print("%s %s" % (m["date"] or "????-??-??", fmt_meeting(m)[2:]))


def doc_actions(v, project=None, since=None):
    out = []
    for rel in v.md_files():
        if rel.startswith(("weeks/", "templates/")) or rel == "inbox.md":
            continue
        text = v.read(rel) or ""
        fm, body = frontmatter(text)
        proj = fm.get("project") or (re.match(r"^projects/([^/]+)/", rel) or [None, None])[1]
        if project and proj != project:
            continue
        info = meeting_info(v, rel)
        if since and info["date"] and info["date"] < since:
            continue
        lines = text.split("\n")
        for i in range(body, len(lines)):
            m = TASK_RE.match(lines[i])
            if m and m.group(2) == " ":
                out.append({"path": rel, "line": i, "text": m.group(3), "source": info["title"], "date": info["date"]})
    return out


def cmd_actions(v, a):
    since = parse_date(a.since).isoformat() if a.since else None
    acts = doc_actions(v, a.project, since)
    for x in acts:
        print("- [ ] %s   (from: %s%s)   <%s:%d>" % (x["text"], x["source"], ", " + x["date"] if x["date"] else "", x["path"], x["line"] + 1))
    if not acts:
        print("(no open action items)")


def projects(v):
    out = []
    if not os.path.isdir(v.p("projects")):
        return out
    for slug in sorted(os.listdir(v.p("projects"))):
        if slug.startswith(".") or not os.path.isdir(v.p("projects/" + slug)):
            continue
        text = v.read("projects/%s/README.md" % slug) or ""
        fm, body = frontmatter(text)
        para = next((l.strip() for l in text.split("\n")[body:] if l.strip() and not re.match(r"^[#>\-*|]|^\d+\.", l.strip())), "")
        out.append({"slug": slug, "title": fm.get("title") or slug, "status": fm.get("status") or "active", "description": para})
    return out


def cmd_projects(v, a):
    for p in projects(v):
        print("- %s  #%s  [%s]  %s" % (p["title"], p["slug"], p["status"], p["description"][:100]))


def cmd_project(v, a):
    p = next((x for x in projects(v) if x["slug"] == a.slug), None)
    if not p:
        sys.exit("No project '%s'. Run `projects`." % a.slug)
    print("# %s  (#%s, %s)\n%s\n" % (p["title"], p["slug"], p["status"], p["description"]))
    ms = [m for m in all_meetings(v) if m["project"] == a.slug]
    print("## Meetings (%d)" % len(ms))
    for m in reversed(ms[-10:]):
        print("%s %s" % (m["date"], fmt_meeting(m)[2:]))
    tag = re.compile(r"(^|\s)#%s\b" % re.escape(a.slug), re.I)
    planned = [t for t in all_day_tasks(v) + [x for x in inbox_items(v) if x["type"] == "task"] if tag.search(t["text"])]
    print("\n## Planned tasks tagged #%s" % a.slug)
    for t in planned:
        print(fmt_task(t, True))
    print("\n## Open action items in project documents")
    for x in doc_actions(v, a.slug):
        print("- [ ] %s   (from: %s)   <%s:%d>" % (x["text"], x["source"], x["path"], x["line"] + 1))


# --------------------------------------------------------------------------- writing

def week_template(v, start):
    lang = v.lang()
    end = start + timedelta(days=6)
    title = "%s %d · %d %s – %d %s %d" % ("Semana" if lang == "es" else "Week", start.isocalendar()[1], start.day,
                                          MONTHS[lang][start.month - 1], end.day, MONTHS[lang][end.month - 1], end.year)
    today = date.today().isoformat()
    out = ["---", "type: week", "title: " + title, "week: " + week_id(start), "start: " + start.isoformat(),
           "created: " + today, "updated: " + today, "---", "", "# " + title, ""]
    for i in range(7):
        out += ["## %s · %s" % (DAYS[lang][i], (start + timedelta(days=i)).isoformat()), ""]
    return "\n".join(out)


def ensure_day(v, lines, d, rel, text):
    start = week_start_of(rel, text) or monday(d)
    _, body = frontmatter(text)
    secs = day_sections(lines, start, body)
    if any(s["date"] == d for s in secs):
        return lines
    nxt = next((s for s in secs if s["date"] > d), None)
    at = nxt["head"] if nxt else len(lines)
    head = "## %s · %s" % (DAYS[v.lang()][d.weekday()], d.isoformat())
    before = lines[:at]
    if before and before[-1].strip():
        before.append("")
    return before + [head, ""] + lines[at:]


def insert_in_day(v, d, block, index=None, time=None):
    """Insert lines into the day's list (end, index-th item, or by time). Creates the week file if needed."""
    rel = "weeks/%s.md" % week_id(d)
    text = v.read(rel)
    if text is None:
        text = week_template(v, monday(d))
    lines = ensure_day(v, text.split("\n"), d, rel, text)
    text2 = "\n".join(lines)
    _, body = frontmatter(text2)
    sec = next(s for s in day_sections(lines, week_start_of(rel, text2) or monday(d), body) if s["date"] == d)
    items = [x for x in items_in(lines, sec["start"], sec["end"], rel, v, d) if x["type"] in ("task", "ref")]
    if time is not None and index is None:
        last = None
        for n, it in enumerate(items):
            t = it["meeting"]["time"] if it["type"] == "ref" and it["meeting"] else (TIME_RE.match(it.get("text", "")) or [None, None])[1]
            if not t:
                continue
            if t.replace(".", ":").zfill(5) > time.zfill(5):
                index = n
                break
            last = n
        if index is None and last is not None:
            index = last + 1  # right after what happens before it
    if index is not None and index < len(items):
        at = items[index]["line"]
        lines = lines[:at] + block + lines[at:]
    else:
        last = max([i for i in range(sec["start"], sec["end"]) if lines[i].strip()] or [sec["head"]])
        tail = lines[last + 1:]
        gap = [""] if last == sec["head"] else []
        lines = lines[:last + 1] + gap + block + ([""] if tail and tail[0].strip() else []) + tail
    v.write(rel, touch("\n".join(lines)))
    return rel


def cmd_add_task(v, a):
    text = a.text.strip()
    if a.project and ("#" + a.project) not in text:
        text += " #" + a.project
    block = ["- [ ] " + text]
    if a.inbox:
        cur = v.read("inbox.md")
        if cur is None:
            cur = "---\ntype: inbox\ntitle: Inbox\n---\n\n# Inbox\n"
        v.write("inbox.md", touch(cur.rstrip("\n") + "\n" + "\n".join(block) + "\n"))
        print("Added to inbox.md: " + block[0])
        return
    d = parse_date(a.date)
    rel = insert_in_day(v, d, block)
    print("Added to %s (%s): %s" % (rel, d.isoformat(), block[0]))


def find_task(v, pattern, d=None, want_open=None):
    pat = fold(pattern)
    pool = day_items(v, d) if d else all_day_tasks(v) + inbox_items(v)
    hits = [t for t in pool if t.get("type") == "task" and pat in fold(t["text"]) and (want_open is None or (not t["done"]) == want_open)]
    if not hits:
        sys.exit("No task matches '%s'." % pattern)
    if len(hits) > 1:
        sys.exit("Several tasks match '%s' — be more specific or pass --date:\n%s" % (pattern, "\n".join(fmt_task(t, True) for t in hits)))
    return hits[0]


def cmd_done(v, a):
    t = find_task(v, a.pattern, parse_date(a.date) if a.date else None, want_open=not a.reopen)
    lines = v.read(t["path"]).split("\n")
    lines[t["line"]] = re.sub(r"\[([ xX])\]", "[ ]" if a.reopen else "[x]", lines[t["line"]], count=1)
    v.write(t["path"], touch("\n".join(lines)))
    print("%s: %s   <%s:%d>" % ("Reopened" if a.reopen else "Done", t["text"], t["path"], t["line"] + 1))


def cmd_move(v, a):
    t = find_task(v, a.pattern, parse_date(a.from_) if a.from_ else None)
    lines = v.read(t["path"]).split("\n")
    end = block_end(lines, t["line"])
    block = lines[t["line"]:end]
    base = indent(block[0])
    block = [l[base:] if l[:base].strip() == "" else l for l in block]
    while block and not block[-1].strip():
        block.pop()
    v.write(t["path"], touch("\n".join(lines[:t["line"]] + lines[end:])))
    if a.to_inbox:
        cur = v.read("inbox.md") or "---\ntype: inbox\ntitle: Inbox\n---\n\n# Inbox\n"
        v.write("inbox.md", touch(cur.rstrip("\n") + "\n" + "\n".join(block) + "\n"))
        print("Moved to inbox: " + t["text"])
    else:
        d = parse_date(a.to)
        rel = insert_in_day(v, d, block)
        print("Moved to %s (%s): %s" % (rel, d.isoformat(), t["text"]))


BUILTIN_MEETING = """---
type: meeting
title: {{title}}
date: {{date}}
time: {{time}}
project: {{project}}
attendees: [{{attendees}}]
created: {{today}}
updated: {{today}}
---

# {{title}}

## %s


## %s


## %s

"""
SECTIONS = {"es": ("Notas", "Acuerdos", "Próximos pasos"), "en": ("Notes", "Decisions", "Next steps")}


def yaml_scalar(s):
    return '"%s"' % s.replace('"', '\\"') if re.search(r"^[\s\-?:,\[\]{}#&*!|>'\"%@`]|: | #", s) else s


def cmd_new_meeting(v, a):
    d = parse_date(a.date)
    name = "meeting" + ("-" + slugify(a.template) if a.template and slugify(a.template) != "meeting" else "")
    tpl = v.read("templates/%s.md" % name) or v.read("templates/meeting.md") or BUILTIN_MEETING % SECTIONS[v.lang()]
    vals = {"title": a.title, "date": d.isoformat(), "time": a.time or "", "project": a.project or "",
            "attendees": a.attendees or "", "today": date.today().isoformat(),
            "weekday": DAYS[v.lang()][d.weekday()].lower(), "dateLong": d.isoformat()}
    text = re.sub(r"\{\{\s*(\w+)\s*\}\}", lambda m: vals.get(m.group(1), ""), tpl)
    m = FM_RE.match(text)
    if m:  # tidy frontmatter: quote the title, drop empty keys
        fm_lines = []
        for line in m.group(1).split("\n"):
            km = re.match(r"^(\w+):\s*(.*)$", line)
            if km and km.group(2).strip() in ("", '""') and km.group(1) != "attendees":
                continue
            if km and km.group(1) == "title":
                line = "title: " + yaml_scalar(a.title)
            fm_lines.append(line)
        text = "---\n" + "\n".join(fm_lines) + "\n---\n" + text[len(m.group(0)):]
    folder = "projects/%s/meetings" % a.project if a.project else "meetings"
    rel, n = "%s/%s-%s.md" % (folder, d.isoformat(), slugify(a.title)), 2
    while os.path.exists(v.p(rel)):
        rel = "%s/%s-%s-%d.md" % (folder, d.isoformat(), slugify(a.title), n)
        n += 1
    if a.notes:
        text = text.rstrip("\n") + "\n\n" + a.notes.strip() + "\n"
    v.write(rel, text)
    base = os.path.basename(rel)[:-3]
    ref = base if resolve(v, base) == rel else rel[:-3]
    week = insert_in_day(v, d, ["- [[%s]]" % ref], time=a.time)
    print("Created %s and placed it in %s" % (rel, week))


# --------------------------------------------------------------------------- main

def find_vault(arg):
    for cand in (arg, os.environ.get("PANEL_VAULT")):
        if cand:
            return cand
    cwd = os.getcwd()
    if os.path.isfile(os.path.join(cwd, "inbox.md")) or os.path.isdir(os.path.join(cwd, "weeks")):
        return cwd
    return os.path.join(cwd, "vault")


def main(argv=None):
    ap = argparse.ArgumentParser(description="Read and update a Panel vault.", formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    ap.add_argument("--vault")
    sub = ap.add_subparsers(dest="cmd")
    s = sub.add_parser("day"); s.add_argument("date", nargs="?"); s.set_defaults(fn=cmd_day)
    s = sub.add_parser("week"); s.add_argument("date", nargs="?"); s.set_defaults(fn=cmd_week)
    sub.add_parser("overdue").set_defaults(fn=cmd_overdue)
    sub.add_parser("inbox").set_defaults(fn=cmd_inbox)
    s = sub.add_parser("meetings"); s.add_argument("--from", dest="from_"); s.add_argument("--to"); s.add_argument("--project"); s.set_defaults(fn=cmd_meetings)
    s = sub.add_parser("actions"); s.add_argument("--project"); s.add_argument("--since"); s.set_defaults(fn=cmd_actions)
    sub.add_parser("projects").set_defaults(fn=cmd_projects)
    s = sub.add_parser("project"); s.add_argument("slug"); s.set_defaults(fn=cmd_project)
    s = sub.add_parser("add-task"); s.add_argument("text"); s.add_argument("--date"); s.add_argument("--inbox", action="store_true"); s.add_argument("--project"); s.set_defaults(fn=cmd_add_task)
    s = sub.add_parser("done"); s.add_argument("pattern"); s.add_argument("--date"); s.add_argument("--reopen", action="store_true"); s.set_defaults(fn=cmd_done)
    s = sub.add_parser("move"); s.add_argument("pattern"); s.add_argument("--to"); s.add_argument("--to-inbox", action="store_true"); s.add_argument("--from", dest="from_"); s.set_defaults(fn=cmd_move)
    s = sub.add_parser("new-meeting"); s.add_argument("--title", required=True); s.add_argument("--date", default="today"); s.add_argument("--time")
    s.add_argument("--project"); s.add_argument("--attendees"); s.add_argument("--template"); s.add_argument("--notes"); s.set_defaults(fn=cmd_new_meeting)
    a = ap.parse_args(argv)
    if not getattr(a, "fn", None):
        ap.print_help()
        return 1
    if a.cmd == "move" and not (a.to or a.to_inbox):
        ap.error("move needs --to DATE or --to-inbox")
    v = Vault(find_vault(a.vault))
    if not os.path.isdir(v.root):
        sys.exit("Vault not found: %s (use --vault or PANEL_VAULT)" % v.root)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    a.fn(v, a)
    return 0


if __name__ == "__main__":
    sys.exit(main())
