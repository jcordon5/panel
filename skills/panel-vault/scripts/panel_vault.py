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

Memory
  pending [--since -14]           meetings with notes but no summary yet (last 2 weeks) + captured sources
  meeting REF                     one meeting in full: sections, attendees (with roles), sources, previous session
  people [QUERY] | person NAME    who is who; a person's card, meetings, what they owe you, knowledge
  knowledge [QUERY]               procedures, resources and facts
  search WORDS [--limit N]        every note containing all the words, best first, with matching lines
  waiting [PERSON]                tasks you are waiting on others for ("- [ ] @Name ...")
  series                          recurring meetings and their next session

Write (atomic, keeps frontmatter, bumps `updated`)
  add-task TEXT [--date D | --inbox] [--project SLUG]
  done PATTERN [--date D] [--reopen]      check (or uncheck) the task whose text contains PATTERN
  move PATTERN (--to D | --to-inbox) [--from D]
  new-meeting --title T --date D [--time HH:MM] [--project SLUG] [--attendees "Ana, Luis"]
              [--template NAME] [--notes TEXT]
  write REF --section summary|agenda|notes|tasks|decisions --text TEXT   (TEXT "-" = stdin)
  mark-processed REF              the meeting has its summary (sets processed: today)
  source-done PATH                a source was used: move it to .trash
  add-person --name N [--role R] [--team T] [--org O] [--email E] [--aliases "a, b"] [--ask-for "x, y"] [--notes TEXT]
  add-knowledge --title T --kind howto|resource|fact [--project SLUG] [--people "A, B"] [--source "[[meeting]]"]
                [--tags "a, b"] [--body TEXT | --body -]

DATE accepts YYYY-MM-DD, "today", "tomorrow", "yesterday" or +N / -N days.
"""
import argparse
import contextlib
import io
import os
import random
import re
import sys
import unicodedata
from datetime import date, datetime, timedelta

TASK_RE = re.compile(r"^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s+(\S.*)$")
REF_RE = re.compile(r"^(\s*)[-*+]\s+\[\[([^\]|#\n]+)(#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]\s*$")
# "- [ ] Send the minutes ^a1b2c3": a block id, so a day can link to that task with [[meeting#^a1b2c3]]
BLOCK_RE = re.compile(r"[ \t]+\^([A-Za-z0-9-]+)[ \t]*$")
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
            out.append({"type": "task", "path": path, "line": i, "done": tm.group(2) != " ", "text": BLOCK_RE.sub("", tm.group(3)),
                        "details": [x for x in lines[i + 1:e] if x.strip()], "date": day})
            i = e
            continue
        if rm and (rm.group(3) or "").startswith("#^"):
            # an action item of a meeting/note planned here: it is that task (checking it checks it in the meeting)
            target = resolve(v, rm.group(2))
            act = find_block(v, target, rm.group(3)[2:].strip()) if target else None
            if act:
                act.update({"date": day, "ref_path": path, "ref_line": i})
                out.append(act)
            else:
                out.append({"type": "ref", "path": path, "line": i, "target": rm.group(2) + rm.group(3), "meeting": None, "date": day})
            i += 1
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


def find_block(v, rel, block_id):
    """The task of `rel` whose line ends with ^block_id."""
    text = v.read(rel) or ""
    lines = text.split("\n")
    for i, l in enumerate(lines):
        m, b = TASK_RE.match(l), BLOCK_RE.search(l)
        if m and b and b.group(1) == block_id:
            e = block_end(lines, i)
            return {"type": "task", "path": rel, "line": i, "done": m.group(2) != " ", "text": BLOCK_RE.sub("", m.group(3)),
                    "details": [x for x in lines[i + 1:e] if x.strip()], "block": block_id, "via": meeting_info(v, rel)["title"]}
    return None


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
    if t.get("via"):
        extra += " (action of: %s)" % t["via"]
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
    for sd in all_series(v):
        if sd["fm"].get("status") != "paused" and occurs_on(sd["rule"], d) and not any(x["date"] == d.isoformat() for x in sessions_of(v, sd["slug"])):
            print("- [recurring] %s · %s   (session note not created yet)   <%s>" % (sd["fm"].get("time") or "--:--", sd["title"], sd["path"]))
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
        skip = agenda_lines(lines, body) if fm.get("type") == "meeting" or "/meetings/" in "/" + rel else set()
        for i in range(body, len(lines)):
            m = TASK_RE.match(lines[i])
            if m and m.group(2) == " " and i not in skip:
                b = BLOCK_RE.search(lines[i])
                who = WHO_RE.match(m.group(3))
                out.append({"path": rel, "line": i, "text": BLOCK_RE.sub("", m.group(3)), "source": info["title"], "date": info["date"],
                            "block": b.group(1) if b else None, "who": (who.group(1) or who.group(2)) if who else None})
    return out


def planned_blocks(v):
    """{(path, block id): date or 'inbox'} of every [[doc#^id]] in the day plans and the inbox."""
    out = {}
    for t in all_day_tasks(v) + [x for x in inbox_items(v) if x["type"] == "task"]:
        if t.get("block"):
            out[(t["path"], t["block"])] = t["date"].isoformat() if t.get("date") else "inbox"
    return out


def cmd_actions(v, a):
    since = parse_date(a.since).isoformat() if a.since else None
    acts = doc_actions(v, a.project, since)
    planned = planned_blocks(v)
    for x in acts:
        if x.get("who"):
            continue  # someone else's: see `waiting`
        when = planned.get((x["path"], x["block"]))
        print("- [ ] %s   (from: %s%s)%s   <%s:%d>" % (x["text"], x["source"], ", " + x["date"] if x["date"] else "",
                                                  "   planned: " + when if when else "", x["path"], x["line"] + 1))
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


def doc_tasks(v):
    """Every task line inside meetings, notes, people, knowledge and project documents (open and done)."""
    out = []
    for rel in v.md_files():
        if rel.startswith(("weeks/", "templates/", "sources/")) or rel == "inbox.md":
            continue
        text = v.read(rel) or ""
        fm, body = frontmatter(text)
        lines = text.split("\n")
        skip = agenda_lines(lines, body) if fm.get("type") == "meeting" or "/meetings/" in "/" + rel else set()
        info = None
        for i in range(body, len(lines)):
            m = TASK_RE.match(lines[i])
            if m and i not in skip:
                info = info or meeting_info(v, rel)
                e = block_end(lines, i)
                out.append({"type": "task", "path": rel, "line": i, "done": m.group(2) != " ", "text": BLOCK_RE.sub("", m.group(3)),
                            "details": [x for x in lines[i + 1:e] if x.strip()], "date": None, "via": info["title"],
                            "project": info["project"] or None})
    return out


def task_pool(v, d=None):
    return day_items(v, d) if d else all_day_tasks(v) + inbox_items(v) + doc_tasks(v)


def find_task(v, pattern, d=None, want_open=None):
    if re.match(r"^.+\.md:\d+$", pattern or ""):  # exact PATH:LINE (as printed by every command)
        rel, n = pattern.rsplit(":", 1)
        hit = [t for t in task_pool(v) if t["type"] == "task" and t["path"] == rel and t["line"] == int(n) - 1]
        if not hit:
            sys.exit("No task at %s." % pattern)
        return hit[0]
    pat = fold(pattern)
    pool = task_pool(v, d)
    hits = [t for t in pool if t.get("type") == "task" and pat in fold(t["text"]) and (want_open is None or (not t["done"]) == want_open)]
    # a planned meeting action shows up twice (in its day and in its meeting): keep one
    seen, uniq = set(), []
    for t in hits:
        if (t["path"], t["line"]) not in seen:
            seen.add((t["path"], t["line"]))
            uniq.append(t)
    hits = uniq
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
    if t.get("ref_path"):
        # a planned meeting action: move its link, the task stays in the meeting
        t = dict(t, path=t["ref_path"], line=t["ref_line"])
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


def cmd_plan(v, a):
    """Plan a meeting's action item on a day: the day links to it, the task stays in the meeting."""
    pat = fold(a.pattern)
    hits = [x for x in doc_actions(v) if pat in fold(x["text"])]
    if not hits:
        sys.exit("No open action item matches '%s'." % a.pattern)
    if len(hits) > 1:
        sys.exit("Several action items match '%s':\n%s" % (a.pattern, "\n".join("- %s (from: %s)" % (x["text"], x["source"]) for x in hits)))
    x = hits[0]
    if x["block"] and (x["path"], x["block"]) in planned_blocks(v):
        sys.exit("Already planned; use: move '%s' --to <date>" % a.pattern)
    block = x["block"]
    if not block:
        text = v.read(x["path"])
        lines = text.split("\n")
        while True:
            block = "".join(random.choice("abcdefghijklmnopqrstuvwxyz0123456789") for _ in range(6))
            if "^" + block not in text:
                break
        lines[x["line"]] = lines[x["line"]].rstrip() + " ^" + block
        v.write(x["path"], touch("\n".join(lines)))
    base = os.path.basename(x["path"])[:-3]
    link = base if resolve(v, base) == x["path"] else x["path"][:-3]
    d = parse_date(a.date)
    rel = insert_in_day(v, d, ["- [[%s#^%s]]" % (link, block)])
    print("Planned for %s (%s): %s   (stays in %s)" % (d.isoformat(), rel, x["text"], x["path"]))


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


## %s

"""
SECTIONS = {"es": ("Para comentar", "Notas", "Tareas", "Decisiones"), "en": ("To discuss", "Notes", "Tasks", "Decisions")}


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


# --------------------------------------------------------------------------- memory: meetings, people, knowledge, series, sources
# Same rules as the app (app/js/meeting.js, series.js, model.js).

WHO_RE = re.compile(r"^@(?:\[\[([^\]|]+)(?:\|[^\]]*)?\]\]|([\w][\w.-]*))\s*[:,-]?\s*", re.U)
SECTION_RES = [
    ("summary", r"^(resumen|acta|summary|minutes|recap)\b"),
    ("agenda", r"^(para comentar|comentar|a comentar|temas|agenda|orden del dia|to discuss|discuss|talking points|topics)\b"),
    ("decisions", r"^(decisiones|acuerdos|decisions|agreed|agreements)\b"),
    ("tasks", r"^(tareas|acciones|proximos pasos|siguientes pasos|tasks|action items|actions|next steps|to ?dos?)\b"),
    ("notes", r"^(notas|apuntes|notes|discussion|lo que se hablo)\b"),
]
SECTION_ORDER = ["summary", "agenda", "notes", "tasks", "decisions"]
SECTION_TITLES = {"es": {"summary": "Resumen", "agenda": "Para comentar", "notes": "Notas", "tasks": "Tareas", "decisions": "Decisiones"},
                  "en": {"summary": "Summary", "agenda": "To discuss", "notes": "Notes", "tasks": "Tasks", "decisions": "Decisions"}}


def section_kind(title):
    t = fold(re.sub(r"[*_`:]", "", re.sub(r"^#+\s*", "", title or "")).strip())
    for kind, rx in SECTION_RES:
        if re.match(rx, t):
            return kind
    return None


def sections(lines, start=0):
    heads, fence = [], False
    for i in range(start, len(lines)):
        if re.match(r"^\s*(```|~~~)", lines[i]):
            fence = not fence
        if not fence and re.match(r"^#{2,3}\s+\S", lines[i]):
            heads.append(i)
    out = []
    for n, h in enumerate(heads):
        level = len(re.match(r"^(#+)", lines[h]).group(1))
        end = len(lines)
        for k in heads[n + 1:]:
            if len(re.match(r"^(#+)", lines[k]).group(1)) <= level:
                end = k
                break
        title = re.sub(r"^#+\s+", "", lines[h]).strip()
        out.append({"kind": section_kind(title), "title": title, "head": h, "start": h + 1, "end": end})
    return out


def agenda_lines(lines, start=0):
    return set(i for s in sections(lines, start) if s["kind"] == "agenda" for i in range(s["start"], s["end"]))


def section_insert(v, text, kind, new_lines):
    """Append lines to a section of a meeting, creating the section where it belongs."""
    lines = text.rstrip("\n").split("\n")
    _, body = frontmatter(text)
    secs = sections(lines, body)
    sec = next((x for x in secs if x["kind"] == kind), None)
    if not sec:
        after = next((x for x in secs if x["kind"] and SECTION_ORDER.index(x["kind"]) > SECTION_ORDER.index(kind)), None)
        if kind == "summary":  # the summary goes right below the title, before any other section
            after = secs[0] if secs else None
        at = after["head"] if after else len(lines)
        block = ["## " + SECTION_TITLES[v.lang()][kind], ""]
        if at > 0 and lines[at - 1].strip():
            block = [""] + block
        lines = lines[:at] + block + ([""] if after else []) + lines[at:]
        sec = next(x for x in sections(lines, body) if x["kind"] == kind)
    at = sec["head"]
    for i in range(sec["start"], sec["end"]):
        if lines[i].strip():
            at = i
    ins = list(new_lines)
    if at == sec["head"]:
        if at + 1 < sec["end"] and not lines[at + 1].strip():
            at += 1
        else:
            ins = [""] + ins
    out = lines[:at + 1] + ins + lines[at + 1:]
    nxt = at + 1 + len(ins)
    if nxt < len(out) and re.match(r"^#{1,6}\s", out[nxt]):
        out.insert(nxt, "")
    return "\n".join(out) + "\n"


def set_fm(text, key, value):
    m = FM_RE.match(text)
    if not m:
        return text
    head = m.group(0)
    if re.search(r"^%s:.*$" % re.escape(key), m.group(1), re.M):
        head = re.sub(r"^%s:.*$" % re.escape(key), "%s: %s" % (key, value), head, count=1, flags=re.M)
    else:
        head = head.replace("\n---", "\n%s: %s\n---" % (key, value), 1)
    return head + text[len(m.group(0)):]


def as_list(x):
    return x if isinstance(x, list) else [y.strip() for y in str(x or "").split(",") if y.strip()]


def unlink(s):
    return re.sub(r"^@|^\[\[|\]\]$", "", str(s or "").strip()).split("|")[0].strip()


def people(v):
    out = []
    for rel in v.md_files("people") if os.path.isdir(v.p("people")) else []:
        fm, _ = frontmatter(v.read(rel) or "")
        out.append({"path": rel, "title": fm.get("title") or title_of(v, rel), "fm": fm})
    return sorted(out, key=lambda p: fold(p["title"]))


def person_index(v):
    idx, first = {}, {}
    for p in people(v):
        for k in [os.path.basename(p["path"])[:-3], p["title"], p["fm"].get("email", "")] + as_list(p["fm"].get("aliases")):
            if k:
                idx[fold(k)] = p
        f = fold(p["title"].split()[0]) if p["title"].split() else ""
        first[f] = None if f in first else p
    for k, p in first.items():
        if p and k not in idx:
            idx[k] = p
    return idx


def same(a, b):
    return bool(a and b and a["path"] == b["path"])


def find_person(v, name, _idx=None):
    return (_idx if _idx is not None else person_index(v)).get(fold(unlink(name)))


def needs_processing(v, m, today=None):
    today = today or date.today().isoformat()
    text = v.read(m["path"]) or ""
    fm, body = frontmatter(text)
    if fm.get("processed") or not m["date"] or m["date"] > today:
        return False
    if m["date"] == today and m["time"] and m["time"].zfill(5) > datetime.now().strftime("%H:%M"):
        return False
    if sources_of(v, m["path"]):
        return True
    lines = text.split("\n")
    skip = agenda_lines(lines, body)
    return any(i not in skip and not re.match(r"^\s*(#.*|[-*+]\s*(\[[ xX]\]\s*)?)?$", lines[i]) for i in range(body, len(lines)))


def all_sources(v):
    out = []
    for rel in v.md_files("sources") if os.path.isdir(v.p("sources")) else []:
        fm, _ = frontmatter(v.read(rel) or "")
        out.append({"path": rel, "title": fm.get("title") or title_of(v, rel), "kind": fm.get("kind") or "note",
                    "date": fm.get("date") or "", "meeting": unlink(fm.get("meeting") or ""), "from": fm.get("from") or ""})
    return out


def sources_of(v, meeting_rel):
    base = fold(os.path.basename(meeting_rel)[:-3])
    return [s for s in all_sources(v) if s["meeting"] and fold(os.path.basename(s["meeting"])) == base]


DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DAY_WORDS = [["mon", "monday", "lun", "lunes", "l"], ["tue", "tuesday", "mar", "martes", "m"], ["wed", "wednesday", "mie", "miercoles", "x"],
             ["thu", "thursday", "jue", "jueves", "j"], ["fri", "friday", "vie", "viernes", "v"], ["sat", "saturday", "sab", "sabado", "s"],
             ["sun", "sunday", "dom", "domingo", "d"]]


def series_rule(fm):
    rep = fold(fm.get("repeat") or "weekly")
    rep = rep if rep in ("daily", "weekdays", "weekly", "monthly") else "weekly"
    start = fm.get("start") or (fm.get("created") or "")[:10] or None
    days = [i for i, w in enumerate(DAY_WORDS) for d in as_list(fm.get("days")) if fold(d) in w]
    if rep == "weekdays":
        days = [0, 1, 2, 3, 4]
    if not days and start:
        days = [date.fromisoformat(start).weekday()]
    try:
        nth = int(fm.get("nth") or 0)
    except ValueError:
        nth = 0
    try:
        interval = max(1, int(fm.get("interval") or 1))
    except ValueError:
        interval = 1
    return {"repeat": rep, "days": sorted(set(days)), "interval": interval, "nth": nth if nth in (1, 2, 3, 4, -1) else 0,
            "start": start, "until": fm.get("until") or None, "skip": set(as_list(fm.get("skip")))}


def occurs_on(r, d):
    iso = d.isoformat()
    if not r["start"] or iso < r["start"] or (r["until"] and iso > r["until"]) or iso in r["skip"]:
        return False
    st = date.fromisoformat(r["start"])
    if r["repeat"] == "daily":
        return (d - st).days % r["interval"] == 0
    if r["repeat"] == "weekdays":
        return d.weekday() < 5
    if r["repeat"] == "weekly":
        return d.weekday() in r["days"] and ((monday(d) - monday(st)).days // 7) % r["interval"] == 0
    months = (d.year - st.year) * 12 + d.month - st.month
    if months % r["interval"]:
        return False
    if not r["nth"]:
        return d.day == st.day
    if d.weekday() != r["days"][0]:
        return False
    return (d + timedelta(days=7)).month != d.month if r["nth"] == -1 else (d.day + 6) // 7 == r["nth"]


def all_series(v):
    out = []
    for rel in v.md_files("series") if os.path.isdir(v.p("series")) else []:
        fm, _ = frontmatter(v.read(rel) or "")
        out.append({"path": rel, "slug": os.path.basename(rel)[:-3], "title": fm.get("title") or title_of(v, rel), "fm": fm, "rule": series_rule(fm)})
    return out


def sessions_of(v, slug):
    out = []
    for m in all_meetings(v):
        fm, _ = frontmatter(v.read(m["path"]) or "")
        if unlink(fm.get("series") or "") == slug:
            out.append(m)
    return out


def waiting(v, person=None):
    idx = person_index(v)
    out = []
    for t in all_day_tasks(v) + [x for x in inbox_items(v) if x["type"] == "task"]:
        w = WHO_RE.match(t["text"]) if not t["done"] else None
        if w:
            out.append(dict(t, who=w.group(1) or w.group(2)))
    for a in doc_actions(v):
        if a.get("who"):
            out.append({"path": a["path"], "line": a["line"], "text": a["text"], "done": False, "date": None, "who": a["who"], "via": a["source"]})
    if person:
        out = [t for t in out if same(find_person(v, t["who"], idx), person)]
    return out


def cmd_pending(v, a):
    """What is waiting for the AI: meetings with notes but no summary, and captured sources."""
    since = parse_date(a.since).isoformat()  # older meetings are processed on request (`meeting REF`)
    ms = [m for m in all_meetings(v) if (m["date"] or "") >= since and needs_processing(v, m)]
    src = all_sources(v)
    print("## Meetings to process (%d)" % len(ms))
    for m in ms:
        print(fmt_meeting(m) + "   (%s)" % m["date"])
    print("\n## Sources to process (%d) — delete each with `source-done` once used" % len(src))
    for s in src:
        print("- [%s] %s%s%s   <%s>" % (s["kind"], s["title"], " · from " + s["from"] if s["from"] else "",
                                        " · meeting [[%s]]" % s["meeting"] if s["meeting"] else "", s["path"]))
    if not ms and not src:
        print("(nothing pending)")


def find_meeting(v, ref):
    rel = ref if ref.endswith(".md") and os.path.isfile(v.p(ref)) else resolve(v, unlink(ref))
    if rel:
        return rel
    pat = fold(ref)
    hits = [m for m in all_meetings(v) if pat in fold(m["title"]) or pat in fold(m["path"])]
    if len(hits) != 1:
        sys.exit("No single meeting matches '%s'%s" % (ref, ":\n" + "\n".join(fmt_meeting(m) for m in hits[-10:]) if hits else "."))
    return hits[0]["path"]


def cmd_meeting(v, a):
    """Everything about one meeting, ready to process: sections, attendees, sources, previous session."""
    rel = find_meeting(v, a.ref)
    text = v.read(rel)
    fm, body = frontmatter(text)
    m = meeting_info(v, rel)
    idx = person_index(v)
    print("# %s   <%s>" % (m["title"], rel))
    print("date: %s %s · project: %s · series: %s · processed: %s" % (m["date"], m["time"], m["project"] or "-", fm.get("series") or "-", fm.get("processed") or "no"))
    print("\n## Attendees")
    for n in m["attendees"]:
        p = find_person(v, n, idx)
        print("- %s%s" % (n, "  → %s (%s)  <%s>" % (p["title"], ", ".join(x for x in (p["fm"].get("role"), p["fm"].get("team")) if x), p["path"]) if p else "  (no person card)"))
    print("\n## Content\n")
    print("\n".join(text.split("\n")[body:]).strip())
    srcs = sources_of(v, rel)
    if srcs:
        print("\n## Attached sources (read them, then `source-done` each)")
        for s in srcs:
            print("- [%s] %s   <%s>" % (s["kind"], s["title"], s["path"]))
    if fm.get("series"):
        prev = [x for x in sessions_of(v, unlink(fm["series"])) if x["path"] != rel and (x["date"] or "") < (m["date"] or "")]
        if prev:
            p = prev[-1]
            print("\n## Previous session: %s   <%s>" % (p["date"], p["path"]))
            for x in doc_actions(v):
                if x["path"] == p["path"]:
                    print("- [ ] %s   <%s:%d>" % (x["text"], x["path"], x["line"] + 1))
    owed = [t for n in m["attendees"] for t in waiting(v, find_person(v, n, idx)) if find_person(v, n, idx)]
    if owed:
        print("\n## Attendees still owe you")
        for t in owed:
            print("- [ ] %s   <%s:%d>" % (t["text"], t["path"], t["line"] + 1))


def cmd_write(v, a):
    """Append lines to a section of a meeting (summary, agenda, notes, tasks, decisions)."""
    rel = find_meeting(v, a.ref)
    text = a.text if a.text != "-" else sys.stdin.read()
    lines = [l.rstrip() for l in text.strip("\n").split("\n")]
    v.write(rel, touch(section_insert(v, v.read(rel), a.section, lines)))
    print("Added %d line(s) to %s of %s" % (len(lines), a.section, rel))


def cmd_mark_processed(v, a):
    rel = find_meeting(v, a.ref)
    v.write(rel, touch(set_fm(v.read(rel), "processed", date.today().isoformat())))
    print("Marked as processed: " + rel)


def cmd_source_done(v, a):
    rel = a.path if os.path.isfile(v.p(a.path)) else None
    if not rel or not rel.startswith("sources/"):
        sys.exit("Not a source: %s (see `pending`)" % a.path)
    dest = ".trash/%s_%s" % (datetime.now().strftime("%Y%m%d-%H%M%S"), rel.replace("/", "__"))
    os.makedirs(os.path.dirname(v.p(dest)), exist_ok=True)
    os.replace(v.p(rel), v.p(dest))
    print("Source processed and removed: %s (kept in %s)" % (rel, dest))


def cmd_people(v, a):
    q = fold(a.query or "")
    for p in people(v):
        fm = p["fm"]
        hay = fold(" ".join([p["title"], fm.get("role", ""), fm.get("team", ""), fm.get("org", "")] + as_list(fm.get("aliases")) + as_list(fm.get("ask_for"))))
        if q and q not in hay:
            continue
        bits = [x for x in (fm.get("role"), fm.get("team") or fm.get("org")) if x]
        ask = as_list(fm.get("ask_for"))
        print("- %s%s%s   <%s>" % (p["title"], " — " + " · ".join(bits) if bits else "", " · ask for: " + ", ".join(ask) if ask else "", p["path"]))
    if not people(v):
        print("(no people yet: people/<name>.md)")


def cmd_person(v, a):
    p = find_person(v, a.name)
    if not p:
        sys.exit("No person card for '%s'. Create one with add-person." % a.name)
    print(v.read(p["path"]).strip())
    idx = person_index(v)
    ms = [m for m in all_meetings(v) if any(same(find_person(v, n, idx), p) for n in m["attendees"])]
    if ms:
        print("\n## Meetings (%d)" % len(ms))
        for m in ms[-12:]:
            print("%s %s" % (m["date"], fmt_meeting(m)[2:]))
    owed = waiting(v, p)
    if owed:
        print("\n## Waiting on %s" % p["title"])
        for t in owed:
            print("- [ ] %s   <%s:%d>" % (t["text"], t["path"], t["line"] + 1))
    kn = [k for k in knowledge(v) if any(same(find_person(v, n, idx), p) for n in as_list(k["fm"].get("people")))]
    if kn:
        print("\n## Knowledge")
        for k in kn:
            print("- [%s] %s   <%s>" % (k["fm"].get("kind", "fact"), k["title"], k["path"]))


def knowledge(v):
    out = []
    for rel in v.md_files("knowledge") if os.path.isdir(v.p("knowledge")) else []:
        text = v.read(rel) or ""
        fm, body = frontmatter(text)
        out.append({"path": rel, "title": fm.get("title") or title_of(v, rel), "fm": fm, "body": "\n".join(text.split("\n")[body:])})
    return out


def cmd_knowledge(v, a):
    q = fold(a.query or "")
    hits = [k for k in knowledge(v) if not q or q in fold(k["title"] + " " + k["body"] + " " + " ".join(as_list(k["fm"].get("tags"))))]
    for k in hits:
        print("- [%s] %s%s   <%s>" % (k["fm"].get("kind", "fact"), k["title"], " #" + k["fm"]["project"] if k["fm"].get("project") else "", k["path"]))
    if not hits:
        print("(no knowledge matches)")


def cmd_search(v, a):
    """Rank every note by how well it matches all the words (title counts more), newest first on ties."""
    words = [fold(w) for w in re.findall(r"\w+", a.query, re.U) if len(w) > 1]
    if not words:
        sys.exit("Search for at least one word.")
    hits = []
    for rel in v.md_files():
        text = v.read(rel) or ""
        low = fold(text)
        if not all(w in low for w in words):
            continue
        title = fold(title_of(v, rel))
        score = sum(low.count(w) for w in words) + 8 * sum(w in title for w in words)
        lines = [(i, l) for i, l in enumerate(text.split("\n")) if any(w in fold(l) for w in words) and not l.startswith("---")]
        hits.append((score, os.path.getmtime(v.p(rel)), rel, lines[:3]))
    hits.sort(key=lambda x: (-x[0], -x[1]))
    for score, _, rel, lines in hits[:a.limit]:
        print("%s   <%s>" % (title_of(v, rel), rel))
        for i, l in lines:
            print("    %d: %s" % (i + 1, l.strip()[:160]))
    if not hits:
        print("(no notes contain all of: %s)" % ", ".join(words))


def cmd_waiting(v, a):
    p = find_person(v, a.person) if a.person else None
    if a.person and not p:
        sys.exit("No person card for '%s'." % a.person)
    for t in waiting(v, p):
        print("- [ ] %s%s   <%s:%d>" % (t["text"], " (%s)" % t["date"].isoformat() if t.get("date") else " (from %s)" % t["via"] if t.get("via") else "", t["path"], t["line"] + 1))


def cmd_series(v, a):
    today = date.today()
    for sd in all_series(v):
        nxt = next((today + timedelta(days=i) for i in range(400) if occurs_on(sd["rule"], today + timedelta(days=i))), None)
        r = sd["rule"]
        print("- %s · %s%s · %s · next: %s%s   <%s>" % (sd["title"], r["repeat"], " " + ",".join(DAY_KEYS[d] for d in r["days"]) if r["repeat"] == "weekly" else "",
                                                  sd["fm"].get("time") or "--:--", nxt.isoformat() if nxt else "-",
                                                  " (paused)" if sd["fm"].get("status") == "paused" else "", sd["path"]))
    if not all_series(v):
        print("(no recurring meetings: series/<name>.md)")


def new_entity(v, folder, title, fields, body):
    rel, n = "%s/%s.md" % (folder, slugify(title)), 2
    while os.path.exists(v.p(rel)):
        rel, n = "%s/%s-%d.md" % (folder, slugify(title), n), n + 1
    today = date.today().isoformat()
    fm = ["---"] + ["%s: %s" % (k, val) for k, val in fields if val not in (None, "")] + ["created: " + today, "updated: " + today, "---"]
    v.write(rel, "\n".join(fm) + "\n\n# %s\n\n%s" % (title, (body.strip() + "\n") if body and body.strip() else ""))
    return rel


def flow(items):
    return "[%s]" % ", ".join(yaml_scalar(x) for x in items)


def cmd_add_person(v, a):
    existing = find_person(v, a.name)
    if existing:
        sys.exit("There is already a card for %s: %s (edit it instead)" % (existing["title"], existing["path"]))
    rel = new_entity(v, "people", a.name, [("type", "person"), ("title", yaml_scalar(a.name)), ("role", yaml_scalar(a.role or "")),
                                          ("team", yaml_scalar(a.team or "")), ("org", yaml_scalar(a.org or "")), ("email", a.email or ""),
                                          ("aliases", flow(as_list(a.aliases))), ("ask_for", flow(as_list(a.ask_for)))], a.notes)
    print("Created " + rel)


def cmd_add_knowledge(v, a):
    body = sys.stdin.read() if a.body == "-" else (a.body or "")
    rel = new_entity(v, "knowledge", a.title, [("type", "knowledge"), ("kind", a.kind), ("title", yaml_scalar(a.title)),
                                               ("project", a.project or ""), ("people", flow(as_list(a.people))),
                                               ("source", yaml_scalar(a.source) if a.source else ""), ("tags", flow(as_list(a.tags)))], body)
    print("Created " + rel)


# --------------------------------------------------------------------------- natural requests: remind, log, learn, prepare

def score_words(words, text):
    t = fold(text)
    return sum(1 for w in words if w in t)


def cmd_find_task(v, a):
    """Tasks related to some words (open first), across days, inbox and meetings — to find what to close or move."""
    words = [fold(w) for w in re.findall(r"\w+", a.query, re.U) if len(w) > 2]
    pool = [t for t in task_pool(v) if t.get("type") == "task" and (a.all or not t["done"])]
    if a.project:
        pool = [t for t in pool if ("#" + a.project) in t["text"] or t.get("project") == a.project]
    ranked = sorted(((score_words(words, t["text"] + " " + " ".join(t.get("details", []))), t) for t in pool), key=lambda x: (-x[0], x[1]["done"]))
    seen, n = set(), 0
    for sc, t in ranked:
        if sc == 0 and words or (t["path"], t["line"]) in seen:
            continue
        seen.add((t["path"], t["line"]))
        when = t["date"].isoformat() if t.get("date") else ("inbox" if t["path"] == "inbox.md" else "in " + (t.get("via") or t["path"]))
        print("- [%s] %s   (%s)   <%s:%d>" % ("x" if t["done"] else " ", t["text"], when, t["path"], t["line"] + 1))
        n += 1
        if n >= a.limit:
            break
    if not n:
        print("(no related tasks)")


def cmd_log(v, a):
    """Record something already done, as a checked task on its day (traceability)."""
    text = a.text.strip()
    if a.project and ("#" + a.project) not in text:
        text += " #" + a.project
    d = parse_date(a.date)
    rel = insert_in_day(v, d, ["- [x] " + text])
    print("Logged as done on %s (%s): %s" % (d.isoformat(), rel, text))


def cmd_tasks(v, a):
    """Tasks of a project (#slug in days and inbox, and action items of its meetings/documents)."""
    out = []
    for t in task_pool(v):
        if t.get("type") != "task" or (t["done"] and not a.done) or (not t["done"] and a.done):
            continue
        if a.project and not (("#" + a.project) in t["text"] or t.get("project") == a.project):
            continue
        if a.since and t.get("date") and t["date"].isoformat() < parse_date(a.since).isoformat():
            continue
        out.append(t)
    for t in sorted(out, key=lambda t: (t["date"].isoformat() if t.get("date") else "9999", t["path"], t["line"])):
        when = t["date"].isoformat() if t.get("date") else ("inbox" if t["path"] == "inbox.md" else "in " + (t.get("via") or t["path"]))
        print("- [%s] %s   (%s)   <%s:%d>" % ("x" if t["done"] else " ", t["text"], when, t["path"], t["line"] + 1))
    if not out:
        print("(no tasks)")


def cmd_person_set(v, a):
    """Update a person card: role/team/org/email, add what to ask them for or an alias, append a dated note."""
    p = find_person(v, a.name)
    if not p:
        sys.exit("No person card for '%s' (create it with add-person)." % a.name)
    text = v.read(p["path"])
    fm, _ = frontmatter(text)
    for key in ("role", "team", "org", "email", "phone"):
        val = getattr(a, key, None)
        if val:
            text = set_fm(text, key, yaml_scalar(val))
    for key, val in (("ask_for", a.ask_for), ("aliases", a.alias)):
        if val:
            cur = as_list(fm.get(key))
            for x in as_list(val):
                if fold(x) not in [fold(c) for c in cur]:
                    cur.append(x)
            text = set_fm(text, key, flow(cur))
    if a.note:
        line = "- %s: %s%s" % (date.today().isoformat(), a.note.strip(), " (%s)" % a.source if a.source else "")
        text = text.rstrip("\n") + "\n" + ("\n" if not text.rstrip("\n").split("\n")[-1].startswith("- ") else "") + line + "\n"
    v.write(p["path"], touch(text))
    print("Updated " + p["path"])


def series_by_ref(v, ref):
    k = fold(unlink(ref))
    hits = [sd for sd in all_series(v) if fold(sd["slug"]) == k or fold(sd["title"]) == k or k in fold(sd["title"])]
    return hits[0] if len(hits) == 1 else None


def create_session(v, sd, d):
    """The session note of a series on date d (like the app): same title, time, attendees, project, template,
    with the unticked "to discuss" items of the previous session."""
    existing = [m for m in sessions_of(v, sd["slug"]) if m["date"] == d.isoformat()]
    if existing:
        return existing[0]["path"], False
    prev = [m for m in sessions_of(v, sd["slug"]) if (m["date"] or "") < d.isoformat()]
    carry = []
    if prev:
        lines = (v.read(prev[-1]["path"]) or "").split("\n")
        for i in sorted(agenda_lines(lines)):
            m = re.match(r"^\s*[-*+]\s+\[ \]\s+(.+)$", lines[i])
            if m:
                carry.append("- [ ] " + m.group(1))
    fm = sd["fm"]
    args = argparse.Namespace(title=sd["title"], date=d.isoformat(), time=fm.get("time") or None, project=fm.get("project") or None,
                              attendees=", ".join(as_list(fm.get("attendees"))), template=(fm.get("template") or "").replace("templates/", "").replace(".md", "") or None, notes=None)
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        cmd_new_meeting(v, args)
    rel = re.search(r"Created (\S+)", out.getvalue()).group(1)
    text = set_fm(v.read(rel), "series", sd["slug"])
    if carry:
        text = section_insert(v, text, "agenda", carry)
    v.write(rel, text)
    return rel, True


def cmd_new_session(v, a):
    sd = series_by_ref(v, a.series)
    if not sd:
        sys.exit("No single recurring meeting matches '%s' (see `series`)." % a.series)
    d = parse_date(a.date) if a.date else next((date.today() + timedelta(days=i) for i in range(400) if occurs_on(sd["rule"], date.today() + timedelta(days=i))), None)
    rel, created = create_session(v, sd, d)
    print(("Created %s" if created else "Already exists: %s") % rel)


def cmd_prepare(v, a):
    """Everything needed to prepare the next session of a meeting: what was said and left open last time,
    who owes what, what the user has done since on that project, and the agenda so far."""
    sd = series_by_ref(v, a.ref)
    rel = None
    if sd:
        today = date.today()
        d = parse_date(a.date) if a.date else next((today + timedelta(days=i) for i in range(400) if occurs_on(sd["rule"], today + timedelta(days=i))), today)
        target = next((m for m in sessions_of(v, sd["slug"]) if m["date"] == d.isoformat()), None)
        prev = [m for m in sessions_of(v, sd["slug"]) if (m["date"] or "") < d.isoformat()]
        attendees, project = as_list(sd["fm"].get("attendees")), sd["fm"].get("project") or ""
        print("# Preparing: %s on %s%s" % (sd["title"], d.isoformat(), "   <%s>" % target["path"] if target else "   (session note not created yet: `new-session \"%s\" --date %s`)" % (sd["title"], d.isoformat())))
        last = prev[-1] if prev else None
    else:
        rel = find_meeting(v, a.ref)
        last = meeting_info(v, rel)
        attendees, project = last["attendees"], last["project"]
        d = parse_date(a.date) if a.date else date.today()
        print("# Preparing the follow-up of: %s (%s)" % (last["title"], last["date"]))
    if not last:
        print("\n(no previous session yet)")
        return
    text = v.read(last["path"])
    fm, body = frontmatter(text)
    lines = text.split("\n")
    print("\n## Last session: %s %s   <%s>" % (last["title"], last["date"], last["path"]))
    for sec in sections(lines, body):
        if sec["kind"] in ("summary", "decisions", "agenda", "notes"):
            chunk = "\n".join(l for l in lines[sec["start"]:sec["end"]] if l.strip())
            if chunk:
                print("\n### %s\n%s" % (sec["title"], chunk))
    print("\n## Its tasks now (done = closed since)")
    for t in doc_tasks(v):
        if t["path"] == last["path"]:
            w = WHO_RE.match(t["text"])
            print("- [%s] %s%s   <%s:%d>" % ("x" if t["done"] else " ", t["text"], "  (owner: %s)" % (w.group(1) or w.group(2)) if w else "  (owner: you)", t["path"], t["line"] + 1))
    since = last["date"] or "0000"
    if project:
        print("\n## Done on #%s since %s" % (project, since))
        done = [t for t in all_day_tasks(v) if t["done"] and t.get("date") and t["date"].isoformat() >= since and ("#" + project) in t["text"]]
        for t in done:
            print("- [x] %s (%s)" % (t["text"], t["date"].isoformat()))
        if not done:
            print("(nothing logged)")
        print("\n## Still open on #%s" % project)
        for t in [t for t in task_pool(v) if t.get("type") == "task" and not t["done"] and (("#" + project) in t["text"] or t.get("project") == project)][:20]:
            print("- [ ] %s   <%s:%d>" % (t["text"], t["path"], t["line"] + 1))
    idx = person_index(v)
    owed = [t for n in attendees for t in waiting(v, find_person(v, n, idx)) if find_person(v, n, idx)]
    if owed:
        print("\n## Attendees owe you")
        for t in owed:
            print("- [ ] %s   <%s:%d>" % (t["text"], t["path"], t["line"] + 1))
    print("\nWrite the points to bring up with: write <session> --section agenda --text \"- [ ] …\"")


def cmd_docs(v, a):
    """Documents in the folders listed in documents.md (outside the vault): name, folder, path."""
    text = v.read("documents.md") or ""
    _, body = frontmatter(text)
    folders = []
    for m in re.finditer(r"^\s*[-*]\s+`?([^`\n]+?)`?\s*$", "\n".join(text.split("\n")[body:]), re.M):
        f = os.path.expanduser(m.group(1).strip())
        if os.path.isdir(f):
            folders.append(f)
        else:
            print("(folder not found: %s)" % f)
    if not folders:
        print("(no document folders: list them in documents.md, one '- /path' per line)")
        return
    words = [fold(w) for w in (a.query or "").split() if w]
    n = 0
    for root in folders:
        for dp, dn, fn in os.walk(root):
            dn[:] = sorted(x for x in dn if not x.startswith((".", "~$")))
            for name in sorted(fn):
                if name.startswith((".", "~$")):
                    continue
                rel = os.path.relpath(os.path.join(dp, name), root)
                if words and not all(w in fold(rel) for w in words):
                    continue
                print("- %s   <%s>" % (rel.replace(os.sep, "/"), os.path.join(dp, name)))
                n += 1
                if n >= a.limit:
                    return
    if not n:
        print("(no documents match)")


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
    s = sub.add_parser("plan"); s.add_argument("pattern"); s.add_argument("--date", default="today"); s.set_defaults(fn=cmd_plan)
    s = sub.add_parser("move"); s.add_argument("pattern"); s.add_argument("--to"); s.add_argument("--to-inbox", action="store_true"); s.add_argument("--from", dest="from_"); s.set_defaults(fn=cmd_move)
    s = sub.add_parser("new-meeting"); s.add_argument("--title", required=True); s.add_argument("--date", default="today"); s.add_argument("--time")
    s.add_argument("--project"); s.add_argument("--attendees"); s.add_argument("--template"); s.add_argument("--notes"); s.set_defaults(fn=cmd_new_meeting)
    s = sub.add_parser("pending"); s.add_argument("--since", default="-14"); s.set_defaults(fn=cmd_pending)
    s = sub.add_parser("meeting"); s.add_argument("ref"); s.set_defaults(fn=cmd_meeting)
    s = sub.add_parser("write"); s.add_argument("ref"); s.add_argument("--section", required=True, choices=SECTION_ORDER); s.add_argument("--text", required=True); s.set_defaults(fn=cmd_write)
    s = sub.add_parser("mark-processed"); s.add_argument("ref"); s.set_defaults(fn=cmd_mark_processed)
    s = sub.add_parser("source-done"); s.add_argument("path"); s.set_defaults(fn=cmd_source_done)
    s = sub.add_parser("people"); s.add_argument("query", nargs="?"); s.set_defaults(fn=cmd_people)
    s = sub.add_parser("person"); s.add_argument("name"); s.set_defaults(fn=cmd_person)
    s = sub.add_parser("knowledge"); s.add_argument("query", nargs="?"); s.set_defaults(fn=cmd_knowledge)
    s = sub.add_parser("search"); s.add_argument("query"); s.add_argument("--limit", type=int, default=12); s.set_defaults(fn=cmd_search)
    s = sub.add_parser("waiting"); s.add_argument("person", nargs="?"); s.set_defaults(fn=cmd_waiting)
    sub.add_parser("series").set_defaults(fn=cmd_series)
    s = sub.add_parser("add-person"); s.add_argument("--name", required=True); s.add_argument("--role"); s.add_argument("--team"); s.add_argument("--org")
    s.add_argument("--email"); s.add_argument("--aliases"); s.add_argument("--ask-for", dest="ask_for"); s.add_argument("--notes"); s.set_defaults(fn=cmd_add_person)
    s = sub.add_parser("add-knowledge"); s.add_argument("--title", required=True); s.add_argument("--kind", choices=["howto", "resource", "fact"], default="fact")
    s.add_argument("--project"); s.add_argument("--people"); s.add_argument("--source"); s.add_argument("--tags"); s.add_argument("--body"); s.set_defaults(fn=cmd_add_knowledge)
    s = sub.add_parser("find-task"); s.add_argument("query"); s.add_argument("--project"); s.add_argument("--all", action="store_true"); s.add_argument("--limit", type=int, default=12); s.set_defaults(fn=cmd_find_task)
    s = sub.add_parser("log"); s.add_argument("text"); s.add_argument("--date", default="today"); s.add_argument("--project"); s.set_defaults(fn=cmd_log)
    s = sub.add_parser("tasks"); s.add_argument("--project"); s.add_argument("--done", action="store_true"); s.add_argument("--since"); s.set_defaults(fn=cmd_tasks)
    s = sub.add_parser("person-set"); s.add_argument("name"); s.add_argument("--role"); s.add_argument("--team"); s.add_argument("--org"); s.add_argument("--email"); s.add_argument("--phone")
    s.add_argument("--ask-for", dest="ask_for"); s.add_argument("--alias"); s.add_argument("--note"); s.add_argument("--source"); s.set_defaults(fn=cmd_person_set)
    s = sub.add_parser("new-session"); s.add_argument("series"); s.add_argument("--date"); s.set_defaults(fn=cmd_new_session)
    s = sub.add_parser("prepare"); s.add_argument("ref"); s.add_argument("--date"); s.set_defaults(fn=cmd_prepare)
    s = sub.add_parser("docs"); s.add_argument("query", nargs="?"); s.add_argument("--limit", type=int, default=40); s.set_defaults(fn=cmd_docs)
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
