#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Panel — local server.

Serves the web app in ./app and exposes a tiny JSON API to read and write the
Markdown files of your vault. Standard library only (Python 3.7+), works the
same on Windows, macOS and Linux. It only listens on 127.0.0.1: nothing leaves
your machine.

Usage:
    python3 server.py                      # vault in ./vault, port 8765
    python3 server.py --vault ~/Notes      # any folder
    python3 server.py --port 9000 --no-browser

Settings can also come from environment variables (PANEL_VAULT, PANEL_PORT)
or from an optional panel.config.json next to this file:
    { "vault": "D:/Documents/vault", "port": 8765, "open_browser": true }
"""
import argparse
import base64
import hashlib
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

VERSION = "3.0.0"
APP_NAME = "panel"
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.join(ROOT_DIR, "app")
DEFAULT_PORT = 8765
TRASH_DIR = ".trash"
MAX_UPLOAD = 25 * 1024 * 1024
UPLOAD_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".pdf", ".bmp"}
RESTORE_EXT = UPLOAD_EXT | {".md", ".txt", ".csv", ".json"}  # what a backup can put back into the vault
BACKUP_NAME_RE = re.compile(r"^panel-backup-[\w.-]{1,120}\.panelbackup$")
MAX_BACKUP = 1024 * 1024 * 1024
# Folders never listed (tool state, VCS, trash...)
SKIP_DIRS = {"node_modules", "__pycache__"}

sys.path.insert(0, os.path.join(ROOT_DIR, "tools"))

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("text/markdown", ".md")
mimetypes.add_type("application/manifest+json", ".webmanifest")

WRITE_LOCK = threading.Lock()
VAULT = ""  # absolute, real path; set in main()
CONFIG_PATH = os.path.join(ROOT_DIR, "panel.config.json")
RESTART_MARKER = os.path.join(ROOT_DIR, ".restart")
RESTART_CODE = 75  # launchers start the server again when it exits with this code
STATE = {"server": None, "restart": False, "vault_source": "default"}


# --------------------------------------------------------------------------- utils

def log(msg):
    # ASCII only: some Windows consoles choke on anything else
    try:
        print(msg, flush=True)
    except Exception:
        pass


def etag_of(data):
    return hashlib.sha1(data).hexdigest()


def stat_info(full):
    st = os.stat(full)
    return {"mtime": int(st.st_mtime * 1000), "size": st.st_size}


def rel_of(full):
    return os.path.relpath(full, VAULT).replace(os.sep, "/")


class ApiError(Exception):
    def __init__(self, msg, code=400, extra=None):
        Exception.__init__(self, msg)
        self.code = code
        self.extra = extra or {}


def safe_path(rel, allow_root=False):
    """Resolve a vault-relative path, refusing anything that escapes the vault
    or touches hidden folders (.trash, .git, .obsidian...)."""
    if not isinstance(rel, str):
        raise ApiError("bad path")
    rel = rel.replace("\\", "/").strip().strip("/")
    if "\x00" in rel:
        raise ApiError("bad path")
    if not rel:
        if allow_root:
            return VAULT
        raise ApiError("empty path")
    parts = rel.split("/")
    for p in parts:
        if p in ("", ".", "..") or p.startswith("."):
            raise ApiError("path not allowed: " + rel)
    full = os.path.realpath(os.path.join(VAULT, *parts))
    if full != VAULT and not full.startswith(VAULT + os.sep):
        raise ApiError("path outside vault")
    return full


def read_bytes(full):
    with open(full, "rb") as f:
        return f.read()


def decode_text(data):
    text = data.decode("utf-8-sig", errors="replace")
    return text.replace("\r\n", "\n").replace("\r", "\n")


def atomic_write(full, data):
    os.makedirs(os.path.dirname(full), exist_ok=True)
    tmp = "%s.tmp-%d-%d" % (full, os.getpid(), time.time_ns() if hasattr(time, "time_ns") else int(time.time() * 1e9))
    with open(tmp, "wb") as f:
        f.write(data)
    # os.replace can fail on Windows for a moment when an antivirus / indexer
    # holds the target open: retry a few times before giving up.
    last = None
    for _ in range(8):
        try:
            os.replace(tmp, full)
            return
        except PermissionError as e:
            last = e
            time.sleep(0.15)
    try:
        os.remove(tmp)
    except OSError:
        pass
    raise last


def walk_vault():
    out = []
    for dirpath, dirnames, filenames in os.walk(VAULT):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith(".") and d not in SKIP_DIRS)
        for name in sorted(filenames):
            if name.startswith(".") or ".tmp-" in name:
                continue
            full = os.path.join(dirpath, name)
            try:
                info = stat_info(full)
            except OSError:
                continue
            info["path"] = rel_of(full)
            out.append(info)
    return out


def list_dirs():
    out = []
    for dirpath, dirnames, _ in os.walk(VAULT):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith(".") and d not in SKIP_DIRS)
        for d in dirnames:
            out.append(rel_of(os.path.join(dirpath, d)))
    return out


def vault_is_empty():
    if not os.path.isdir(VAULT):
        return True
    for _dp, _dn, files in os.walk(VAULT):
        if any(f.endswith(".md") for f in files):
            return False
    return True


def find_legacy():
    """A v1 vault ('boveda' folder) next to the app, if any."""
    try:
        import migrate_v1
    except Exception:
        return None
    for cand in (os.path.join(ROOT_DIR, "boveda"), os.path.join(os.path.dirname(VAULT), "boveda")):
        if migrate_v1.looks_like_v1(cand):
            return cand
    return None


def slug_name(name):
    base, ext = os.path.splitext(os.path.basename(name))
    base = re.sub(r"[^A-Za-z0-9_-]+", "-", base).strip("-")[:60] or "file"
    return base, ext.lower()


def unique_path(full):
    if not os.path.exists(full):
        return full
    base, ext = os.path.splitext(full)
    n = 2
    while os.path.exists("%s-%d%s" % (base, n, ext)):
        n += 1
    return "%s-%d%s" % (base, n, ext)


# --------------------------------------------------------------------------- API

def api_info(_q=None):
    return {
        "app": APP_NAME,
        "version": VERSION,
        "vault": VAULT,
        "vaultName": os.path.basename(VAULT),
        "empty": vault_is_empty(),
        "legacy": find_legacy(),
        "platform": sys.platform,
    }


def api_files(_q=None):
    if not os.path.isdir(VAULT):
        return {"files": [], "dirs": []}
    return {"files": walk_vault(), "dirs": list_dirs()}


def api_read(payload):
    out = {}
    for rel in payload.get("paths", []):
        try:
            full = safe_path(rel)
            data = read_bytes(full)
            info = stat_info(full)
            info.update({"content": decode_text(data), "etag": etag_of(data)})
            out[rel] = info
        except (OSError, ApiError):
            out[rel] = None
    return {"files": out}


def api_write(payload):
    rel = payload.get("path")
    full = safe_path(rel)
    if not full.lower().endswith(".md"):
        raise ApiError("only .md files can be written")
    content = payload.get("content")
    if not isinstance(content, str):
        raise ApiError("content must be a string")
    data = content.replace("\r\n", "\n").encode("utf-8")
    with WRITE_LOCK:
        exists = os.path.isfile(full)
        if payload.get("create") and exists:
            raise ApiError("exists", 409, {"reason": "exists"})
        if "etag" in payload:
            expected = payload["etag"]
            current = etag_of(read_bytes(full)) if exists else None
            if expected != current:
                cur = decode_text(read_bytes(full)) if exists else None
                raise ApiError("conflict", 409, {"reason": "conflict", "etag": current, "content": cur})
        atomic_write(full, data)
        info = stat_info(full)
    info.update({"path": rel_of(full), "etag": etag_of(data)})
    return info


def api_move(payload):
    src = safe_path(payload.get("from"))
    dst = safe_path(payload.get("to"))
    with WRITE_LOCK:
        if not os.path.exists(src):
            raise ApiError("not found", 404)
        same = os.path.exists(dst) and os.path.samefile(src, dst)  # case-only rename
        if os.path.exists(dst) and not same:
            raise ApiError("exists", 409, {"reason": "exists"})
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if same:
            os.rename(src, dst)
        else:
            shutil.move(src, dst)
    return {"path": rel_of(dst)}


def api_delete(payload):
    """Never destroys anything: files go to <vault>/.trash/."""
    full = safe_path(payload.get("path"))
    with WRITE_LOCK:
        if not os.path.exists(full):
            raise ApiError("not found", 404)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        flat = rel_of(full).replace("/", "__")
        target = unique_path(os.path.join(VAULT, TRASH_DIR, stamp + "_" + flat))
        os.makedirs(os.path.dirname(target), exist_ok=True)
        shutil.move(full, target)
    return {"trash": os.path.relpath(target, VAULT).replace(os.sep, "/")}


def api_upload(payload):
    base, ext = slug_name(payload.get("name") or "image.png")
    if ext not in UPLOAD_EXT:
        raise ApiError("file type not allowed")
    try:
        data = base64.b64decode(payload.get("data") or "", validate=False)
    except Exception:
        raise ApiError("bad data")
    if not data or len(data) > MAX_UPLOAD:
        raise ApiError("file too large or empty")
    folder = safe_path("assets/" + datetime.now().strftime("%Y-%m"))
    with WRITE_LOCK:
        full = unique_path(os.path.join(folder, base + ext))
        atomic_write(full, data)
    return {"path": rel_of(full)}


def api_write_bytes(payload):
    """Put a file back from a backup (restore): Markdown, images, PDFs and a few text formats."""
    full = safe_path(payload.get("path"))
    if os.path.splitext(full)[1].lower() not in RESTORE_EXT:
        raise ApiError("file type not allowed")
    try:
        data = base64.b64decode(payload.get("data") or "", validate=False)
    except Exception:
        raise ApiError("bad data")
    if len(data) > MAX_UPLOAD:
        raise ApiError("file too large")
    with WRITE_LOCK:
        atomic_write(full, data)
    return {"path": rel_of(full)}


def _yaml(v):
    v = str(v)
    return json.dumps(v, ensure_ascii=False) if re.search(r'^[\s\-?:,\[\]{}#&*!|>\'"%@`]|: | #|^$', v) else v


def api_source(payload):
    """Something for your AI to process (transcript, email, pasted chat): stored as sources/<date>-<title>.md."""
    import sources
    name = str(payload.get("name") or "").strip()
    try:
        if payload.get("text") is not None:
            src = sources.to_markdown(name or "pasted.txt", text=str(payload["text"]))
        else:
            data = base64.b64decode(payload.get("data") or "", validate=False)
            if not data or len(data) > MAX_UPLOAD:
                raise ApiError("file too large or empty")
            src = sources.to_markdown(name, data)
    except ValueError as e:
        raise ApiError(str(e))
    if not src["text"].strip():
        raise ApiError("nothing to save: the file has no text")
    if payload.get("kind") in ("transcript", "email", "chat", "document", "note"):
        src["kind"] = payload["kind"]
    title = str(payload.get("title") or "").strip() or src["title"] or src["kind"]
    day = src["date"] or datetime.now().strftime("%Y-%m-%d")
    fm = ["---", "type: source", "kind: " + src["kind"], "title: " + _yaml(title), "date: " + day]
    if src["from"]:
        fm.append("from: " + _yaml(src["from"]))
    for key in ("meeting", "project"):
        if payload.get(key):
            fm.append("%s: %s" % (key, _yaml(payload[key])))
    fm += ["created: " + datetime.now().strftime("%Y-%m-%d"), "---", "", "# " + title, "", src["text"], ""]
    base = re.sub(r"[^a-z0-9]+", "-", title.lower().encode("ascii", "ignore").decode()).strip("-")[:50] or src["kind"]
    with WRITE_LOCK:
        full = unique_path(safe_path("sources/%s-%s.md" % (day, base)))
        atomic_write(full, "\n".join(fm).encode("utf-8"))
    return {"path": rel_of(full), "kind": src["kind"], "title": title}


# --------------------------------------------------------------------------- documents outside the vault
# documents.md (in the vault) lists folders with useful documents (templates, guides…). Panel only lists
# their file names and opens them with their own app; nothing is copied into the vault.

DOC_SKIP = re.compile(r"^(~\$|\.|desktop\.ini$|thumbs\.db$)", re.I)


def doc_folders(missing=None):
    """Folders listed in documents.md ("- /path" lines). Paths that don't exist go to `missing`."""
    try:
        text = decode_text(read_bytes(os.path.join(VAULT, "documents.md")))
    except OSError:
        return []
    body = text.split("\n---", 2)[-1] if text.startswith("---") else text
    out = []
    for m in re.finditer(r"^\s*[-*]\s+`?([^`\n]+?)`?\s*$", body, re.M):
        path = os.path.realpath(os.path.expanduser(m.group(1).strip()))
        if os.path.isdir(path):
            if path not in out:
                out.append(path)
        elif missing is not None:
            missing.append(m.group(1).strip())
    return out


def list_documents(folders, query="", limit=200, max_files=20000):
    words = [w for w in re.split(r"\s+", fold_text(query)) if w]
    out, seen = [], 0
    for root in folders:
        base_depth = root.rstrip(os.sep).count(os.sep)
        for dp, dn, fn in os.walk(root):
            dn[:] = sorted(d for d in dn if not DOC_SKIP.match(d))
            if dp.count(os.sep) - base_depth >= 6:
                dn[:] = []
            for n in sorted(fn):
                if DOC_SKIP.match(n):
                    continue
                seen += 1
                if seen > max_files:
                    return out
                full = os.path.join(dp, n)
                rel = os.path.relpath(full, root)
                if words and not all(w in fold_text(rel) for w in words):
                    continue
                try:
                    st = os.stat(full)
                except OSError:
                    continue
                out.append({"name": n, "path": full, "rel": rel.replace(os.sep, "/"), "folder": root,
                            "ext": os.path.splitext(n)[1].lower().lstrip("."), "size": st.st_size, "mtime": int(st.st_mtime * 1000)})
                if len(out) >= limit:
                    return out
    return out


def fold_text(s):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFKD", str(s or "")) if not unicodedata.combining(c)).lower()


def api_docs(q):
    missing = []
    folders = doc_folders(missing)
    return {"folders": folders, "missing": missing, "files": list_documents(folders, (q.get("q") or [""])[0])}


def api_open(payload):
    """Open a document of a listed folder (or of the vault) with its own app."""
    path = os.path.realpath(os.path.expanduser(str(payload.get("path") or "")))
    allowed = doc_folders() + [VAULT]
    if not os.path.isfile(path) or not any(path.startswith(f.rstrip(os.sep) + os.sep) for f in allowed):
        raise ApiError("only files in the vault or in the folders of documents.md can be opened", 403)
    if sys.platform.startswith("win"):
        os.startfile(path)  # noqa: S606 (the user's own file, opened with its default app)
    else:
        subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return {"opened": path}


def backup_dir(cfg=None):
    cfg = load_config() if cfg is None else cfg
    return os.path.realpath(os.path.expanduser(cfg.get("backup_dir") or os.path.join(ROOT_DIR, "backups")))


def encrypted_backups(folder):
    try:
        return sorted(n for n in os.listdir(folder) if BACKUP_NAME_RE.match(n))  # names carry the date: sort = age
    except OSError:
        return []


def save_encrypted_backup(name, data):
    """Encrypted backups are made in the browser; the server only stores them (it never sees the password)."""
    if not BACKUP_NAME_RE.match(name or ""):
        raise ApiError("bad backup name")
    if not data.startswith(b"PANELBK1"):
        raise ApiError("only encrypted Panel backups can be stored here")
    cfg = load_config()
    folder = backup_dir(cfg)
    full = os.path.join(folder, name)
    atomic_write(full, data)
    keep = max(1, int(cfg.get("backup_keep") or 14))
    for old in encrypted_backups(folder)[:-keep]:
        try:
            os.remove(os.path.join(folder, old))
        except OSError:
            pass
    return {"path": full}


def api_mkdir(payload):
    full = safe_path(payload.get("path"))
    os.makedirs(full, exist_ok=True)
    return {"path": rel_of(full)}


def api_migrate(payload):
    import migrate_v1
    src = find_legacy()
    if not src:
        raise ApiError("no legacy vault found", 404)
    if not vault_is_empty():
        raise ApiError("the vault is not empty", 409)
    report = migrate_v1.migrate(src, VAULT, lang=payload.get("lang") or "es")
    return {"report": report}


def api_settings(_q=None):
    cfg = load_config()
    return {
        "calendars": cfg.get("calendars") or [],
        "outlookAttendees": bool(cfg.get("outlook_attendees")),
        "vault": VAULT,
        "platform": sys.platform,
        "updateRepo": cfg.get("update_repo") or updater().DEFAULT_REPO,
        "version": VERSION,
        "git": os.path.isdir(os.path.join(ROOT_DIR, ".git")),
        "checkUpdates": cfg.get("check_updates", True),
        "backupDir": backup_dir(cfg),
        "backupKeep": int(cfg.get("backup_keep") or 14),
        "autoBackup": bool(cfg.get("auto_backup")),
        "lastBackup": last_encrypted_backup(cfg),
    }


def last_encrypted_backup(cfg):
    folder = backup_dir(cfg)
    names = encrypted_backups(folder)
    if not names:
        return None
    return int(os.path.getmtime(os.path.join(folder, names[-1])) * 1000)


def api_save_settings(payload):
    cfg = load_config()
    restart = False
    if "calendars" in payload:
        cals = [str(c).strip() for c in payload.get("calendars") or [] if str(c).strip()]
        cfg["calendars"] = cals
    if "outlookAttendees" in payload:
        cfg["outlook_attendees"] = bool(payload["outlookAttendees"])
    if "checkUpdates" in payload:
        cfg["check_updates"] = bool(payload["checkUpdates"])
    if "autoBackup" in payload:
        cfg["auto_backup"] = bool(payload["autoBackup"])
    if "backupKeep" in payload:
        cfg["backup_keep"] = max(1, min(365, int(payload["backupKeep"] or 14)))
    if payload.get("backupDir"):
        folder = os.path.realpath(os.path.expanduser(str(payload["backupDir"]).strip()))
        try:
            os.makedirs(folder, exist_ok=True)
        except OSError as e:
            raise ApiError("cannot use that folder: %s" % e)
        if not os.access(folder, os.W_OK):
            raise ApiError("that folder is not writable")
        cfg["backup_dir"] = folder
    if payload.get("vault"):
        new = os.path.realpath(os.path.expanduser(str(payload["vault"]).strip()))
        if new != VAULT and STATE["vault_source"] in ("cli", "env"):
            raise ApiError("Panel was started with %s; change the vault there" % ("--vault" if STATE["vault_source"] == "cli" else "PANEL_VAULT"))
        if new != VAULT:
            try:
                os.makedirs(new, exist_ok=True)
            except OSError as e:
                raise ApiError("cannot use that folder: %s" % e)
            if not os.access(new, os.W_OK):
                raise ApiError("that folder is not writable")
            cfg["vault"] = new
            restart = True
    save_config(cfg)
    return {"restart": restart}


def api_calendar(q):
    import calendars
    cfg = load_config()
    frm, to = (q.get("from") or [""])[0], (q.get("to") or [""])[0]
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", frm) or not re.match(r"^\d{4}-\d{2}-\d{2}$", to):
        raise ApiError("from/to must be YYYY-MM-DD")
    events, errors = calendars.get_events(cfg.get("calendars") or [], frm, to,
                                          outlook_attendees=bool(cfg.get("outlook_attendees")),
                                          refresh=bool(q.get("refresh")))
    return {"events": events, "errors": errors, "configured": bool(cfg.get("calendars"))}


def updater():
    import updater as u
    return u


def update_repo():
    return load_config().get("update_repo") or updater().DEFAULT_REPO


def api_update_check(q):
    try:
        return updater().check(VERSION, update_repo(), force=bool(q.get("force")))
    except Exception as e:
        raise ApiError("could not check for updates: %s" % e, 502)


def api_update_apply(_payload):
    with WRITE_LOCK:
        res = updater().apply(ROOT_DIR, VAULT, VERSION, update_repo())
    if res["method"] != "none":
        schedule_restart()
    res["backup"] = os.path.relpath(res["backup"], ROOT_DIR).replace(os.sep, "/")
    return res


def api_backup(_payload):
    path = updater().backup_vault(VAULT, os.path.join(ROOT_DIR, "backups"), "manual")
    return {"path": path}


def api_restart(_payload):
    schedule_restart()
    return {}


def schedule_restart():
    STATE["restart"] = True
    if STATE["server"] is not None:
        threading.Timer(0.4, STATE["server"].shutdown).start()


POST_ROUTES = {
    "/api/settings": api_save_settings,
    "/api/update/apply": api_update_apply,
    "/api/backup": api_backup,
    "/api/restart": api_restart,
    "/api/read": api_read,
    "/api/write": api_write,
    "/api/move": api_move,
    "/api/delete": api_delete,
    "/api/upload": api_upload,
    "/api/write-bytes": api_write_bytes,
    "/api/source": api_source,
    "/api/open": api_open,
    "/api/mkdir": api_mkdir,
    "/api/migrate": api_migrate,
}
GET_ROUTES = {
    "/api/info": api_info,
    "/api/files": api_files,
    "/api/settings": api_settings,
    "/api/calendar": api_calendar,
    "/api/update/check": api_update_check,
    "/api/docs": api_docs,
}

APP_CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob: https: http:; connect-src 'self' blob:; font-src 'self' data:; "
    "object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
)


class Handler(BaseHTTPRequestHandler):
    server_version = "Panel/" + VERSION
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    # -- guards --------------------------------------------------------------
    def _host_ok(self):
        # Blocks DNS-rebinding: only accept requests addressed to localhost.
        host = (self.headers.get("Host") or "").lower()
        hostname = host.rsplit(":", 1)[0] if not host.startswith("[") else host.split("]")[0] + "]"
        return hostname in ("127.0.0.1", "localhost", "[::1]")

    def _send(self, code, body, ctype, extra_headers=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        for k, v in (extra_headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self._send(code, body, "application/json; charset=utf-8")

    def _error(self, e):
        obj = {"ok": False, "error": str(e)}
        obj.update(getattr(e, "extra", {}))
        self._json(obj, getattr(e, "code", 500))

    # -- GET -----------------------------------------------------------------
    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        if not self._host_ok():
            return self._json({"ok": False, "error": "bad host"}, 403)
        parsed = urlparse(self.path)
        route = unquote(parsed.path)
        if route in GET_ROUTES:
            if route != "/api/info" and self.headers.get("X-Panel") != "1":
                return self._json({"ok": False, "error": "missing header"}, 403)
            try:
                res = GET_ROUTES[route](parse_qs(parsed.query))
                res["ok"] = True
                return self._json(res)
            except ApiError as e:
                return self._error(e)
            except Exception as e:  # pragma: no cover
                return self._error(ApiError(str(e), 500))
        if route == "/api/export":
            # plain link (download): protected by the Host check; the zip only goes to this machine
            data = updater().vault_zip_bytes(VAULT)
            name = "panel-vault-%s.zip" % datetime.now().strftime("%Y%m%d-%H%M")
            return self._send(200, data, "application/zip", {"Content-Disposition": 'attachment; filename="%s"' % name})
        if route.startswith("/vault/"):
            return self._serve_vault_file(route[len("/vault/"):])
        return self._serve_app(route)

    def _serve_app(self, route):
        if route in ("", "/"):
            route = "/index.html"
        parts = [p for p in route.split("/") if p]
        if any(p in ("..", ".") or p.startswith(".") for p in parts):
            return self._json({"ok": False, "error": "not found"}, 404)
        full = os.path.realpath(os.path.join(APP_DIR, *parts))
        if not full.startswith(os.path.realpath(APP_DIR) + os.sep) or not os.path.isfile(full):
            return self._json({"ok": False, "error": "not found"}, 404)
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype.endswith("javascript"):
            ctype += "; charset=utf-8"
        headers = {"Content-Security-Policy": APP_CSP} if full.endswith(".html") else None
        self._send(200, read_bytes(full), ctype, headers)

    def _serve_vault_file(self, rel):
        try:
            full = safe_path(rel)
            if not os.path.isfile(full):
                raise ApiError("not found", 404)
        except ApiError as e:
            return self._error(e)
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if full.lower().endswith(".md"):
            ctype = "text/plain; charset=utf-8"
        # sandbox: an SVG/HTML in the vault can never run code in the app origin
        self._send(200, read_bytes(full), ctype, {"Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"})

    # -- POST ----------------------------------------------------------------
    def do_POST(self):
        if not self._host_ok():
            return self._json({"ok": False, "error": "bad host"}, 403)
        # Custom header => browsers must preflight cross-site requests (which we
        # never approve), so other websites cannot write into your vault.
        if self.headers.get("X-Panel") != "1":
            return self._json({"ok": False, "error": "missing header"}, 403)
        parsed = urlparse(self.path)
        route = parsed.path
        if route == "/api/backup/encrypted":  # raw bytes, may be large
            try:
                length = int(self.headers.get("Content-Length") or 0)
                if length > MAX_BACKUP:
                    raise ApiError("backup too large", 413)
                res = save_encrypted_backup((parse_qs(parsed.query).get("name") or [""])[0], self.rfile.read(length))
                res["ok"] = True
                return self._json(res)
            except ApiError as e:
                return self._error(e)
            except Exception as e:
                return self._error(ApiError(str(e), 500))
        fn = POST_ROUTES.get(route)
        if not fn:
            return self._json({"ok": False, "error": "unknown route"}, 404)
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length > MAX_UPLOAD * 2:
                raise ApiError("payload too large", 413)
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            res = fn(payload)
            res["ok"] = True
            self._json(res)
        except ApiError as e:
            self._error(e)
        except Exception as e:
            self._error(ApiError(str(e), 500))


# --------------------------------------------------------------------------- main

def save_config(cfg):
    tmp = CONFIG_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, CONFIG_PATH)


def load_config():
    cfg = {}
    path = CONFIG_PATH
    if os.path.isfile(path):
        try:
            with open(path, encoding="utf-8-sig") as f:
                cfg = json.load(f)
        except Exception as e:
            log("Warning: could not read panel.config.json (%s)" % e)
    return cfg


def existing_panel(port):
    try:
        with urllib.request.urlopen("http://127.0.0.1:%d/api/info" % port, timeout=1.5) as r:
            return json.loads(r.read().decode("utf-8")).get("app") == APP_NAME
    except Exception:
        return False


def main(argv=None):
    global VAULT
    cfg = load_config()
    ap = argparse.ArgumentParser(description="Panel - local Markdown tasks, meetings and notes.")
    cfg_vault = cfg.get("vault")
    if cfg_vault and not os.path.isabs(os.path.expanduser(cfg_vault)):
        cfg_vault = os.path.join(ROOT_DIR, cfg_vault)  # relative to the app folder, not the cwd
    ap.add_argument("--vault", default=os.environ.get("PANEL_VAULT") or cfg_vault or os.path.join(ROOT_DIR, "vault"),
                    help="folder with your Markdown files (default: ./vault)")
    ap.add_argument("--port", type=int, default=int(os.environ.get("PANEL_PORT") or cfg.get("port") or DEFAULT_PORT))
    ap.add_argument("--no-browser", action="store_true", help="do not open the browser")
    ap.add_argument("--demo", nargs="?", const="es", choices=["es", "en"], help="try Panel with a throw-away demo vault")
    args = ap.parse_args(argv)
    raw = sys.argv[1:] if argv is None else list(argv)
    STATE["vault_source"] = ("cli" if any(a == "--vault" or a.startswith("--vault=") for a in raw) or args.demo
                             else "env" if os.environ.get("PANEL_VAULT") else "config" if cfg_vault else "default")
    if args.demo:
        import tempfile
        import make_demo
        args.vault = make_demo.make(os.path.join(tempfile.mkdtemp(prefix="panel-demo-"), "vault"), args.demo)
    open_browser = not args.no_browser and cfg.get("open_browser", True)
    if os.path.exists(RESTART_MARKER):  # coming back from an update / restart: the tab is already open
        open_browser = False
        try:
            os.remove(RESTART_MARKER)
        except OSError:
            pass

    VAULT = os.path.realpath(os.path.expanduser(args.vault))
    os.makedirs(VAULT, exist_ok=True)

    server, port = None, args.port
    for candidate in range(args.port, args.port + 20):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", candidate), Handler)
            port = candidate
            break
        except OSError:
            if existing_panel(candidate):
                url = "http://127.0.0.1:%d/" % candidate
                log("Panel is already running at " + url)
                if open_browser:
                    webbrowser.open(url)
                return 0
    if server is None:
        log("Error: no free port found from %d" % args.port)
        return 1

    server.daemon_threads = True
    STATE["server"] = server
    url = "http://127.0.0.1:%d/" % port
    log("")
    log("  Panel %s" % VERSION)
    log("  App:   %s" % url)
    log("  Vault: %s" % VAULT)
    log("")
    log("  Keep this window open while you use Panel. Ctrl+C to stop.")
    if open_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("\nBye!")
    finally:
        server.server_close()
    if STATE["restart"]:
        log("  Restarting...")
        with open(RESTART_MARKER, "w") as f:
            f.write("1")
        if os.environ.get("PANEL_LAUNCHER") == "1":
            return RESTART_CODE  # the launcher starts us again
        argv_ = [sys.executable, os.path.abspath(__file__)] + (sys.argv[1:] if argv is None else list(argv))
        if os.name == "nt":
            import subprocess
            subprocess.Popen(argv_)
            return 0
        os.execv(sys.executable, argv_)
    return 0


if __name__ == "__main__":
    sys.exit(main())
