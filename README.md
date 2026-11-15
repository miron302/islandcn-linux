# islandcn-arch

A Dynamic Island-style status pill for Linux, built on the [islandcn](https://github.com/opencoredev/islandcn) engine (MIT). It floats at the top of your screen and shows live activities.

## Run it

| Way | Command |
| --- | --- |
| AppImage | `chmod +x islandcn-arch-1.0.0-x86_64.AppImage && ./islandcn-arch-1.0.0-x86_64.AppImage --appimage-extract-and-run` (no FUSE needed; or `sudo pacman -S fuse2` and drop the flag) |
| Unpacked folder | unzip `islandcn-arch-linux-unpacked.zip`, run `./islandcn-arch` (no FUSE) |
| From source | `./run.sh` |
| Arch package | `makepkg -si` (uses the system `electron`) |
| Home-dir install | `./install-local.sh` then `islandcn-arch` |

You need `playerctl` for music. Optional: `libpulse` (volume, mic), `wireplumber`, `dbus`, `hyprland` (hyprctl).

## Pick your desktop (and change it any time)

On first launch you are asked to choose: GNOME, KDE Plasma, Hyprland or Other/generic (XFCE, Cinnamon, i3, Sway via XWayland...). Your session is only shown as a hint, never applied for you. You can change it later from Settings, the right-click menu on the pill, the tray icon, or with `islandcn-arch desktop <gnome|kde|hyprland|x11>`. Turn on "Ask me every launch" if you hop between desktops. Switching is live, no restart.

All adapters run the window through X11/XWayland, because Wayland clients cannot set their own position or stay on top.

- **GNOME**: dock-type window, always on top.
- **KDE**: same, plus a small KWin script (loaded over D-Bus, removed on exit) for keep-above, no border, hidden from taskbar and switcher.
- **Hyprland**: window rules (float, pin, no focus, border, shadow, anim) and `hyprctl` placement. Both the 0.53+ and older rule syntax are tried. Add `exec-once = islandcn-arch` to hyprland.conf to autostart.
- **Generic**: dock window and Electron placement.

## Live activities

Music (any MPRIS player: cover, scrubber, prev/play/next), battery (charging pill, low warning), volume, brightness, notifications, microphone in use, timers, and script progress. Two at once split the pill. Each can be toggled in Settings.

Settings has a mini screen map: drag the pill on it and the real island follows (works on every desktop). It also has size (50-200%), screen, left/center/right anchor, X/Y offset, and "touch the top edge".

## Command line

```
islandcn-arch settings | choose-desktop | quit
islandcn-arch timer 25m Focus | timer-stop
islandcn-arch job backup 0.4 "Backing up"     # 0..1 or "spin"; 1 finishes it
islandcn-arch job-end backup
islandcn-arch notice "Build" "Finished"
```

## Notes

- Config: `~/.config/islandcn-arch/config.json`.
- Black or invisible background: try `ISLANDCN_DISABLE_GPU=1 islandcn-arch`. No compositor means no transparency.
- AppImage sandbox error: run with `--no-sandbox`.
- Layout: `electron/` (main process, desktop adapters, services), `src/island/` (activities), `src/settings/`, `src/lib/island` and `src/components/islandcn` (the islandcn engine and kit, unmodified).

## Credits

- [miron302](https://github.com/miron302) for creating the original project into a Linux app.
- The people who made [islandcn.dev](https://islandcn.dev) for the original design.
