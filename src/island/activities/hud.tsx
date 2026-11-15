import { useEffect, useState } from "react";

import { Glyph } from "@/components/islandcn/glyph";
import { BottomBar, ExpandedBottom, SensorRow } from "@/components/islandcn/island-layout";
import { CompactText, ContextLabel, ExpandedValue, MinimalPair, NumberText } from "@/components/islandcn/island-text";
import { LinearProgress } from "@/components/islandcn/linear-progress";
import { islandAccent } from "@/components/islandcn/theme";
import { useActivity } from "@/components/islandcn/use-activity";

import { BrightnessGlyph, VolumeHighGlyph, VolumeLowGlyph, VolumeMuteGlyph } from "../glyphs";

const HOLD_MS = 1800;

interface Props {
  kind: "volume" | "brightness";
  /** 0 to 1 (volume can go past 1 when boosted). */
  level: number;
  muted: boolean;
  /** Changes on every reading, so each press restarts the hold. */
  seq: number;
}

/** Shows for a moment after the volume or brightness changes, then leaves. Compact only: it never takes over the screen. */
export const HudActivity = ({ kind, level, muted, seq }: Props) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [seq]);

  return visible ? <Hud kind={kind} level={level} muted={muted} seq={seq} /> : null;
};

const Hud = ({ kind, level, muted }: Props) => {
  const percent = Math.round(level * 100);
  const accent = kind === "volume" ? islandAccent.sky : islandAccent.yellow;
  const icon = kind === "brightness" ? BrightnessGlyph : muted || level === 0 ? VolumeMuteGlyph : level < 0.5 ? VolumeLowGlyph : VolumeHighGlyph;
  const name = kind === "volume" ? "Volume" : "Brightness";

  useActivity(
    () => ({
      id: `hud-${kind}`,
      priority: 1,
      label: muted ? `${name} muted` : `${name} ${percent} percent`,
      compact: {
        leading: <Glyph icon={icon} color={accent} />,
        trailing: <CompactText>{muted ? "Mute" : <NumberText value={percent} />}</CompactText>,
      },
      minimal: <MinimalPair leading={<Glyph icon={icon} color={accent} />} trailing={<CompactText>{muted ? "0" : <NumberText value={percent} />}</CompactText>} />,
      expanded: {
        leading: (
          <SensorRow glyph={<Glyph icon={icon} color={accent} size={18} />}>
            <ContextLabel>{name}</ContextLabel>
          </SensorRow>
        ),
        bottom: (
          <ExpandedBottom gap={6}>
            <ExpandedValue unit="%">
              <NumberText value={muted ? 0 : percent} />
            </ExpandedValue>
            <BottomBar>
              <LinearProgress value={muted ? 0 : Math.min(1, level)} color={accent} height={5} label={name} />
            </BottomBar>
          </ExpandedBottom>
        ),
      },
    }),
    [kind, percent, muted, icon, accent, level, name],
  );
  return null;
};
