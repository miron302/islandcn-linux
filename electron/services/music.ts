import type { MusicState } from "../../src/shared/types";
import { follow, run, type Follower } from "../util";

const SEP = "\u001f";
const FORMAT = ["{{status}}", "{{playerName}}", "{{artist}}", "{{title}}", "{{album}}", "{{mpris:artUrl}}", "{{mpris:length}}", "{{position}}"].join(SEP);

const parseLine = (line: string): MusicState | null => {
  const parts = line.split(SEP);
  if (parts.length < 8) return null;
  const [status, player, artist, title, album, artUrl, length, position] = parts;
  if (status !== "Playing" && status !== "Paused" && status !== "Stopped") return null;
  return {
    player,
    status,
    artist,
    title: title || "Unknown title",
    album,
    artUrl,
    length: Math.max(0, Math.round(Number(length) / 1000)) || 0,
    position: Math.max(0, Math.round(Number(position) / 1000)) || 0,
  };
};

export interface MusicService {
  stop(): void;
  control(action: "play-pause" | "next" | "previous" | "seek", valueMs?: number): void;
  setPreferredPlayer(name: string): void;
}

/**
 * Watches every MPRIS player through playerctl (Spotify, Firefox, Chromium, mpv, VLC...). One
 * follow process wakes it up on changes; a slow poll catches players that quit and keeps the
 * position honest. The renderer counts seconds itself between updates.
 */
export const startMusic = (emit: (state: MusicState | null) => void, initialPlayer: string): MusicService => {
  let preferred = initialPlayer;
  let current: MusicState | null = null;
  let lastKey = "";
  let lastPosition = 0;
  let lastAt = 0;
  let sticky = "";
  let busy = false;

  const pick = (all: MusicState[]): MusicState | null => {
    const live = all.filter((entry) => entry.status !== "Stopped");
    if (live.length === 0) return null;
    const wanted = preferred.trim().toLowerCase();
    if (wanted) {
      const match = live.find((entry) => entry.player.toLowerCase().startsWith(wanted));
      if (match) return match;
    }
    const playing = live.find((entry) => entry.status === "Playing");
    if (playing) {
      sticky = playing.player;
      return playing;
    }
    return live.find((entry) => entry.player === sticky) ?? live[0];
  };

  const poll = async () => {
    if (busy) return;
    busy = true;
    try {
      const out = await run("playerctl", ["-a", "metadata", "--format", FORMAT]);
      const all = (out ?? "").split("\n").map(parseLine).filter((entry): entry is MusicState => entry !== null);
      const next = pick(all);
      const now = Date.now();
      if (next === null) {
        if (current !== null) {
          current = null;
          lastKey = "";
          emit(null);
        }
        return;
      }
      const key = [next.player, next.status, next.title, next.artist, next.artUrl, next.length].join(SEP);
      // Where the position should be if nothing was seeked since the last reading.
      const expected = lastPosition + (next.status === "Playing" ? now - lastAt : 0);
      const seeked = Math.abs(next.position - expected) > 2500;
      current = next;
      lastPosition = next.position;
      lastAt = now;
      if (key !== lastKey || seeked) {
        lastKey = key;
        emit(next);
      }
    } finally {
      busy = false;
    }
  };

  let wake: NodeJS.Timeout | undefined;
  const schedule = () => {
    if (wake) clearTimeout(wake);
    wake = setTimeout(() => void poll(), 80);
  };
  const follower: Follower = follow("playerctl", ["-a", "metadata", "--follow", "--format", "{{playerName}}"], schedule);
  const interval = setInterval(() => void poll(), 2000);
  void poll();

  const target = () => (current ? ["-p", current.player] : []);
  return {
    stop() {
      follower.stop();
      clearInterval(interval);
      if (wake) clearTimeout(wake);
    },
    control(action, valueMs) {
      if (action === "seek") void run("playerctl", [...target(), "position", String(Math.max(0, (valueMs ?? 0) / 1000))]).then(poll);
      else void run("playerctl", [...target(), action]).then(() => setTimeout(() => void poll(), 120));
    },
    setPreferredPlayer(name) {
      preferred = name;
      lastKey = "";
      void poll();
    },
  };
};
