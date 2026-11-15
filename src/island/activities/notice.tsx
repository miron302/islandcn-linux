import { useEffect, useRef } from "react";

import { Glyph } from "@/components/islandcn/glyph";
import { BellGlyph } from "@/components/islandcn/glyphs";
import { ExpandedBottom, SensorRow } from "@/components/islandcn/island-layout";
import { ContextLabel, ExpandedSubtitle, ExpandedTitle, MinimalPair } from "@/components/islandcn/island-text";
import { islandAccent, islandInk } from "@/components/islandcn/theme";
import { useActivity } from "@/components/islandcn/use-activity";
import { useIsland } from "@/lib/island";

export interface Notice {
  app: string;
  summary: string;
  body: string;
  /** Changes with every new notice so a second one re-alerts. */
  seq: number;
}

const HOLD_MS = 7000;

/** A desktop notification or a one-off notice: expands for a few seconds, then folds away. */
export const NoticeActivity = ({ notice, id = "notification" }: { notice: Notice; id?: string }) => {
  const island = useIsland();
  const first = useRef(true);

  const controls = useActivity(
    () => ({
      id,
      priority: 2,
      alert: true,
      label: `${notice.app}: ${notice.summary}`,
      compact: { leading: <Glyph icon={BellGlyph} color={islandAccent.yellow} />, trailing: <span style={{ display: "block", width: 4 }} /> },
      minimal: <MinimalPair leading={<Glyph icon={BellGlyph} color={islandAccent.yellow} />} trailing={<span style={{ display: "block", width: 4 }} />} />,
      expanded: {
        leading: (
          <SensorRow glyph={<Glyph icon={BellGlyph} color={islandAccent.yellow} size={18} />}>
            <ContextLabel>{notice.app}</ContextLabel>
          </SensorRow>
        ),
        bottom: (
          <ExpandedBottom gap={4}>
            <ExpandedTitle>{notice.summary}</ExpandedTitle>
            {notice.body ? <ExpandedSubtitle color={islandInk.secondary}>{notice.body.replace(/\s+/g, " ")}</ExpandedSubtitle> : null}
          </ExpandedBottom>
        ),
      },
    }),
    [id, notice.app, notice.summary, notice.body],
  );

  // A new notice with the same id updates in place, so ask for the alert again.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    controls.alert();
  }, [notice.seq]);

  // Leave once the alert has had its time on screen.
  useEffect(() => {
    const timer = window.setTimeout(() => island.end(id), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [notice.seq, id, island]);

  return null;
};
