import { execFile, spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";

/** Runs a command and resolves with stdout, or null if it failed or isn't installed. */
export const run = (cmd: string, args: string[], timeout = 4000): Promise<string | null> =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => resolve(error ? null : stdout));
  });

/** Reads a small sysfs-style file and returns its trimmed text, or null. */
export const readText = async (path: string): Promise<string | null> => {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch {
    return null;
  }
};

export const readNumber = async (path: string): Promise<number | null> => {
  const text = await readText(path);
  if (text === null) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
};

export interface Follower {
  stop(): void;
}

/**
 * Keeps a long-running command alive and hands each stdout line to `onLine`. Restarts with a
 * growing delay if it exits; gives up quietly if the program isn't installed.
 */
export const follow = (cmd: string, args: string[], onLine: (line: string) => void): Follower => {
  let child: ChildProcess | null = null;
  let stopped = false;
  let delay = 1000;
  let timer: NodeJS.Timeout | undefined;

  const start = () => {
    if (stopped) return;
    child = spawn(cmd, args, { stdio: ["ignore", "pipe", "ignore"] });
    let buffer = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      delay = 1000;
      buffer += chunk;
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        onLine(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf("\n");
      }
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        stopped = true;
        console.warn(`[islandcn] ${cmd} is not installed; the feature that needs it is off.`);
      }
    });
    child.on("close", () => {
      child = null;
      if (stopped) return;
      timer = setTimeout(start, delay);
      delay = Math.min(delay * 2, 30000);
    });
  };
  start();

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      child?.kill();
    },
  };
};
