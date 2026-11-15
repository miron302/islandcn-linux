import type { DesktopId, IslandCommand } from "../src/shared/types";

export type CliAction =
  | { kind: "command"; command: IslandCommand }
  | { kind: "settings" }
  | { kind: "choose-desktop" }
  | { kind: "set-desktop"; id: DesktopId }
  | { kind: "quit" }
  | { kind: "help" };

/** "25m", "1h30m", "90s", or a bare number of minutes. Returns ms, or null. */
export const parseDuration = (text: string): number | null => {
  const bare = /^(\d+(?:\.\d+)?)$/.exec(text);
  if (bare) return Math.round(Number(bare[1]) * 60_000);
  const re = /(\d+(?:\.\d+)?)\s*(h|m|s)/g;
  let total = 0;
  let matched = false;
  for (const part of text.matchAll(re)) {
    matched = true;
    total += Number(part[1]) * { h: 3_600_000, m: 60_000, s: 1000 }[part[2] as "h" | "m" | "s"];
  }
  return matched && total > 0 ? Math.round(total) : null;
};

export const HELP = `islandcn-arch: a Dynamic Island for your Linux desktop

  islandcn-arch                         start (or do nothing if already running)
  islandcn-arch settings                open settings
  islandcn-arch choose-desktop          pick GNOME / KDE / Hyprland / generic again
  islandcn-arch desktop <gnome|kde|hyprland|x11>
  islandcn-arch timer 25m [label]       start a timer on the island
  islandcn-arch timer-stop
  islandcn-arch job <id> <0..1|spin> [label]   show progress for any script
  islandcn-arch job-end <id>
  islandcn-arch notice <title> [body]   flash a one-off notice
  islandcn-arch quit
`;

/** Reads what the user typed after the program name. Flags starting with "-" belong to Chromium. */
export const parseArgs = (argv: string[]): CliAction[] => {
  const words = argv.filter((word) => !word.startsWith("-"));
  const names = ["settings", "choose-desktop", "desktop", "timer", "timer-stop", "job", "job-end", "notice", "quit", "help"];
  const start = words.findIndex((word) => names.includes(word));
  if (start < 0) return argv.includes("--help") || argv.includes("-h") ? [{ kind: "help" }] : [];
  const [name, ...rest] = words.slice(start);
  switch (name) {
    case "settings":
      return [{ kind: "settings" }];
    case "choose-desktop":
      return [{ kind: "choose-desktop" }];
    case "desktop": {
      const id = rest[0];
      return id === "gnome" || id === "kde" || id === "hyprland" || id === "x11" ? [{ kind: "set-desktop", id }] : [{ kind: "help" }];
    }
    case "timer": {
      const ms = parseDuration(rest[0] ?? "");
      return ms ? [{ kind: "command", command: { type: "timer", ms, label: rest.slice(1).join(" ") || "Timer" } }] : [{ kind: "help" }];
    }
    case "timer-stop":
      return [{ kind: "command", command: { type: "timer-stop" } }];
    case "job": {
      const [id, value, ...label] = rest;
      if (!id || value === undefined) return [{ kind: "help" }];
      const number = value === "spin" ? null : Number(value);
      if (number !== null && !Number.isFinite(number)) return [{ kind: "help" }];
      return [{ kind: "command", command: { type: "job", id, label: label.join(" ") || id, value: number === null ? null : Math.min(1, Math.max(0, number)) } }];
    }
    case "job-end":
      return rest[0] ? [{ kind: "command", command: { type: "job-end", id: rest[0] } }] : [{ kind: "help" }];
    case "notice":
      return rest[0] ? [{ kind: "command", command: { type: "notice", title: rest[0], body: rest.slice(1).join(" ") } }] : [{ kind: "help" }];
    case "quit":
      return [{ kind: "quit" }];
    default:
      return [{ kind: "help" }];
  }
};
