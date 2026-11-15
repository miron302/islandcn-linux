# Maintainer: you
# Build and install with:  makepkg -si
# This PKGBUILD builds the project in this directory, no download needed.
pkgname=islandcn-arch
pkgver=1.0.0
pkgrel=1
pkgdesc="Dynamic Island-style live activities for GNOME, KDE Plasma and Hyprland (built on islandcn)"
arch=('any')
url="https://github.com/opencoredev/islandcn"
license=('MIT')
depends=('electron' 'playerctl')
makedepends=('npm' 'nodejs')
optdepends=(
  'libpulse: volume and microphone indicators (pactl)'
  'wireplumber: more accurate volume readout (wpctl)'
  'dbus: desktop notifications and the KDE helper script'
  'hyprland: hyprctl, needed for placement on Hyprland'
)
source=()
sha256sums=()
options=('!strip')

build() {
  cd "$startdir"
  # The system electron package runs the app, so skip the ~100 MB binary download.
  ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --no-audit --no-fund
  npm run build
}

package() {
  cd "$startdir"
  install -d "$pkgdir/usr/lib/$pkgname/packaging" "$pkgdir/usr/bin"
  cp -r dist dist-electron "$pkgdir/usr/lib/$pkgname/"
  install -m644 package.json "$pkgdir/usr/lib/$pkgname/package.json"
  install -m644 packaging/icon.png "$pkgdir/usr/lib/$pkgname/packaging/icon.png"
  install -m755 packaging/islandcn-arch.sh "$pkgdir/usr/bin/$pkgname"
  install -Dm644 packaging/islandcn-arch.desktop "$pkgdir/usr/share/applications/$pkgname.desktop"
  install -Dm644 packaging/icon.png "$pkgdir/usr/share/icons/hicolor/512x512/apps/$pkgname.png"
  install -Dm644 LICENSE "$pkgdir/usr/share/licenses/$pkgname/LICENSE"
}
