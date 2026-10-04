# -*- coding: utf-8 -*-
"""
HTTP GET that also works behind corporate proxies. Standard library only.

Python's urllib is tried first. If it cannot connect at all (typically a
company proxy that inspects HTTPS, which Python doesn't trust or whose
certificate revocation list can't be reached), the request is retried with
the system's curl, which uses the operating system's certificate store. On
Windows, curl is told to skip the revocation check only when the revocation
server can't be reached; the certificate itself is always verified.

HTTP errors (404, 403…) are raised as urllib.error.HTTPError in both cases.
"""
import os
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request

# Windows' curl (Schannel) fails when the proxy's revocation server is unreachable
_CURL_TRIES = [["--ssl-revoke-best-effort"], ["--ssl-no-revoke"]] if os.name == "nt" else [[]]


def get(url, headers=None, timeout=15):
    headers = headers or {}
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except urllib.error.HTTPError:
        raise
    except (urllib.error.URLError, OSError) as e:
        first = e
    curl = shutil.which("curl.exe" if os.name == "nt" else "curl")
    if not curl:
        raise first
    for extra in _CURL_TRIES:
        data = _curl(curl, url, headers, timeout, extra)
        if data is not None:
            return data
    raise first


def _curl(curl, url, headers, timeout, extra):
    fd, out = tempfile.mkstemp(prefix="panel-dl-")
    os.close(fd)
    try:
        cmd = [curl, "-sSL", "--max-time", str(int(timeout)), "-o", out, "-w", "%{http_code}"] + extra
        for k, v in headers.items():
            cmd += ["-H", "%s: %s" % (k, v)]
        cmd.append(url)
        try:
            res = subprocess.run(cmd, capture_output=True, timeout=timeout + 10,
                                 creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        except (OSError, subprocess.TimeoutExpired):
            return None
        status = (res.stdout or b"").decode("ascii", "replace").strip()
        code = int(status) if status.isdigit() else 0
        if res.returncode != 0 or not code:
            return None
        if code >= 400:
            raise urllib.error.HTTPError(url, code, "HTTP %d" % code, None, None)
        with open(out, "rb") as f:
            return f.read()
    finally:
        try:
            os.remove(out)
        except OSError:
            pass
