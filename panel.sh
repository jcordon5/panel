#!/usr/bin/env sh
# Panel - start the local server (Linux / macOS). Usage: ./panel.sh [--vault PATH] [--port N]
cd "$(dirname "$0")" || exit 1
PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c "import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)" 2>/dev/null; then
    PY="$c"; break
  fi
done
if [ -z "$PY" ]; then
  echo "Python 3.7+ is required: https://www.python.org/downloads/"
  exit 1
fi
export PANEL_LAUNCHER=1
while :; do
  "$PY" server.py "$@"
  code=$?
  [ "$code" -eq 75 ] || exit "$code"   # 75 = restart after an update or a settings change
done
