#!/usr/bin/env bash
# The quickest way to try it from source: installs dependencies once, builds, and starts.
#   ./run.sh              start
#   ./run.sh settings     any command line argument is passed through
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is missing. On Arch: sudo pacman -S nodejs npm" >&2
  exit 1
fi
if ! command -v playerctl >/dev/null 2>&1; then
  echo "Note: playerctl is not installed, so music will not show. On Arch: sudo pacman -S playerctl" >&2
fi
[ -d node_modules ] || npm install --no-audit --no-fund
[ -f dist/index.html ] && [ -f dist-electron/main.cjs ] || npm run build

export ISLANDCN_X11=1
exec ./node_modules/electron/dist/electron . --ozone-platform=x11 "$@"
