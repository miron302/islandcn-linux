#!/bin/sh
# Launcher installed to /usr/bin by the PKGBUILD. Passing the X11 flag here means the app does not
# have to restart itself on Wayland sessions.
export ISLANDCN_X11=1
exec /usr/bin/electron /usr/lib/islandcn-arch --ozone-platform=x11 "$@"
