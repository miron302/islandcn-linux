import { readdir } from "node:fs/promises";
import type { BatteryState } from "../../src/shared/types";
import { readNumber, readText } from "../util";

const ROOT = "/sys/class/power_supply";

const readBattery = async (): Promise<BatteryState> => {
  let names: string[] = [];
  try {
    names = await readdir(ROOT);
  } catch {
    return { present: false, level: 1, charging: false, full: false };
  }
  for (const name of names.filter((entry) => entry.startsWith("BAT"))) {
    const base = `${ROOT}/${name}`;
    if ((await readText(`${base}/type`)) !== "Battery") continue;
    const status = (await readText(`${base}/status`)) ?? "Unknown";
    const capacity = await readNumber(`${base}/capacity`);
    if (capacity === null) continue;
    const energyNow = (await readNumber(`${base}/energy_now`)) ?? (await readNumber(`${base}/charge_now`));
    const energyFull = (await readNumber(`${base}/energy_full`)) ?? (await readNumber(`${base}/charge_full`));
    const rate = (await readNumber(`${base}/power_now`)) ?? (await readNumber(`${base}/current_now`));
    const charging = status === "Charging";
    let timeToFull: number | undefined;
    if (charging && energyNow !== null && energyFull !== null && rate && rate > 0 && energyFull > energyNow) {
      timeToFull = ((energyFull - energyNow) / rate) * 3_600_000;
    }
    return { present: true, level: Math.min(1, capacity / 100), charging, full: status === "Full" || capacity >= 100, timeToFull };
  }
  return { present: false, level: 1, charging: false, full: false };
};

/** Polls sysfs every few seconds and emits only when the level, charging or full flag changes. */
export const startBattery = (emit: (state: BatteryState) => void) => {
  let key = "";
  const tick = async () => {
    const state = await readBattery();
    const next = `${state.present}|${Math.round(state.level * 100)}|${state.charging}|${state.full}`;
    if (next !== key) {
      key = next;
      emit(state);
    }
  };
  void tick();
  const interval = setInterval(() => void tick(), 4000);
  return { stop: () => clearInterval(interval) };
};
