#!/usr/bin/env bash
# Installs to your home directory (no root, no pacman). Puts `islandcn-arch` in ~/.local/bin.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
PREFIX="${PREFIX:-$HOME/.local}"
APP="$PREFIX/share/islandcn-arch"

npm install --no-audit --no-fund
npm run build

rm -rf "$APP"
mkdir -p "$APP/packaging" "$PREFIX/bin" "$PREFIX/share/applications" "$PREFIX/share/icons/hicolor/512x512/apps"
cp -r dist dist-electron package.json "$APP/"
cp packaging/icon.png "$APP/packaging/icon.png"
# The electron binary from node_modules, so nothing else needs installing.
cp -r node_modules/electron/dist "$APP/electron"

cat > "$PREFIX/bin/islandcn-arch" <<LAUNCH
#!/bin/sh
export ISLANDCN_X11=1
exec "$APP/electron/electron" "$APP" --ozone-platform=x11 "\$@"
LAUNCH
chmod +x "$PREFIX/bin/islandcn-arch"

sed "s|^Exec=islandcn-arch|Exec=$PREFIX/bin/islandcn-arch|" packaging/islandcn-arch.desktop > "$PREFIX/share/applications/islandcn-arch.desktop"
cp packaging/icon.png "$PREFIX/share/icons/hicolor/512x512/apps/islandcn-arch.png"

echo "Installed. Start it with: islandcn-arch   (make sure $PREFIX/bin is on your PATH)"
