# -*- coding: utf-8 -*-
"""
Self-update from GitHub releases + vault backups. Standard library only.

Your data is never touched: the vault, panel.config.json, backups/ and the
embedded python/ folder are kept; only the app code is replaced. Before
updating, the vault is zipped into backups/ and the old code is kept too.
"""
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from datetime import datetime

DEFAULT_REPO = "jcordon5/panel"
# Top-level names that belong to the user and must survive an update
KEEP = {"vault", "boveda", "backups", "python", "panel.config.json", "_old_v1", ".git", ".restart"}
CODE_DIRS = {"app", "tools", "skills", "tests", "docs"}

_cache = {"t": 0, "data": None}


def parse_version(v):
    nums = re.findall(r"\d+", v or "")
    return tuple(int(x) for x in nums[:3]) + (0,) * (3 - len(nums[:3]))


def _get(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": "panel-updater", "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def latest_release(repo):
    data = json.loads(_get("https://api.github.com/repos/%s/releases/latest" % repo).decode("utf-8"))
    assets = [a for a in data.get("assets", []) if a.get("name", "").endswith(".zip")]
    return {
        "version": (data.get("tag_name") or "").lstrip("v"),
        "notes": data.get("body") or "",
        "url": data.get("html_url") or "https://github.com/%s/releases" % repo,
        "zip": assets[0]["browser_download_url"] if assets else data.get("zipball_url"),
        "published": data.get("published_at") or "",
    }


def check(current, repo, force=False):
    if not force and _cache["data"] and time.time() - _cache["t"] < 3600:
        rel = _cache["data"]
    else:
        try:
            rel = latest_release(repo)
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
            # no release published yet
            rel = {"version": current, "notes": "", "url": "https://github.com/%s" % repo}
        _cache.update(t=time.time(), data=rel)
    return {"current": current, "latest": rel["version"], "newer": parse_version(rel["version"]) > parse_version(current),
            "notes": rel["notes"], "url": rel["url"]}


def backup_vault(vault, backups_dir, label):
    os.makedirs(backups_dir, exist_ok=True)
    name = "vault-%s-%s.zip" % (datetime.now().strftime("%Y%m%d-%H%M%S"), re.sub(r"[^\w.-]+", "-", label))
    path = os.path.join(backups_dir, name)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for dp, dn, fn in os.walk(vault):
            dn[:] = [d for d in dn if d != ".trash"]
            for f in fn:
                if ".tmp-" in f:
                    continue
                full = os.path.join(dp, f)
                z.write(full, os.path.relpath(full, vault))
    return path


def vault_zip_bytes(vault):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for dp, dn, fn in os.walk(vault):
            dn[:] = [d for d in dn if d != ".trash"]
            for f in fn:
                if ".tmp-" in f:
                    continue
                full = os.path.join(dp, f)
                z.write(full, os.path.join("vault", os.path.relpath(full, vault)))
    return buf.getvalue()


def _inside(path, parent):
    path, parent = os.path.realpath(path), os.path.realpath(parent)
    return path == parent or path.startswith(parent + os.sep)


def apply(root, vault, current, repo):
    """Install the latest release over `root`. Returns {version, backup, method}."""
    backups = os.path.join(root, "backups")
    backup = backup_vault(vault, backups, "before-update-from-" + current)

    if os.path.isdir(os.path.join(root, ".git")) and shutil.which("git"):
        res = subprocess.run(["git", "-C", root, "pull", "--ff-only"], capture_output=True, text=True, timeout=120)
        if res.returncode != 0:
            raise RuntimeError("git pull failed: " + (res.stderr or res.stdout).strip()[:300])
        return {"version": "git", "backup": backup, "method": "git"}

    rel = latest_release(repo)
    if parse_version(rel["version"]) <= parse_version(current):
        return {"version": current, "backup": backup, "method": "none"}
    data = _get(rel["zip"], timeout=120)
    tmp = tempfile.mkdtemp(prefix="panel-update-")
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            z.extractall(tmp)
        src = None
        for dp, dn, fn in os.walk(tmp):
            if "server.py" in fn and os.path.isfile(os.path.join(dp, "app", "index.html")):
                src = dp
                break
        if not src:
            raise RuntimeError("the downloaded release does not look like Panel")

        # keep the current code, just in case
        old = os.path.join(backups, "app-" + current)
        if not os.path.exists(old):
            os.makedirs(old)
            for name in os.listdir(root):
                if name in KEEP or name.startswith("."):
                    continue
                s = os.path.join(root, name)
                if os.path.isdir(s) and name in CODE_DIRS:
                    shutil.copytree(s, os.path.join(old, name))
                elif os.path.isfile(s):
                    shutil.copy2(s, os.path.join(old, name))

        for name in os.listdir(src):
            if name in KEEP:
                continue
            s, d = os.path.join(src, name), os.path.join(root, name)
            if _inside(vault, d):  # never replace a folder that contains the vault
                continue
            if os.path.isdir(s):
                if os.path.isdir(d):
                    shutil.rmtree(d)
                shutil.copytree(s, d)
            else:
                shutil.copy2(s, d)
                if name.endswith((".sh", ".command")) and os.name != "nt":
                    os.chmod(d, 0o755)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return {"version": rel["version"], "backup": backup, "method": "zip"}
