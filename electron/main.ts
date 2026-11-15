import { spawn } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray, type MenuItemConstructorOptions } from "electron";
import {
  DESKTOPS,
  type AppConfig,
  type DesktopId,
  type IslandCommand,
  type LayoutKind,
  type MonitorInfo,
  type SettingsInit,
  type SystemEvent,
} from "../src/shared/types";
import { HELP, parseArgs, type CliAction } from "./cli";
import { configDir, loadConfig, mergeConfig, saveConfig } from "./config";
import { createAdapter, detectDesktop, WINDOW_CLASS, type DesktopAdapter, type Rect } from "./desktops";
import { startBattery } from "./services/battery";
import { startMusic, type MusicService } from "./services/music";
import { startBrightness, startMicrophone, startNotifications, startVolume } from "./services/system";

// The overlay needs a window we can position and keep on top, which Wayland denies to clients.
// Running through XWayland (or plain X11) gives us that on GNOME, KDE and Hyprland alike.
app.setName("islandcn-arch");
if (!process.env.ISLANDCN_NATIVE_WAYLAND) app.commandLine.appendSwitch("ozone-platform", "x11");
app.commandLine.appendSwitch("class", WINDOW_CLASS);
app.commandLine.appendSwitch("name", WINDOW_CLASS);
app.commandLine.appendSwitch("enable-transparent-visuals");
if (process.env.ISLANDCN_DISABLE_GPU) app.disableHardwareAcceleration();

/** Window size per presentation, in the page's own pixels (multiplied by the scale setting). */
const SIZES = {
  idle: { width: 140, height: 62 },
  compact: { width: 290, height: 62 },
  minimal: { width: 370, height: 62 },
  expanded: { width: 424, height: 222 },
} as const satisfies Record<LayoutKind, { width: number; height: number }>;
/** How far the resting pill sits below the top of the page, so "flush" can pull it up by that much. */
const PILL_TOP = 13.91;
/** Wait this long before shrinking so the collapse animation can finish inside the window. */
const SHRINK_DELAY_MS = 750;

let config: AppConfig = loadConfig();
let adapter: DesktopAdapter | null = null;
let island: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let monitors: MonitorInfo[] = [];
let layout: LayoutKind = "idle";
let shrinkTimer: NodeJS.Timeout | undefined;
let rendererReady = false;
let chooserPending: ((id: DesktopId | null) => void) | null = null;
let quitting = false;
const pending: IslandCommand[] = [];
const replay = new Map<string, SystemEvent>();

type Stoppable = { stop(): void };
const running = new Map<string, Stoppable>();
let music: MusicService | null = null;

const rendererFile = (name: string) => join(__dirname, "..", "dist", name);
const preloadFile = () => join(__dirname, "preload.cjs");

// ---------------------------------------------------------------- messaging

const sendToIsland = (channel: string, payload: unknown) => {
  if (island && !island.isDestroyed() && rendererReady) island.webContents.send(channel, payload);
};

const emitEvent = (event: SystemEvent) => {
  if (event.type === "music" || event.type === "battery" || event.type === "microphone") replay.set(event.type, event);
  sendToIsland("event", event);
};

const sendCommand = (command: IslandCommand) => {
  if (island && rendererReady) island.webContents.send("command", command);
  else pending.push(command);
};

const broadcastConfig = () => {
  sendToIsland("config", config);
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send("config", config);
};

// ---------------------------------------------------------------- geometry

const refreshMonitors = async () => {
  monitors = adapter ? await adapter.listMonitors() : [];
};

const currentMonitor = (): MonitorInfo => {
  const fallback = screen.getPrimaryDisplay().bounds;
  return (
    monitors.find((monitor) => monitor.id === config.monitor) ??
    monitors.find((monitor) => monitor.primary) ??
    monitors[0] ?? { id: "", name: "", primary: true, x: fallback.x, y: fallback.y, width: fallback.width, height: fallback.height }
  );
};

/** The pill's centre line is the anchor, so it stays put while the window grows and shrinks around it. */
export const boundsFor = (cfg: AppConfig, monitor: MonitorInfo, kind: LayoutKind): Rect => {
  const size = SIZES[kind];
  const width = Math.round(size.width * cfg.scale);
  const height = Math.round(size.height * cfg.scale);
  const half = (SIZES.expanded.width / 2) * cfg.scale;
  const centre =
    cfg.anchor === "left" ? monitor.x + half + cfg.offsetX : cfg.anchor === "right" ? monitor.x + monitor.width - half + cfg.offsetX : monitor.x + monitor.width / 2 + cfg.offsetX;
  const top = monitor.y + cfg.offsetY - (cfg.flushTop ? PILL_TOP * cfg.scale : 0);
  return { x: Math.round(centre - width / 2), y: Math.round(top), width, height };
};

const place = async (kind: LayoutKind = layout) => {
  if (!island || island.isDestroyed() || !adapter) return;
  const rect = boundsFor(config, currentMonitor(), kind);
  await adapter.place(island, rect);
  // Some compositors take the first move and ignore it; check where the window really is and try again.
  if (adapter.id === "hyprland") return;
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (!island || island.isDestroyed()) return;
    const actual = island.getBounds();
    if (Math.abs(actual.x - rect.x) <= 2 && Math.abs(actual.y - rect.y) <= 2) return;
    island.setPosition(rect.x, rect.y, false);
    await adapter.place(island, rect);
  }
};

const area = (kind: LayoutKind) => SIZES[kind].width * SIZES[kind].height;

const setLayout = (kind: LayoutKind) => {
  if (shrinkTimer) clearTimeout(shrinkTimer);
  if (kind === layout) return;
  const grows = SIZES[kind].width > SIZES[layout].width || SIZES[kind].height > SIZES[layout].height || area(kind) > area(layout);
  const apply = () => {
    layout = kind;
    void place(kind);
  };
  if (grows) apply();
  else shrinkTimer = setTimeout(apply, SHRINK_DELAY_MS);
};

// ---------------------------------------------------------------- windows

const createIsland = async () => {
  if (!adapter) return;
  rendererReady = false;
  await adapter.prepare();
  await refreshMonitors();
  // Giving the position at creation sets the window's position hint, which Mutter and KWin respect
  // for the first placement; moving it only afterwards can leave it centred.
  const first = boundsFor(config, currentMonitor(), "idle");
  const win = new BrowserWindow({
    ...adapter.windowOptions(),
    ...first,
    webPreferences: { preload: preloadFile(), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  island = win;
  win.setMenu(null);
  win.webContents.on("did-finish-load", () => {
    win.webContents.setZoomFactor(config.scale);
    rendererReady = true;
    for (const event of replay.values()) win.webContents.send("event", event);
    win.webContents.send("config", config);
    while (pending.length > 0) win.webContents.send("command", pending.shift());
  });
  win.on("closed", () => {
    if (island === win) island = null;
    rendererReady = false;
  });
  win.webContents.on("context-menu", () => buildMenu().popup({ window: win }));
  await win.loadFile(rendererFile("index.html"));
  win.webContents.setZoomFactor(config.scale);
  layout = "idle";
  await place("idle");
  win.showInactive();
  await adapter.attach(win);
  // Some compositors only honour a position once the window is mapped.
  await place("idle");
  for (const delay of [250, 800, 2000, 4000]) setTimeout(() => void place(), delay);
};

const destroyIsland = async () => {
  if (shrinkTimer) clearTimeout(shrinkTimer);
  const win = island;
  island = null;
  rendererReady = false;
  win?.destroy();
  await adapter?.detach();
};

const startAdapter = async (id: DesktopId) => {
  await destroyIsland();
  adapter = createAdapter(id, configDir());
  await createIsland();
};

const openSettings = (chooser = false) => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  const win = new BrowserWindow({
    width: 780,
    height: 760,
    minWidth: 560,
    minHeight: 520,
    title: "islandcn settings",
    backgroundColor: "#0e0e10",
    autoHideMenuBar: true,
    webPreferences: { preload: preloadFile(), contextIsolation: true, nodeIntegration: false },
  });
  settingsWindow = win;
  win.setMenu(null);
  win.on("closed", () => {
    settingsWindow = null;
    if (chooserPending) {
      // Closing the chooser without picking keeps the saved desktop, or quits on a first run.
      const resolve = chooserPending;
      chooserPending = null;
      resolve(config.desktop);
    }
  });
  void win.loadFile(rendererFile("settings.html"));
  void chooser;
};

// ---------------------------------------------------------------- services

const toggle = (name: string, on: boolean, start: () => Stoppable) => {
  const existing = running.get(name);
  if (on && !existing) running.set(name, start());
  if (!on && existing) {
    existing.stop();
    running.delete(name);
  }
};

const syncServices = () => {
  const on = config.activities;
  toggle("music", on.music, () => {
    music = startMusic((state) => emitEvent({ type: "music", state }), config.music.player);
    return music;
  });
  if (!on.music) {
    music = null;
    emitEvent({ type: "music", state: null });
  }
  toggle("battery", on.battery, () => startBattery((state) => emitEvent({ type: "battery", state })));
  toggle("volume", on.volume, () => startVolume(emitEvent));
  toggle("brightness", on.brightness, () => startBrightness(emitEvent));
  toggle("notifications", on.notifications, () => startNotifications(emitEvent));
  toggle("microphone", on.microphone, () => startMicrophone(emitEvent));
};

const stopServices = () => {
  for (const service of running.values()) service.stop();
  running.clear();
  music = null;
};

// ---------------------------------------------------------------- autostart

const autostartFile = () => join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "autostart", "islandcn-arch.desktop");

const syncAutostart = () => {
  const path = autostartFile();
  if (!config.autostart) {
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch {
      /* nothing to remove */
    }
    return;
  }
  const exec = process.env.APPIMAGE ?? process.execPath;
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `[Desktop Entry]\nType=Application\nName=islandcn-arch\nComment=Dynamic Island for Linux\nExec="${exec}"${process.env.APPIMAGE ? " --appimage-extract-and-run" : ""}\nX-GNOME-Autostart-enabled=true\nTerminal=false\n`);
};

// ---------------------------------------------------------------- config

const applyConfig = async (patch: Partial<AppConfig>) => {
  const before = config;
  config = mergeConfig(config, patch);
  saveConfig(config);
  syncAutostart();
  syncServices();
  if (before.music.player !== config.music.player) music?.setPreferredPlayer(config.music.player);
  if (config.desktop && config.desktop !== before.desktop && adapter) {
    await startAdapter(config.desktop);
  } else if (island) {
    island.webContents.setZoomFactor(config.scale);
    if (before.monitor !== config.monitor) await refreshMonitors();
    await place();
  }
  rebuildTray();
  broadcastConfig();
  return config;
};

const chooseDesktop = async (id: DesktopId) => {
  config = mergeConfig(config, { desktop: id });
  saveConfig(config);
  if (chooserPending) {
    const resolve = chooserPending;
    chooserPending = null;
    resolve(id);
    return;
  }
  await startAdapter(id);
  rebuildTray();
  broadcastConfig();
};

// ---------------------------------------------------------------- menus

const buildMenu = (): Menu => {
  const desktops: MenuItemConstructorOptions[] = DESKTOPS.map((entry) => ({
    label: entry.name,
    type: "radio",
    checked: config.desktop === entry.id,
    click: () => void chooseDesktop(entry.id),
  }));
  const timers: MenuItemConstructorOptions[] = [5, 10, 15, 25, 45].map((minutes) => ({
    label: `${minutes} minutes`,
    click: () => sendCommand({ type: "timer", ms: minutes * 60_000, label: "Timer" }),
  }));
  return Menu.buildFromTemplate([
    { label: "Settings…", click: () => openSettings() },
    { label: "Desktop environment", submenu: desktops },
    { label: "Start a timer", submenu: timers },
    { label: "Stop timer", click: () => sendCommand({ type: "timer-stop" }) },
    { type: "separator" },
    { label: "Quit islandcn", click: () => app.quit() },
  ]);
};

const rebuildTray = () => {
  if (!tray) return;
  tray.setContextMenu(buildMenu());
};

const createTray = () => {
  try {
    const icon = nativeImage.createFromPath(join(__dirname, "..", "packaging", "icon.png")).resize({ width: 22, height: 22 });
    tray = new Tray(icon);
    tray.setToolTip("islandcn");
    rebuildTray();
    tray.on("click", () => openSettings());
  } catch (error) {
    // GNOME without an AppIndicator extension and some bars have no tray. The right-click menu on the pill still works.
    console.warn("[islandcn] no system tray available:", error);
  }
};

// ---------------------------------------------------------------- CLI

const handleAction = async (action: CliAction) => {
  switch (action.kind) {
    case "command":
      sendCommand(action.command);
      break;
    case "settings":
      openSettings();
      break;
    case "choose-desktop":
      openSettings(true);
      break;
    case "set-desktop":
      await chooseDesktop(action.id);
      break;
    case "quit":
      app.quit();
      break;
    case "help":
      console.log(HELP);
      break;
  }
};

// ---------------------------------------------------------------- IPC

const settingsInit = async (): Promise<SettingsInit> => {
  const detected = detectDesktop();
  const list = adapter ? monitors : await createAdapter(config.desktop ?? detected ?? "x11", configDir()).listMonitors();
  return { config, monitors: list, detectedDesktop: detected, session: process.env.XDG_SESSION_TYPE ?? "unknown", needsChooser: chooserPending !== null };
};

ipcMain.handle("config:get", () => config);
ipcMain.handle("settings:init", settingsInit);
ipcMain.handle("settings:set", (_event, patch: Partial<AppConfig>) => applyConfig(patch));
ipcMain.handle("settings:choose-desktop", (_event, id: DesktopId) => chooseDesktop(id));
ipcMain.on("layout", (_event, kind: LayoutKind) => {
  if (kind in SIZES) setLayout(kind);
});
ipcMain.on("music:control", (_event, action: "play-pause" | "next" | "previous" | "seek", valueMs?: number) => music?.control(action, valueMs));
ipcMain.on("context-menu", () => {
  if (island) buildMenu().popup({ window: island });
});
ipcMain.on("settings:timer", (_event, minutes: number) => sendCommand({ type: "timer", ms: Math.max(1, minutes) * 60_000, label: "Timer" }));
ipcMain.on("settings:quit", () => app.quit());

// ---------------------------------------------------------------- lifecycle

/**
 * Electron decides between Wayland and X11 before our code runs, so the switch above can come too
 * late. On a Wayland session we therefore start ourselves once more with the flag on the real
 * command line (the marker variable stops it from looping). The launchers that ship with the
 * project already pass it, so they skip this step.
 */
const needsX11Relaunch = () =>
  process.platform === "linux" &&
  !process.env.ISLANDCN_X11 &&
  !process.env.ISLANDCN_NATIVE_WAYLAND &&
  !process.argv.some((arg) => arg.startsWith("--ozone-platform=")) &&
  (process.env.XDG_SESSION_TYPE === "wayland" || Boolean(process.env.WAYLAND_DISPLAY));

if (!app.requestSingleInstanceLock()) {
  // Another copy is running: it receives our arguments through `second-instance`.
  app.quit();
} else if (needsX11Relaunch()) {
  app.releaseSingleInstanceLock();
  // An AppImage's own binary lives in a temporary mount that disappears when we exit, so start the AppImage file itself.
  const self = process.env.APPIMAGE ? [process.env.APPIMAGE, ["--appimage-extract-and-run"]] : [process.execPath, []];
  const child = spawn(self[0] as string, [...(self[1] as string[]), ...process.argv.slice(1), "--ozone-platform=x11"], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, ISLANDCN_X11: "1" },
  });
  child.unref();
  app.exit(0);
} else {
  app.on("second-instance", (_event, argv) => {
    const actions = parseArgs(argv.slice(1));
    if (actions.length === 0) {
      openSettings();
      return;
    }
    for (const action of actions) void handleAction(action);
  });

  app.on("window-all-closed", () => {
    /* The island lives on without the settings window. */
  });
  app.on("before-quit", () => {
    quitting = true;
    stopServices();
    void adapter?.detach();
  });

  void app.whenReady().then(async () => {
    const actions = parseArgs(process.argv.slice(1));
    if (actions.some((action) => action.kind === "help")) {
      console.log(HELP);
      app.quit();
      return;
    }
    const direct = actions.find((action) => action.kind === "set-desktop");
    if (direct && direct.kind === "set-desktop") config = mergeConfig(config, { desktop: direct.id });

    // The user always chooses their desktop: on first run, and on every run if they asked to be asked.
    if (config.desktop === null || config.askEveryLaunch) {
      const choice = await new Promise<DesktopId | null>((resolve) => {
        chooserPending = resolve;
        openSettings(true);
      });
      if (choice === null) {
        app.quit();
        return;
      }
      config = mergeConfig(config, { desktop: choice });
      saveConfig(config);
      settingsWindow?.close();
    }

    screen.on("display-added", () => void refreshMonitors().then(() => place()));
    screen.on("display-removed", () => void refreshMonitors().then(() => place()));
    screen.on("display-metrics-changed", () => void refreshMonitors().then(() => place()));

    for (const action of actions) if (action.kind === "command") pending.push(action.command);
    adapter = createAdapter(config.desktop as DesktopId, configDir());
    await createIsland();
    createTray();
    syncServices();
    syncAutostart();
    if (actions.some((action) => action.kind === "settings")) openSettings();
    void quitting;
  });
}
