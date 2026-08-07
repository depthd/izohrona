#!/bin/sh
# Гейт одной командой. Всё остальное — в tools/priyomka.py и CLAUDE.md.
exec python3 "$(dirname "$0")/priyomka.py" "$@"
