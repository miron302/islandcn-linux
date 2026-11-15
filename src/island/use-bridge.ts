import { useEffect, useRef, useState } from "react";

import { defaultConfig, type AppConfig, type BatteryState, type IslandCommand, type MusicState, type NotificationEvent, type SystemEvent } from "@/shared/types";

export interface SystemState {
  music: MusicState | null;
  battery: BatteryState | null;
  microphone: { apps: string[]; since: number };
  volume: { level: number; muted: boolean; seq: number } | null;
  brightness: { level: number; seq: number } | null;
  notification: { event: NotificationEvent; seq: number } | null;
}

const empty: SystemState = { music: null, battery: null, microphone: { apps: [], since: 0 }, volume: null, brightness: null, notification: null };

/** Subscribes once to what the main process pushes: settings, system events and commands. */
export const useBridge = (onCommand: (command: IslandCommand) => void) => {
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [system, setSystem] = useState<SystemState>(empty);
  const commandRef = useRef(onCommand);
  commandRef.current = onCommand;

  useEffect(() => {
    const api = window.islandApi;
    void api.getConfig().then(setConfig);
    const offConfig = api.onConfig(setConfig);
    const offCommand = api.onCommand((command) => commandRef.current(command));
    const offEvent = api.onEvent((event: SystemEvent) => {
      setSystem((state) => {
        switch (event.type) {
          case "music":
            return { ...state, music: event.state };
          case "battery":
            return { ...state, battery: event.state };
          case "microphone":
            return { ...state, microphone: { apps: event.apps, since: event.apps.length > 0 && state.microphone.apps.length === 0 ? Date.now() : state.microphone.since } };
          case "volume":
            return { ...state, volume: { level: event.level, muted: event.muted, seq: (state.volume?.seq ?? 0) + 1 } };
          case "brightness":
            return { ...state, brightness: { level: event.level, seq: (state.brightness?.seq ?? 0) + 1 } };
          case "notification":
            return { ...state, notification: { event: event.event, seq: (state.notification?.seq ?? 0) + 1 } };
        }
      });
    });
    return () => {
      offConfig();
      offCommand();
      offEvent();
    };
  }, []);

  return { config, system };
};
