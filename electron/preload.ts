import { contextBridge, ipcRenderer } from "electron";
import type { AppConfig, DesktopId, IslandApiBridge, IslandCommand, LayoutKind, SettingsApiBridge, SystemEvent } from "../src/shared/types";

const subscribe = <T>(channel: string, callback: (value: T) => void) => {
  const handler = (_event: Electron.IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

const island: IslandApiBridge = {
  onConfig: (callback) => subscribe<AppConfig>("config", callback),
  onEvent: (callback) => subscribe<SystemEvent>("event", callback),
  onCommand: (callback) => subscribe<IslandCommand>("command", callback),
  getConfig: () => ipcRenderer.invoke("config:get"),
  setLayout: (kind: LayoutKind) => ipcRenderer.send("layout", kind),
  musicControl: (action, valueMs) => ipcRenderer.send("music:control", action, valueMs),
  contextMenu: () => ipcRenderer.send("context-menu"),
};

const settings: SettingsApiBridge = {
  init: () => ipcRenderer.invoke("settings:init"),
  setConfig: (patch) => ipcRenderer.invoke("settings:set", patch),
  chooseDesktop: (id: DesktopId) => ipcRenderer.invoke("settings:choose-desktop", id),
  startTimer: (minutes) => ipcRenderer.send("settings:timer", minutes),
  quit: () => ipcRenderer.send("settings:quit"),
};

contextBridge.exposeInMainWorld("islandApi", island);
contextBridge.exposeInMainWorld("settingsApi", settings);
