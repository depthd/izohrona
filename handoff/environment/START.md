# Izohrona development startup

Use the existing checkout at /workspace/izohrona. Each cloud task is already isolated; do not create a Git worktree unless the user explicitly requests one. Read CLAUDE.md and preserve existing user changes. Do not change tracked application files, tests, manifests, lockfiles, or checked-in builds during environment setup.

## Retained setup and activation
The prepared snapshot contains Node 24, Python 3 with Pillow, frozen npm dependencies, matching Playwright Chromium, and /workspace/.cache/izohrona/three-r128.min.js. Processes do not survive restoration.
Run commands from /workspace/izohrona with:
```bash
cd /workspace/izohrona
export PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright
export npm_config_cache=/workspace/.cache/npm
export MPLCONFIGDIR=/workspace/.cache/matplotlib
```
If dependencies need refreshing, run the saved install_script. It uses npm ci, keeps TLS and checksums enabled, and writes the built app outside the checkout. No app secrets, backend, database, or CS2 installation is needed for browser development.

## Build and serve
```bash
mkdir -p /workspace/.cache/izohrona/web
node tools/sobrat.js /workspace/.cache/izohrona/web/izohrona.html
python3 tools/syncheck.py /workspace/.cache/izohrona/web/izohrona.html
node --check /tmp/build.js
```
The build tool's default output is a tracked HTML file; always pass the external output path during setup.
Start a persistent execution session for the following command if the service is not already running:
```bash
python3 -m http.server 8000 --bind 127.0.0.1 --directory /workspace/.cache/izohrona/web
```
Check readiness in another session:
```bash
curl --fail --silent --show-error http://127.0.0.1:8000/izohrona.html -o /tmp/izohrona-served.html
cmp /tmp/izohrona-served.html /workspace/.cache/izohrona/web/izohrona.html
```
Then load the page using headless Playwright, wait for typeof cur!=="undefined" && cur && cur.g, and check for page errors. The app also supports direct file navigation, as used by the existing repository tests. Do not create user-facing loopback preview links in onboarding.

## Browser permissions and HTTPS
In the validated instance, the normal write-restricted sandbox prevents Chromium from opening /home/agent/.pki/nssdb, causing ERR_CERT_AUTHORITY_INVALID for Google Fonts and Three.js. The environment's proxy CA is already trusted there. Use the command tool's approved require_escalated execution for networked Playwright checks if this occurs; this was tested successfully. Do not disable certificate checks or use ignoreHTTPSErrors. A certutil import is unnecessary. Keep inherited proxy and CA variables. Live CDN loading and Google Fonts returned HTTP 200 with access to the existing trust database.
The walk test can alternatively use the verified local Three.js copy through its supported second argument; this is useful for offline checks.

## Validation
Choose checks appropriate to the task, always passing the current built HTML explicitly:
```bash
node tools/smoke.js /workspace/.cache/izohrona/web/izohrona.html
node tools/proba_nomer.js /workspace/.cache/izohrona/web/izohrona.html
node tools/proba_vmap.js /workspace/.cache/izohrona/web/izohrona.html /workspace/.cache/izohrona/onboarding.vmap
python3 tools/vmapcheck.py /workspace/.cache/izohrona/onboarding.vmap
node tools/proba_progulka.js /workspace/.cache/izohrona/web/izohrona.html /workspace/.cache/izohrona/three-r128.min.js /workspace/.cache/izohrona/walk
bash tools/priyomka.sh /workspace/.cache/izohrona/web/izohrona.html 3
```
The existing tests load local files; the walk test reports physics rather than asserting all outcomes. Check its JSON for landing, stopping at walls, jump height, map teleport locations, and page errors, not merely its exit code. .vmap export should download the map plus both radar files; vmapcheck must report zero errors. Gate artifacts go to /tmp/gate; verify they belong to the current run. The gate's internal syntax check defaults to an older build, so keep the explicit current-build syntax check above.

Baseline on the selected revision: byte-for-byte build comparison, current-build syntax, texture reference, UI smoke, map-number replay, .vmap integrity, and first-person checks passed. The three-map acceptance run completed but failed its pre-existing narrow-route threshold (documented in CLAUDE.md); generator/printed detour checks, spawns, geometry, and overlap checks passed in that run. Its initial UI smoke failure was the diagnosed trust-database sandbox issue; a separate rerun with approved access passed. Do not call the full gate green or modify code/thresholds to make environment onboarding pass. Hammer/CS2 behavior is outside this Linux browser validation.

Before finishing any setup refresh, inspect git status and ensure no unintended tracked or untracked repository changes remain.
