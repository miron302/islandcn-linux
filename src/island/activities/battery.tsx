import { useEffect, useRef, useState } from "react";

import { BatteryActivity } from "@/components/islandcn/battery-activity";
import type { BatteryState } from "@/shared/types";

/**
 * Charging shows briefly each time you plug in (the preset leaves by itself after a few seconds,
 * like the system's charging pill). A low battery stays up as a red status until you plug in.
 */
export const BatteryWatcher = ({ state, lowPercent }: { state: BatteryState; lowPercent: number }) => {
  const plugged = state.charging || state.full;
  const first = useRef(true);
  const [showCharging, setShowCharging] = useState(false);

  // Don't announce a charger that was already in when the app started.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setShowCharging(plugged);
  }, [plugged]);

  const low = !plugged && state.level * 100 <= lowPercent;

  if (showCharging && plugged) {
    return <BatteryActivity key="charging" level={state.level} charging timeToFull={state.timeToFull} dismissAfter={3300} onDismiss={() => setShowCharging(false)} />;
  }
  if (low) {
    return <BatteryActivity key="low" id="battery-low" priority={1} level={state.level} charging={false} lowThreshold={lowPercent / 100} name="Battery low" alertOnStart />;
  }
  return null;
};
