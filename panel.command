#!/usr/bin/env sh
# Panel - double-click in Finder (macOS). Keep the Terminal window open while you use it.
cd "$(dirname "$0")" || exit 1
exec ./panel.sh "$@"
