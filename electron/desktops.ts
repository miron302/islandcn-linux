import { writeFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { screen, type BrowserWindow, type BrowserWindowConstructorOptions } from "electron";
import type { DesktopId, MonitorInfo } from "../src/shared/types";
import { run } from "./util";

/** The X11 window class every adapter and rule matches on. Set with --class before the app starts. */
export const WINDOW_CLASS = "islandcn-arch";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * One adapter per desktop. They differ in three things: how the overlay window is created,
 * where monitors come from, and what has to be told to the compositor so the pill floats above
 * everything, skips the taskbar and keeps the position we ask for.
 */
export interface DesktopAdapter {
  readonly id: DesktopId;
  windowOptions(): BrowserWindowConstructorOptions;
  listMonitors(): Promise<MonitorInfo[]>;
  /** Called before the window is created, so rules are in place when it first appears. */
  prepare(): Promise<void>;
  /** Called once after the window is shown. */
  attach(win: BrowserWindow): Promise<void>;
  /** Moves and sizes the window. */
  place(win: BrowserWindow, rect: Rect): Promise<void>;
  /** Called when the window goes away or the user picks another desktop. */
  detach(): Promise<void>;
}

const baseOptions: BrowserWindowConstructorOptions = {
  frame: false,
  transparent: true,
  backgroundColor: "#00000000",
  hasShadow: false,
  resizable: true,
  movable: false,
  minimizable: false,
  maximizable: false,
  fullscreenable: false,
  skipTaskbar: true,
  focusable: false,
  show: false,
  title: "islandcn",
  width: 140,
  height: 60,
};

const electronMonitors = (): MonitorInfo[] => {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((display, index) => ({
    id: String(display.id),
    name: `${display.label || `Display ${index + 1}`} (${display.bounds.width}x${display.bounds.height})${display.id === primary ? " - primary" : ""}`,
    primary: display.id === primary,
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
  }));
};

/** Electron's own placement: right for X11 sessions and for XWayland on GNOME and KDE. */
const placeWithElectron = async (win: BrowserWindow, rect: Rect) => {
  win.setBounds(rect, false);
};

/** A dock-type window sits in the compositor's panel layer, above normal windows, off the taskbar. */
const dockWindow = (): BrowserWindowConstructorOptions => ({ ...baseOptions, type: "dock" });

const gnome = (): DesktopAdapter => ({
  id: "gnome",
  windowOptions: dockWindow,
  listMonitors: async () => electronMonitors(),
  async prepare() {},
  async attach(win) {
    // Mutter keeps dock windows above regular ones; the level also helps over fullscreen on X11.
    win.setAlwaysOnTop(true, "screen-saver");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  },
  place: placeWithElectron,
  async detach() {},
});

/**
 * KDE: a tiny KWin script marks our window keep-above, borderless and off the taskbar, switcher
 * and pager, on all desktops. It is loaded over D-Bus and removed again on exit. The same script
 * works on Plasma 5 (clientAdded) and Plasma 6 (windowAdded).
 */
const KWIN_SCRIPT_NAME = "islandcn-arch";
const kwinScript = (): string => `
(function () {
  var wanted = ${JSON.stringify(WINDOW_CLASS)};
  function matches(w) {
    var c = String(w.resourceClass || "").toLowerCase();
    var n = String(w.resourceName || "").toLowerCase();
    return c.indexOf(wanted) >= 0 || n.indexOf(wanted) >= 0;
  }
  function tune(w) {
    if (!w || !matches(w)) return;
    w.keepAbove = true;
    w.noBorder = true;
    w.skipTaskbar = true;
    w.skipPager = true;
    w.skipSwitcher = true;
    w.onAllDesktops = true;
  }
  var added = workspace.windowAdded || workspace.clientAdded;
  if (added) added.connect(tune);
  var list = workspace.windowList ? workspace.windowList() : (workspace.clientList ? workspace.clientList() : []);
  for (var i = 0; i < list.length; i++) tune(list[i]);
})();
`;

const kde = (configDir: string): DesktopAdapter => {
  let loaded = false;
  const scriptPath = join(configDir, "kwin-islandcn.js");
  return {
    id: "kde",
    windowOptions: dockWindow,
    listMonitors: async () => electronMonitors(),
    async prepare() {
      try {
        await mkdir(configDir, { recursive: true });
        await writeFile(scriptPath, kwinScript());
        await run("dbus-send", ["--session", "--dest=org.kde.KWin", "--print-reply", "/Scripting", "org.kde.kwin.Scripting.unloadScript", `string:${KWIN_SCRIPT_NAME}`]);
        const out = await run("dbus-send", ["--session", "--dest=org.kde.KWin", "--print-reply", "/Scripting", "org.kde.kwin.Scripting.loadScript", `string:${scriptPath}`, `string:${KWIN_SCRIPT_NAME}`]);
        const id = out ? /int32 (\d+)/.exec(out)?.[1] : undefined;
        if (id) {
          // Plasma 6 exposes the script at /Scripting/Script<id>; Plasma 5 at /<id>.
          const ran = await run("dbus-send", ["--session", "--dest=org.kde.KWin", "--print-reply", `/Scripting/Script${id}`, "org.kde.kwin.Script.run"]);
          if (ran === null) await run("dbus-send", ["--session", "--dest=org.kde.KWin", "--print-reply", `/${id}`, "org.kde.kwin.Script.run"]);
          loaded = true;
        }
      } catch (error) {
        console.warn("[islandcn] could not load the KWin script:", error);
      }
    },
    async attach(win) {
      win.setAlwaysOnTop(true, "screen-saver");
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    },
    place: placeWithElectron,
    async detach() {
      if (!loaded) return;
      loaded = false;
      await run("dbus-send", ["--session", "--dest=org.kde.KWin", "--print-reply", "/Scripting", "org.kde.kwin.Scripting.unloadScript", `string:${KWIN_SCRIPT_NAME}`]);
      await unlink(scriptPath).catch(() => undefined);
    },
  };
};

/**
 * Hyprland: window rules float and pin the window and strip borders, shadows, animations and
 * focus; hyprctl dispatchers do the placement, in layout coordinates read from `hyprctl monitors`.
 * Hyprland changed its rule syntax in 0.53, so the new form is tried first, then the old one.
 */
const hyprRules = [
  { next: "float on", old: "float" },
  { next: "pin on", old: "pin" },
  { next: "no_focus on", old: "nofocus" },
  { next: "border_size 0", old: "noborder" },
  { next: "no_shadow on", old: "noshadow" },
  { next: "no_anim on", old: "noanim" },
  { next: "no_blur on", old: "noblur" },
  { next: "rounding 0", old: "rounding 0" },
] as const;

interface HyprMonitor {
  name: string;
  description?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  transform: number;
  id?: number;
  focused?: boolean;
}

const hyprland = (): DesktopAdapter => {
  const byClass = `class:(?i)^${WINDOW_CLASS}$`;
  let address: string | null = null;

  /** Looks the window up in `hyprctl clients`; an address is more reliable than a class match. */
  const findAddress = async (): Promise<string | null> => {
    const out = await run("hyprctl", ["clients", "-j"]);
    if (!out) return null;
    try {
      const list = JSON.parse(out) as { address: string; class?: string; initialClass?: string }[];
      const match = list.find((client) => [client.class, client.initialClass].some((name) => (name ?? "").toLowerCase() === WINDOW_CLASS));
      return match?.address ?? null;
    } catch {
      return null;
    }
  };
  const target = () => (address ? `address:${address}` : byClass);

  return {
    id: "hyprland",
    windowOptions: () => ({ ...baseOptions }),
    async listMonitors() {
      const out = await run("hyprctl", ["monitors", "-j"]);
      if (!out) return electronMonitors();
      try {
        const list = JSON.parse(out) as HyprMonitor[];
        return list.map((monitor) => {
          const turned = monitor.transform % 2 === 1;
          const width = (turned ? monitor.height : monitor.width) / (monitor.scale || 1);
          const height = (turned ? monitor.width : monitor.height) / (monitor.scale || 1);
          return { id: monitor.name, primary: monitor.focused === true || monitor.id === 0, name: `${monitor.name}${monitor.description ? ` - ${monitor.description}` : ""}`, x: monitor.x, y: monitor.y, width: Math.round(width), height: Math.round(height) };
        });
      } catch {
        return electronMonitors();
      }
    },
    async prepare() {
      for (const rule of hyprRules) {
        const modern = await run("hyprctl", ["keyword", "windowrule", `${rule.next}, match:class (?i)^${WINDOW_CLASS}$`]);
        if (modern?.trim() === "ok") continue;
        await run("hyprctl", ["keyword", "windowrulev2", `${rule.old}, ${byClass}`]);
      }
    },
    async attach() {
      // The window takes a moment to show up in Hyprland's list: wait for it, up to about 3 s.
      for (let i = 0; i < 30 && !address; i++) {
        address = await findAddress();
        if (!address) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await run("hyprctl", ["--batch", `dispatch setfloating ${target()}; dispatch pin ${target()}`]);
    },
    async place(win, rect) {
      win.setSize(rect.width, rect.height, false);
      const command = () => `dispatch resizewindowpixel exact ${rect.width} ${rect.height},${target()}; dispatch movewindowpixel exact ${rect.x} ${rect.y},${target()}`;
      let out = await run("hyprctl", ["--batch", command()]);
      if (out === null || /not found|invalid|error/i.test(out)) {
        address = await findAddress();
        out = await run("hyprctl", ["--batch", command()]);
        if (out !== null && /not found|invalid|error/i.test(out)) console.warn("[islandcn] hyprctl could not place the window:", out.trim());
      }
    },
    async detach() {
      address = null;
    },
  };
};

/** Anything else: XFCE, Cinnamon, MATE, i3, Sway through XWayland. A dock window plus Electron placement. */
const generic = (): DesktopAdapter => ({
  id: "x11",
  windowOptions: dockWindow,
  listMonitors: async () => electronMonitors(),
  async prepare() {},
  async attach(win) {
    win.setAlwaysOnTop(true, "screen-saver");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  },
  place: placeWithElectron,
  async detach() {},
});

export const createAdapter = (id: DesktopId, configDir: string): DesktopAdapter => {
  switch (id) {
    case "gnome":
      return gnome();
    case "kde":
      return kde(configDir);
    case "hyprland":
      return hyprland();
    default:
      return generic();
  }
};

/** A hint for the chooser, never applied without the user's say-so. */
export const detectDesktop = (): DesktopId | null => {
  const text = `${process.env.XDG_CURRENT_DESKTOP ?? ""}:${process.env.DESKTOP_SESSION ?? ""}`.toLowerCase();
  if (process.env.HYPRLAND_INSTANCE_SIGNATURE || text.includes("hyprland")) return "hyprland";
  if (text.includes("kde") || text.includes("plasma")) return "kde";
  if (text.includes("gnome") || text.includes("ubuntu")) return "gnome";
  if (/xfce|cinnamon|mate|lxqt|lxde|budgie|deepin|i3|sway|openbox|bspwm|awesome|dwm/.test(text)) return "x11";
  return null;
};
