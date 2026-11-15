import { useCallback, useEffect, useState } from "react";

import { Island, useIsland, useIslandActions } from "@/lib/island";
import type { IslandCommand } from "@/shared/types";

import { BatteryWatcher } from "./activities/battery";
import { HudActivity } from "./activities/hud";
import { JobActivity, type Job } from "./activities/job";
import { MicActivity } from "./activities/mic";
import { MusicActivity } from "./activities/music";
import { NoticeActivity, type Notice } from "./activities/notice";
import { TimerWatcher, type TimerSpec } from "./activities/timer";
import { useBridge } from "./use-bridge";

/** Tells the main process how big the window must be, so it never covers more of the screen than it needs. */
const WindowSizer = () => {
  const { presentation } = useIsland();
  useEffect(() => {
    window.islandApi.setLayout(presentation);
  }, [presentation]);
  return null;
};

/**
 * The overlay never takes keyboard focus, so a click elsewhere can't close an expanded island.
 * Instead it folds back a moment after the pointer leaves it.
 */
const CollapseOnLeave = () => {
  const island = useIslandActions();
  useEffect(() => {
    let timer: number | undefined;
    const root = document.documentElement;
    const leave = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => island.collapse(), 1800);
    };
    const enter = () => window.clearTimeout(timer);
    root.addEventListener("mouseleave", leave);
    root.addEventListener("mouseenter", enter);
    return () => {
      window.clearTimeout(timer);
      root.removeEventListener("mouseleave", leave);
      root.removeEventListener("mouseenter", enter);
    };
  }, [island]);
  return null;
};

/** Page-sized frame: the island draws at the top centre of this 402 pt box, which is the widest it gets. */
const FRAME = { width: 402, height: 230 } as const;

export const Stage = () => {
  const [timer, setTimer] = useState<TimerSpec | null>(null);
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [notice, setNotice] = useState<Notice | null>(null);

  const onCommand = useCallback((command: IslandCommand) => {
    switch (command.type) {
      case "timer":
        setTimer({ endsAt: Date.now() + command.ms, duration: command.ms, label: command.label, run: Date.now() });
        break;
      case "timer-stop":
        setTimer(null);
        break;
      case "job":
        setJobs((all) => ({ ...all, [command.id]: { id: command.id, label: command.label, value: command.value, since: all[command.id]?.since ?? Date.now() } }));
        break;
      case "job-end":
        setJobs((all) => {
          const { [command.id]: _gone, ...rest } = all;
          return rest;
        });
        break;
      case "notice":
        setNotice({ app: "islandcn", summary: command.title, body: command.body, seq: Date.now() });
        break;
    }
  }, []);

  const { config, system } = useBridge(onCommand);
  const on = config.activities;

  return (
    <div style={{ display: "flex", justifyContent: "center", width: "100%", height: "100%", overflow: "hidden" }} onContextMenu={(event) => event.preventDefault()}>
      <div style={{ position: "relative", width: FRAME.width, height: FRAME.height, flex: "none" }}>
        <Island label="Live activities" backdrop="#101014" />
      </div>
      <WindowSizer />
      <CollapseOnLeave />

      {on.music && system.music ? <MusicActivity state={system.music} lingerSec={config.music.pausedLingerSec} /> : null}
      {on.battery && system.battery?.present ? <BatteryWatcher state={system.battery} lowPercent={config.battery.lowPercent} /> : null}
      {on.microphone && system.microphone.apps.length > 0 ? <MicActivity apps={system.microphone.apps} since={system.microphone.since} /> : null}
      {on.volume && system.volume ? <HudActivity kind="volume" level={system.volume.level} muted={system.volume.muted} seq={system.volume.seq} /> : null}
      {on.brightness && system.brightness ? <HudActivity kind="brightness" level={system.brightness.level} muted={false} seq={system.brightness.seq} /> : null}
      {on.timer ? <TimerWatcher timer={timer} onChange={setTimer} onDone={(label) => setNotice({ app: "Timer", summary: `${label} is done`, body: "Time is up", seq: Date.now() })} /> : null}
      {on.jobs ? Object.values(jobs).map((job) => <JobActivity key={job.id} job={job} onDone={() => onCommand({ type: "job-end", id: job.id })} />) : null}
      {on.notifications && system.notification ? (
        <NoticeActivity notice={{ app: system.notification.event.app || "Notification", summary: system.notification.event.summary, body: system.notification.event.body, seq: system.notification.seq }} />
      ) : null}
      {notice ? <NoticeActivity notice={notice} id="notice" /> : null}
    </div>
  );
};
