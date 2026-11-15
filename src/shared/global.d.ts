import type { IslandApiBridge, SettingsApiBridge } from "./types";

declare global {
  interface Window {
    islandApi: IslandApiBridge;
    settingsApi: SettingsApiBridge;
  }
}

export {};
