# -*- coding: utf-8 -*-
"""
Calendar sources for Panel (read-only). Standard library only.

  - iCalendar (.ics) files or URLs: Outlook on the web ("Publish calendar"),
    Google Calendar ("secret address in iCal format"), Apple iCloud, Nextcloud...
  - "outlook": the classic Outlook desktop app on Windows, read through COM with
    PowerShell (no extra software, recurring meetings already expanded).

get_events(sources, "2026-09-28", "2026-10-04") -> (events, errors)
Each event: {uid, title, date, start, end, time, allDay, location, attendees, source}
with local, naive "YYYY-MM-DDTHH:MM" times.
"""
import base64
import json
import re
import subprocess
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo  # Python 3.9+
except Exception:  # pragma: no cover
    ZoneInfo = None

_CACHE = {}
CACHE_SECONDS = 300

# Outlook/Exchange use Windows zone names in TZID
WINDOWS_TZ = {
    "romance standard time": "Europe/Madrid", "w. europe standard time": "Europe/Berlin",
    "central europe standard time": "Europe/Budapest", "central european standard time": "Europe/Warsaw",
    "gmt standard time": "Europe/London", "greenwich standard time": "Atlantic/Reykjavik",
    "e. europe standard time": "Europe/Chisinau", "fle standard time": "Europe/Kiev", "gtb standard time": "Europe/Bucharest",
    "eastern standard time": "America/New_York", "central standard time": "America/Chicago",
    "mountain standard time": "America/Denver", "pacific standard time": "America/Los_Angeles",
    "sa pacific standard time": "America/Bogota", "argentina standard time": "America/Buenos_Aires",
    "e. south america standard time": "America/Sao_Paulo", "pacific sa standard time": "America/Santiago",
    "central standard time (mexico)": "America/Mexico_City", "utc": "UTC", "coordinated universal time": "UTC",
}


# --------------------------------------------------------------------------- iCalendar

def _unfold(text):
    return re.sub(r"\r?\n[ \t]", "", text.replace("\r\n", "\n"))


def _unescape(v):
    return v.replace("\\n", "\n").replace("\\N", "\n").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")


def _parse_line(line):
    m = re.match(r"^([A-Za-z0-9-]+)((?:;[^:]*)?):(.*)$", line)
    if not m:
        return None, {}, ""
    params = {}
    for p in re.findall(r';([^=;]+)=("[^"]*"|[^;]*)', m.group(2)):
        params[p[0].upper()] = p[1].strip('"')
    return m.group(1).upper(), params, m.group(3)


def _zone(tzid):
    if not tzid or ZoneInfo is None:
        return None
    for name in (tzid, WINDOWS_TZ.get(tzid.lower())):
        if not name:
            continue
        try:
            return ZoneInfo(name)
        except Exception:
            continue
    return None


def _to_local(value, params):
    """-> (naive local datetime, all_day)"""
    v = value.strip()
    if params.get("VALUE") == "DATE" or re.match(r"^\d{8}$", v):
        return datetime.strptime(v[:8], "%Y%m%d"), True
    dt = datetime.strptime(v[:15], "%Y%m%dT%H%M%S")
    if v.endswith("Z"):
        return dt.replace(tzinfo=timezone.utc).astimezone().replace(tzinfo=None), False
    tz = _zone(params.get("TZID"))
    if tz is not None:
        return dt.replace(tzinfo=tz).astimezone().replace(tzinfo=None), False
    return dt, False  # floating or unknown zone: assume local


def parse_ics(text):
    events, cur, depth = [], None, []
    for line in _unfold(text).split("\n"):
        if line.startswith("BEGIN:"):
            depth.append(line[6:].strip())
            if depth[-1] == "VEVENT":
                cur = {"attendees": [], "exdates": set()}
            continue
        if line.startswith("END:"):
            if depth and depth[-1] == "VEVENT" and cur is not None:
                if "start" in cur:
                    events.append(cur)
                cur = None
            if depth:
                depth.pop()
            continue
        if cur is None or not depth or depth[-1] != "VEVENT":
            continue
        name, params, value = _parse_line(line)
        if name == "SUMMARY":
            cur["title"] = _unescape(value).strip()
        elif name == "UID":
            cur["uid"] = value.strip()
        elif name == "LOCATION":
            cur["location"] = _unescape(value).strip()
        elif name == "DTSTART":
            cur["start"], cur["allDay"] = _to_local(value, params)
        elif name == "DTEND":
            cur["end"], _ = _to_local(value, params)
        elif name == "DURATION":
            cur["duration"] = value
        elif name == "RRULE":
            cur["rrule"] = dict(p.split("=", 1) for p in value.split(";") if "=" in p)
        elif name == "EXDATE":
            for v in value.split(","):
                try:
                    cur["exdates"].add(_to_local(v, params)[0])
                except ValueError:
                    pass
        elif name == "RECURRENCE-ID":
            cur["recurrence_id"] = _to_local(value, params)[0]
        elif name == "STATUS":
            cur["status"] = value.strip().upper()
        elif name == "ATTENDEE":
            cn = params.get("CN") or re.sub(r"^mailto:", "", value, flags=re.I)
            if cn:
                cur["attendees"].append(cn.strip())
    return events


def _duration(ev):
    if ev.get("end"):
        return ev["end"] - ev["start"]
    m = re.match(r"^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?", ev.get("duration", ""))
    if m and any(m.groups()):
        w, d, h, mi = (int(x or 0) for x in m.groups())
        return timedelta(weeks=w, days=d, hours=h, minutes=mi)
    return timedelta(days=1) if ev.get("allDay") else timedelta(hours=1)


WD = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]


def _occurrences(ev, lo, hi):
    """Start datetimes of `ev` overlapping [lo, hi) (naive local)."""
    start, dur, rule = ev["start"], _duration(ev), ev.get("rrule")
    if not rule:
        if start < hi and start + dur > lo:
            yield start
        return
    freq = rule.get("FREQ", "DAILY")
    interval = max(1, int(rule.get("INTERVAL", "1") or 1))
    count = int(rule["COUNT"]) if rule.get("COUNT") else None
    until = None
    if rule.get("UNTIL"):
        try:
            until = _to_local(rule["UNTIL"], {})[0]
            if len(rule["UNTIL"].strip()) == 8:
                until += timedelta(days=1) - timedelta(seconds=1)
        except ValueError:
            until = None
    byday = [d for d in rule.get("BYDAY", "").split(",") if d]
    bymonthday = [int(x) for x in rule.get("BYMONTHDAY", "").split(",") if x.strip().lstrip("-").isdigit()]
    t = start.time()
    n, guard = 0, 0

    def candidates():
        if freq == "DAILY":
            d = start.date()
            while True:
                yield d
                d += timedelta(days=interval)
        elif freq == "WEEKLY":
            days = [WD.index(x[-2:]) for x in byday] or [start.weekday()]
            wk = start.date() - timedelta(days=start.weekday())
            while True:
                for i in sorted(days):
                    yield wk + timedelta(days=i)
                wk += timedelta(weeks=interval)
        elif freq == "MONTHLY":
            y, mo = start.year, start.month
            while True:
                first = date(y, mo, 1)
                nxt = date(y + (mo // 12), mo % 12 + 1, 1)
                last = (nxt - timedelta(days=1)).day
                out = []
                if bymonthday:
                    out = [date(y, mo, d if d > 0 else last + d + 1) for d in bymonthday if 1 <= (d if d > 0 else last + d + 1) <= last]
                elif byday:
                    for spec in byday:
                        m = re.match(r"^([+-]?\d)?([A-Z]{2})$", spec)
                        if not m:
                            continue
                        wd = WD.index(m.group(2))
                        days = [first + timedelta(days=i) for i in range(last) if (first + timedelta(days=i)).weekday() == wd]
                        if m.group(1):
                            k = int(m.group(1))
                            if -len(days) <= k <= len(days) and k != 0:
                                out.append(days[k - 1] if k > 0 else days[k])
                        else:
                            out += days
                elif start.day <= last:
                    out = [date(y, mo, start.day)]
                for d in sorted(out):
                    yield d
                mo += interval
                while mo > 12:
                    mo -= 12
                    y += 1
        elif freq == "YEARLY":
            y = start.year
            while True:
                try:
                    yield date(y, start.month, start.day)
                except ValueError:
                    pass
                y += interval
        else:
            yield start.date()
            return

    for d in candidates():
        guard += 1
        if guard > 20000:
            break
        occ = datetime.combine(d, t)
        if occ < start:
            continue
        if until and occ > until:
            break
        n += 1
        if count and n > count:
            break
        if occ >= hi:
            break
        if occ in ev["exdates"]:
            continue
        if occ + dur > lo:
            yield occ


def _fmt(dt):
    return dt.strftime("%Y-%m-%dT%H:%M")


def events_from_ics(text, lo, hi, source):
    raw = parse_ics(text)
    overrides = {}
    for ev in raw:
        if ev.get("recurrence_id"):
            overrides[(ev.get("uid"), ev["recurrence_id"])] = ev
    out = []
    for ev in raw:
        if ev.get("recurrence_id"):
            continue
        for occ in _occurrences(ev, lo, hi):
            real = overrides.get((ev.get("uid"), occ), ev)
            s = real["start"] if real is not ev else occ
            if real.get("status") == "CANCELLED" or not (s < hi and s + _duration(real) > lo):
                continue
            out.append(_event(real, s, s + _duration(real), source, uid_suffix=occ.strftime("%Y%m%dT%H%M") if ev.get("rrule") else ""))
    for (uid, rid), ev in overrides.items():  # moved occurrences of series outside the window
        if not any(o["uid"].startswith(str(uid)) and o["start"] == _fmt(ev["start"]) for o in out):
            if ev.get("status") != "CANCELLED" and ev["start"] < hi and ev["start"] + _duration(ev) > lo:
                out.append(_event(ev, ev["start"], ev["start"] + _duration(ev), source, uid_suffix=rid.strftime("%Y%m%dT%H%M")))
    return out


def _event(ev, s, e, source, uid_suffix=""):
    all_day = bool(ev.get("allDay"))
    return {
        "uid": (ev.get("uid") or ev.get("title", "") + _fmt(s)) + ("@" + uid_suffix if uid_suffix else ""),
        "title": ev.get("title") or "(sin título)",
        "date": s.strftime("%Y-%m-%d"), "start": _fmt(s), "end": _fmt(e),
        "time": "" if all_day else s.strftime("%H:%M"), "allDay": all_day,
        "location": ev.get("location", ""), "attendees": ev.get("attendees", [])[:30], "source": source,
    }


def _fetch(src):
    if re.match(r"^(https?|webcal)://", src, re.I):
        url = re.sub(r"^webcal://", "https://", src, flags=re.I)
        req = urllib.request.Request(url, headers={"User-Agent": "Panel calendar"})
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read().decode("utf-8", errors="replace")
    with open(src, encoding="utf-8-sig", errors="replace") as f:
        return f.read()


# --------------------------------------------------------------------------- Outlook (Windows)

OUTLOOK_PS = r"""
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ol = New-Object -ComObject Outlook.Application
$cal = $ol.GetNamespace('MAPI').GetDefaultFolder(9)
$items = $cal.Items
$items.IncludeRecurrences = $true
$items.Sort('[Start]')
$from = [datetime]::ParseExact('__FROM__', 'yyyy-MM-dd', $null)
$to = [datetime]::ParseExact('__TO__', 'yyyy-MM-dd', $null)
$filter = "[Start] < '" + $to.ToString('g') + "' AND [End] > '" + $from.ToString('g') + "'"
$out = New-Object System.Collections.ArrayList
foreach ($a in $items.Restrict($filter)) {
  if ($a.MeetingStatus -eq 5 -or $a.MeetingStatus -eq 7) { continue }
  $att = ''
  if (__ATTENDEES__) { try { $att = $a.RequiredAttendees } catch { $att = '' } }
  [void]$out.Add([pscustomobject]@{
    uid = [string]$a.GlobalAppointmentID + '@' + $a.Start.ToString('yyyyMMddTHHmm')
    title = [string]$a.Subject
    start = $a.Start.ToString('yyyy-MM-ddTHH:mm')
    end = $a.End.ToString('yyyy-MM-ddTHH:mm')
    allDay = [bool]$a.AllDayEvent
    location = [string]$a.Location
    attendees = [string]$att
  })
  if ($out.Count -ge 500) { break }
}
ConvertTo-Json -InputObject @($out) -Depth 3 -Compress
"""


def events_from_outlook(lo, hi, attendees=False):
    if not sys.platform.startswith("win"):
        raise RuntimeError("Outlook desktop sync only works on Windows")
    script = OUTLOOK_PS.replace("__FROM__", lo.strftime("%Y-%m-%d")).replace("__TO__", hi.strftime("%Y-%m-%d"))
    script = script.replace("__ATTENDEES__", "$true" if attendees else "$false")
    enc = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
    flags = 0x08000000 if sys.platform.startswith("win") else 0  # CREATE_NO_WINDOW
    res = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc],
                         capture_output=True, timeout=60, creationflags=flags)
    out = res.stdout.decode("utf-8", errors="replace").strip()
    if res.returncode != 0 or not out.startswith(("[", "{")):
        err = res.stderr.decode("utf-8", errors="replace").strip().splitlines()
        raise RuntimeError("Outlook: " + (err[0] if err else "no data (is the classic Outlook desktop app installed?)"))
    data = json.loads(out)
    if isinstance(data, dict):
        data = [data]
    events = []
    for a in data:
        s = datetime.strptime(a["start"], "%Y-%m-%dT%H:%M")
        people = [p.strip() for p in re.split(r"[;,]", a.get("attendees") or "") if p.strip()]
        events.append({
            "uid": a.get("uid") or a["title"] + a["start"], "title": a.get("title") or "(sin título)",
            "date": s.strftime("%Y-%m-%d"), "start": a["start"], "end": a.get("end") or a["start"],
            "time": "" if a.get("allDay") else s.strftime("%H:%M"), "allDay": bool(a.get("allDay")),
            "location": a.get("location") or "", "attendees": people[:30], "source": "outlook",
        })
    return events


# --------------------------------------------------------------------------- entry point

def get_events(sources, frm, to, outlook_attendees=False, refresh=False):
    """sources: list of ICS URLs/paths and/or the word "outlook". frm/to: YYYY-MM-DD (inclusive)."""
    lo = datetime.strptime(frm, "%Y-%m-%d")
    hi = datetime.strptime(to, "%Y-%m-%d") + timedelta(days=1)
    events, errors = [], []
    for src in sources or []:
        src = (src or "").strip()
        if not src:
            continue
        key = (src, frm, to)
        hit = _CACHE.get(key)
        if hit and not refresh and time.time() - hit[0] < CACHE_SECONDS:
            events += hit[1]
            continue
        try:
            if src.lower() == "outlook":
                evs = events_from_outlook(lo, hi, outlook_attendees)
            else:
                evs = events_from_ics(_fetch(src), lo, hi, "ics")
            _CACHE[key] = (time.time(), evs)
            events += evs
        except Exception as e:  # keep going with the other sources
            errors.append("%s: %s" % ("Outlook" if src.lower() == "outlook" else re.sub(r"\?.*$", "?…", src), e))
            if hit:
                events += hit[1]
    seen, out = set(), []
    for e in sorted(events, key=lambda e: e["start"]):
        k = (e["title"], e["start"])
        if k not in seen:
            seen.add(k)
            out.append(e)
    return out, errors
