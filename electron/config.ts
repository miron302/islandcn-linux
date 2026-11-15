import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { defaultConfig, type AppConfig } from "../src/shared/types";

export const configDir = () => app.getPath("userData");
const file = () => join(configDir(), "config.json");

const merge = <T extends object>(base: T, patch: unknown): T => {
  if (typeof patch !== "object" || patch === null) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const current = out[key];
    if (key in out && typeof current === "object" && current !== null && !Array.isArray(current)) out[key] = merge(current as object, value);
    else if (key in out && typeof value === typeof current) out[key] = value;
    else if (key === "desktop" && (value === null || typeof value === "string")) out[key] = value;
  }
  return out as T;
};

const clamp = (config: AppConfig): AppConfig => ({
  ...config,
  scale: Math.min(2, Math.max(0.5, Number(config.scale) || 1)),
  offsetX: Math.round(Math.min(4000, Math.max(-4000, Number(config.offsetX) || 0))),
  offsetY: Math.round(Math.min(4000, Math.max(-4000, Number(config.offsetY) || 0))),
  music: { ...config.music, pausedLingerSec: Math.min(3600, Math.max(0, Number(config.music.pausedLingerSec) || 0)) },
  battery: { lowPercent: Math.min(50, Math.max(5, Number(config.battery.lowPercent) || 15)) },
});

export const loadConfig = (): AppConfig => {
  try {
    return clamp(merge(defaultConfig, JSON.parse(readFileSync(file(), "utf8"))));
  } catch {
    return { ...defaultConfig };
  }
};

export const saveConfig = (config: AppConfig) => {
  try {
    mkdirSync(configDir(), { recursive: true });
    writeFileSync(file(), JSON.stringify(config, null, 2));
  } catch (error) {
    console.warn("[islandcn] could not save settings:", error);
  }
};

export const mergeConfig = (config: AppConfig, patch: Partial<AppConfig>): AppConfig => clamp(merge(config, patch));
