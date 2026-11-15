import { useEffect, useMemo, useState } from "react";

import { NowPlayingActivity } from "@/components/islandcn/now-playing-activity";
import type { MusicState } from "@/shared/types";

/**
 * Whatever MPRIS player is active. Playing shows at once; paused lingers for a while so you can
 * hit play again from the island, then leaves. The preset draws the cover, meter, scrubber and
 * transport buttons; here we only translate the player's state into its props.
 */
export const MusicActivity = ({ state, lingerSec }: { state: MusicState; lingerSec: number }) => {
  const [expired, setExpired] = useState(false);

  // Each new reading re-anchors the clock: playing means "started this long ago".
  const startedAt = useMemo(() => Date.now() - state.position, [state]);

  useEffect(() => {
    setExpired(false);
    if (state.status !== "Paused") return;
    const timer = window.setTimeout(() => setExpired(true), lingerSec * 1000);
    return () => window.clearTimeout(timer);
  }, [state.status, state.title, state.player, lingerSec]);

  if (state.status === "Stopped" || expired) return null;

  const playing = state.status === "Playing";
  const duration = state.length > 0 ? state.length : Math.max(state.position + 1000, 1000);
  const api = window.islandApi;

  return (
    <NowPlayingActivity
      title={state.title}
      artist={state.artist || state.album || state.player}
      duration={duration}
      playback={playing ? { kind: "playing", startedAt } : { kind: "paused", position: state.position }}
      artwork={state.artUrl || undefined}
      onToggle={() => api.musicControl("play-pause")}
      onPrevious={() => api.musicControl("previous")}
      onNext={() => api.musicControl("next")}
    />
  );
};
