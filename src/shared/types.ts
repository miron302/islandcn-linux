/** Types shared by the Electron main process, the preload script and both renderer pages. */

export type DesktopId = "gnome" | "kde" | "hyprland" | "x11";

export const DESKTOPS = [
  { id: "gnome", name: "GNOME", note: "Mutter, X11 or Wayland (runs through XWayland)" },
  { id: "kde", name: "KDE Plasma", note: "KWin, X11 or Wayland. A small KWin script keeps it on top" },
  { id: "hyprland", name: "Hyprland", note: "Window rules and placement through hyprctl" },
  { id: "x11", name: "Other / generic", note: "XFCE, Cinnamon, MATE, i3, Sway (XWayland) and friends" },
] as const satisfies readonly { id: DesktopId; name: string; note: string }[];

export type Anchor = "left" | "center" | "right";

export interface ActivityToggles {
  music: boolean;
  battery: boolean;
  volume: boolean;
  brightness: boolean;
  notifications: boolean;
  microphone: boolean;
  timer: boolean;
  jobs: boolean;
}

export interface AppConfig {
  /** The desktop the user picked. null until they choose. */
  desktop: DesktopId | null;
  /** Show the chooser on every launch (for people who switch desktops a lot). */
  askEveryLaunch: boolean;
  /** Monitor id from `listMonitors`; "" means the primary one. */
  monitor: string;
  anchor: Anchor;
  /** Pixels (before scale) the island moves right (+) or left (-) from its anchor. */
  offsetX: number;
  /** Pixels (before scale) the island moves down (+) or up (-) from the top edge. */
  offsetY: number;
  /** Size multiplier, 0.5 to 2. */
  scale: number;
  /** Pull the pill up to touch the top edge, like a notch. */
  flushTop: boolean;
  activities: ActivityToggles;
  music: { player: string; pausedLingerSec: number };
  battery: { lowPercent: number };
  autostart: boolean;
}

export const defaultConfig: AppConfig = {
  desktop: null,
  askEveryLaunch: false,
  monitor: "",
  anchor: "center",
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  flushTop: false,
  activities: { music: true, battery: true, volume: true, brightness: true, notifications: true, microphone: true, timer: true, jobs: true },
  music: { player: "", pausedLingerSec: 30 },
  battery: { lowPercent: 15 },
  autostart: false,
};

export interface MonitorInfo {
  id: string;
  name: string;
  primary: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LayoutKind = "idle" | "compact" | "minimal" | "expanded";

export interface MusicState {
  player: string;
  status: "Playing" | "Paused" | "Stopped";
  title: string;
  artist: string;
  album: string;
  artUrl: string;
  /** ms, 0 when unknown */
  length: number;
  /** ms */
  position: number;
}

export interface BatteryState {
  present: boolean;
  /** 0 to 1 */
  level: number;
  charging: boolean;
  full: boolean;
  /** ms until full or empty, when the kernel reports it */
  timeToFull?: number;
}

export interface NotificationEvent {
  app: string;
  summary: string;
  body: string;
}

/** What the main process pushes to the island page. */
export type SystemEvent =
  | { type: "music"; state: MusicState | null }
  | { type: "battery"; state: BatteryState }
  | { type: "volume"; level: number; muted: boolean }
  | { type: "brightness"; level: number }
  | { type: "notification"; event: NotificationEvent }
  | { type: "microphone"; apps: string[] };

/** Commands from the command line or the settings window. */
export type IslandCommand =
  | { type: "timer"; ms: number; label: string }
  | { type: "timer-stop" }
  | { type: "job"; id: string; label: string; value: number | null }
  | { type: "job-end"; id: string }
  | { type: "notice"; title: string; body: string };

export interface SettingsInit {
  config: AppConfig;
  monitors: MonitorInfo[];
  detectedDesktop: DesktopId | null;
  session: string;
  needsChooser: boolean;
}

export interface IslandApiBridge {
  onConfig(callback: (config: AppConfig) => void): () => void;
  onEvent(callback: (event: SystemEvent) => void): () => void;
  onCommand(callback: (command: IslandCommand) => void): () => void;
  getConfig(): Promise<AppConfig>;
  setLayout(kind: LayoutKind): void;
  musicControl(action: "play-pause" | "next" | "previous" | "seek", valueMs?: number): void;
  contextMenu(): void;
}

export interface SettingsApiBridge {
  init(): Promise<SettingsInit>;
  setConfig(patch: Partial<AppConfig>): Promise<AppConfig>;
  chooseDesktop(id: DesktopId): Promise<void>;
  startTimer(minutes: number): void;
  quit(): void;
}
