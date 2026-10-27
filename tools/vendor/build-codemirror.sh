#!/bin/sh
# Rebuilds app/vendor/codemirror.js (the editor engine) from npm. Only needed to update CodeMirror;
# the app itself has no build step. Requires Node.js.
set -e
cd "$(dirname "$0")"
TMP="$(mktemp -d)"
cp codemirror-entry.js "$TMP/entry.js"
cd "$TMP"
npm init -y >/dev/null
npm install --silent @codemirror/state @codemirror/view @codemirror/commands @codemirror/language \
  @codemirror/lang-markdown @codemirror/autocomplete @codemirror/search @lezer/markdown @lezer/highlight esbuild
VERSIONS="$(npm ls --depth=0 2>/dev/null | grep -E '@(codemirror|lezer)/' | sed 's/^[^@]*//' | tr '\n' ' ')"
npx esbuild entry.js --bundle --format=esm --minify --legal-comments=none --outfile=out.js
OUT="$OLDPWD/../../app/vendor/codemirror.js"
{ echo "/* CodeMirror 6 (MIT, https://codemirror.net) — $VERSIONS*/"; cat out.js; } > "$OUT"
rm -rf "$TMP"
echo "wrote $OUT"
