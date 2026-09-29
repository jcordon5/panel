#!/bin/sh
# Panel installer for macOS and Linux. No admin rights needed.
#
#   curl -fsSL https://raw.githubusercontent.com/jcordon5/panel/main/install.sh | sh
#
# Installs (or updates) Panel in ~/Panel (or $PANEL_HOME), adds a launcher and starts it.
# Your data (vault, settings, backups) is never touched when you run it again.
set -e

REPO="jcordon5/panel"
DEST="${PANEL_HOME:-$HOME/Panel}"

PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c "import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)" 2>/dev/null; then
    PY="$c"; break
  fi
done
if [ -z "$PY" ]; then
  echo "Panel needs Python 3.7+."
  echo "  macOS: run 'xcode-select --install' (or install it from https://www.python.org/downloads/)"
  echo "  Linux: install the 'python3' package with your package manager"
  exit 1
fi

echo ""
echo "  Installing Panel in $DEST ..."
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

URL=$(curl -fsSL -H "User-Agent: panel-installer" "https://api.github.com/repos/$REPO/releases/latest" | "$PY" -c "
import json, sys
d = json.load(sys.stdin)
z = [a['browser_download_url'] for a in d.get('assets', []) if a['name'].endswith('.zip')]
print(z[0] if z else d['zipball_url'])")
curl -fsSL "$URL" -o "$TMP/panel.zip"

"$PY" - "$TMP/panel.zip" "$DEST" <<'EOF'
import os, shutil, sys, tempfile, zipfile
src_zip, dest = sys.argv[1], sys.argv[2]
keep = {"vault", "boveda", "backups", "python", "panel.config.json"}
tmp = tempfile.mkdtemp()
zipfile.ZipFile(src_zip).extractall(tmp)
src = next(dp for dp, dn, fn in os.walk(tmp) if "server.py" in fn)
os.makedirs(dest, exist_ok=True)
for name in os.listdir(src):
    if name in keep:
        continue
    s, d = os.path.join(src, name), os.path.join(dest, name)
    if os.path.isdir(s):
        if os.path.isdir(d):
            shutil.rmtree(d)
        shutil.copytree(s, d)
    else:
        shutil.copy2(s, d)
for name in ("panel.sh", "panel.command", "install.sh", "server.py"):
    p = os.path.join(dest, name)
    if os.path.exists(p):
        os.chmod(p, 0o755)
shutil.rmtree(tmp, ignore_errors=True)
EOF

case "$(uname -s)" in
  Darwin)
    mkdir -p "$HOME/Applications"
    ln -sf "$DEST/panel.command" "$HOME/Applications/Panel.command"
    LAUNCH="open \"$DEST/panel.command\""
    WHERE="~/Applications/Panel.command (or $DEST/panel.command)"
    ;;
  *)
    APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
    mkdir -p "$APPS"
    cat > "$APPS/panel.desktop" <<EOD
[Desktop Entry]
Type=Application
Name=Panel
Comment=Tasks, meetings and notes
Exec=sh -c 'cd "$DEST" && ./panel.sh'
Icon=$DEST/app/favicon.svg
Terminal=true
Categories=Office;
EOD
    LAUNCH=""
    WHERE="your applications menu (Panel) or $DEST/panel.sh"
    ;;
esac

echo ""
echo "  Panel is installed. Open it any time from $WHERE"
echo "  Your notes will live in: $DEST/vault"
echo ""
if [ -n "$LAUNCH" ]; then eval "$LAUNCH"; else (cd "$DEST" && nohup ./panel.sh >/dev/null 2>&1 &) ; fi
