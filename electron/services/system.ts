import { readdir } from "node:fs/promises";
import type { NotificationEvent, SystemEvent } from "../../src/shared/types";
import { follow, readNumber, run } from "../util";

type Emit = (event: SystemEvent) => void;

const readVolume = async (): Promise<{ level: number; muted: boolean } | null> => {
  const wp = await run("wpctl", ["get-volume", "@DEFAULT_AUDIO_SINK@"]);
  if (wp) {
    const match = /Volume:\s*([\d.]+)/.exec(wp);
    if (match) return { level: Number(match[1]), muted: wp.includes("[MUTED]") };
  }
  const vol = await run("pactl", ["get-sink-volume", "@DEFAULT_SINK@"]);
  const mute = await run("pactl", ["get-sink-mute", "@DEFAULT_SINK@"]);
  const percent = vol ? /(\d+)%/.exec(vol) : null;
  if (!percent) return null;
  return { level: Number(percent[1]) / 100, muted: mute?.includes("yes") ?? false };
};

/** Volume: pactl subscribe wakes us on sink changes (works on PipeWire's pulse layer too). */
export const startVolume = (emit: Emit) => {
  let last = "";
  let timer: NodeJS.Timeout | undefined;
  const check = async (silent: boolean) => {
    const volume = await readVolume();
    if (!volume) return;
    const key = `${Math.round(volume.level * 100)}|${volume.muted}`;
    if (key === last) return;
    last = key;
    if (!silent) emit({ type: "volume", ...volume });
  };
  void check(true);
  const follower = follow("pactl", ["subscribe"], (line) => {
    if (!/'change' on (sink|server) /.test(line)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void check(false), 50);
  });
  return { stop: () => (follower.stop(), timer && clearTimeout(timer)) };
};

/** Brightness: sysfs has no change events, so read the backlight value a few times a second. */
export const startBrightness = (emit: Emit) => {
  let device: string | null = null;
  let last = -1;
  let first = true;
  const find = async () => {
    try {
      const names = await readdir("/sys/class/backlight");
      device = names[0] ? `/sys/class/backlight/${names[0]}` : null;
    } catch {
      device = null;
    }
  };
  const tick = async () => {
    if (!device) {
      await find();
      if (!device) return;
    }
    const value = await readNumber(`${device}/brightness`);
    const max = await readNumber(`${device}/max_brightness`);
    if (value === null || !max) return;
    const level = value / max;
    if (Math.abs(level - last) < 0.004) return;
    last = level;
    if (first) first = false;
    else emit({ type: "brightness", level });
  };
  void tick();
  const interval = setInterval(() => void tick(), 350);
  return { stop: () => clearInterval(interval) };
};

const MIC_IGNORE = /pavucontrol|volume control|peak detect|plasma|kmix|gnome-shell|speech|pipewire|wireplumber|cava|easyeffects|noise/i;

/** Microphone in use: lists active capture streams and names the apps behind them. */
export const startMicrophone = (emit: Emit) => {
  let last = "";
  const tick = async () => {
    const out = await run("pactl", ["-f", "json", "list", "source-outputs"]);
    if (out === null) return;
    let apps: string[] = [];
    try {
      const list = JSON.parse(out) as { corked?: boolean; properties?: Record<string, string> }[];
      apps = list
        .filter((stream) => !stream.corked)
        .map((stream) => stream.properties?.["application.name"] ?? stream.properties?.["application.process.binary"] ?? "An app")
        .filter((name) => !MIC_IGNORE.test(name));
    } catch {
      return;
    }
    apps = [...new Set(apps)].sort();
    const key = apps.join("|");
    if (key !== last) {
      last = key;
      emit({ type: "microphone", apps });
    }
  };
  void tick();
  const interval = setInterval(() => void tick(), 2000);
  return { stop: () => clearInterval(interval) };
};

/**
 * Notifications: watches the session bus for Notify calls (it doesn't replace your notification
 * daemon, it only listens). dbus-monitor prints one `string "..."` per argument, and a string with
 * a newline in it runs over several lines, so lines are joined until the closing quote.
 */
export const startNotifications = (emit: Emit) => {
  let collecting = false;
  let strings: string[] = [];
  let open: string | null = null;

  const finish = () => {
    collecting = false;
    open = null;
    const [app = "", , summary = "", body = ""] = strings;
    strings = [];
    if (!summary && !body) return;
    const event: NotificationEvent = { app, summary, body };
    emit({ type: "notification", event });
  };

  const follower = follow("dbus-monitor", ["--session", "interface='org.freedesktop.Notifications',member='Notify'"], (line) => {
    if (open !== null) {
      open += `\n${line}`;
      if (line.endsWith('"')) {
        strings.push(open.slice(0, -1));
        open = null;
        if (strings.length >= 4) finish();
      }
      return;
    }
    if (line.includes("member=Notify") && /^(method call|signal)/.test(line)) {
      collecting = true;
      strings = [];
      return;
    }
    if (!collecting) return;
    const match = /^\s*string "(.*)$/.exec(line);
    if (match) {
      if (match[1].endsWith('"') && !match[1].endsWith('\\"')) strings.push(match[1].slice(0, -1));
      else {
        open = match[1];
        return;
      }
      if (strings.length >= 4) finish();
    } else if (/^\s*array \[/.test(line)) {
      finish();
    }
  });
  return { stop: () => follower.stop() };
};
