#!/usr/bin/env bash
set -euo pipefail
cd /workspace/izohrona

# Use writable, retained caches; keep the repository and its lockfile unchanged.
export npm_config_cache=/workspace/.cache/npm
export PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright
export MPLCONFIGDIR=/workspace/.cache/matplotlib
mkdir -p "$npm_config_cache" "$MPLCONFIGDIR" /workspace/.cache/izohrona/web

# Node >=20 and Python 3 with Pillow are supplied by the environment image.
node -e 'if (Number(process.versions.node.split(".")[0]) < 20) process.exit(1)'
python3 -c 'from PIL import Image, ImageDraw, ImageFont'
npm ci --no-audit --no-fund
npx --no-install playwright install chromium

# The existing walk test supports a local copy of the app's pinned CDN library.
three_file=/workspace/.cache/izohrona/three-r128.min.js
three_hash=9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2
if ! printf '%s  %s\n' "$three_hash" "$three_file" | sha256sum --check --status; then
  curl --fail --silent --show-error --location --retry 2 --max-time 90 \
    https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js \
    -o "${three_file}.download"
  printf '%s  %s\n' "$three_hash" "${three_file}.download" | sha256sum --check
  mv "${three_file}.download" "$three_file"
fi

# Pass an output path: the default build command overwrites a tracked HTML file.
node tools/sobrat.js /workspace/.cache/izohrona/web/izohrona.html
python3 tools/syncheck.py /workspace/.cache/izohrona/web/izohrona.html
node --check /tmp/build.js
