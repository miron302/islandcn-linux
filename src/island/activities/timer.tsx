import { useEffect } from "react";

import { TimerActivity, type TimerState } from "@/components/islandcn/timer-activity";

export interface TimerSpec {
  /** Epoch ms when it ends while running. */
  endsAt: number;
  duration: number;
  label: string;
  /** Epoch ms of when it started, to tell one run from the next. */
  run: number;
  /** Set while paused: how much is left. */
  remaining?: number;
}

/** A beep from the Web Audio API, so the timer needs no sound file. */
const beep = () => {
  try {
    const context = new AudioContext();
    for (let i = 0; i < 3; i++) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, context.currentTime + i * 0.35);
      gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + i * 0.35 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + i * 0.35 + 0.25);
      osc.connect(gain).connect(context.destination);
      osc.start(context.currentTime + i * 0.35);
      osc.stop(context.currentTime + i * 0.35 + 0.3);
    }
    window.setTimeout(() => void context.close(), 1500);
  } catch {
    /* no audio device: the island still alerts */
  }
};

export const TimerWatcher = ({ timer, onChange, onDone }: { timer: TimerSpec | null; onChange: (timer: TimerSpec | null) => void; onDone: (label: string) => void }) => {
  // The timer's own end callback can fire a hair early; this is the single place that finishes it.
  useEffect(() => {
    if (!timer || timer.remaining !== undefined) return;
    const wait = Math.max(0, timer.endsAt - Date.now());
    const id = window.setTimeout(() => {
      beep();
      onDone(timer.label);
      onChange(null);
    }, wait + 50);
    return () => window.clearTimeout(id);
  }, [timer, onChange, onDone]);

  if (!timer) return null;
  const state: TimerState = timer.remaining !== undefined ? { kind: "paused", remaining: timer.remaining } : { kind: "running", endsAt: timer.endsAt };

  return (
    <TimerActivity
      state={state}
      duration={timer.duration}
      label={timer.label}
      onToggle={() => {
        if (timer.remaining !== undefined) onChange({ ...timer, remaining: undefined, endsAt: Date.now() + timer.remaining });
        else onChange({ ...timer, remaining: Math.max(0, timer.endsAt - Date.now()) });
      }}
      onCancel={() => onChange(null)}
    />
  );
};
