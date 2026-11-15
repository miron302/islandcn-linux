import { useEffect } from "react";

import { Glyph } from "@/components/islandcn/glyph";
import { CheckGlyph, TerminalGlyph } from "@/components/islandcn/glyphs";
import { BottomBar, ExpandedBottom, SensorRow } from "@/components/islandcn/island-layout";
import { ContextLabel, ExpandedSubtitle, ExpandedValue, MinimalPair, NumberText } from "@/components/islandcn/island-text";
import { LinearProgress } from "@/components/islandcn/linear-progress";
import { ProgressRing } from "@/components/islandcn/progress-ring";
import { ShimmerText } from "@/components/islandcn/shimmer-text";
import { Spinner } from "@/components/islandcn/spinner";
import { islandAccent, islandInk } from "@/components/islandcn/theme";
import { useActivity } from "@/components/islandcn/use-activity";

export interface Job {
  id: string;
  label: string;
  /** 0 to 1, or null when the end is unknown. */
  value: number | null;
  since: number;
}

/**
 * Any script can report progress with `islandcn-arch job <id> <0..1|spin> [label]`: a backup, a
 * build, an upload, a download. Jobs share a group so they take turns instead of splitting the pill.
 */
export const JobActivity = ({ job, onDone }: { job: Job; onDone: () => void }) => {
  const finished = job.value !== null && job.value >= 1;
  const percent = Math.round((job.value ?? 0) * 100);
  const accent = finished ? islandAccent.green : islandAccent.blue;

  useEffect(() => {
    if (!finished) return;
    const timer = window.setTimeout(onDone, 3500);
    return () => window.clearTimeout(timer);
  }, [finished, onDone]);

  const progress = finished ? <Glyph icon={CheckGlyph} color={accent} /> : job.value === null ? <Spinner color={accent} /> : <ProgressRing value={job.value} color={accent} size={20} />;

  useActivity(
    () => ({
      id: `job-${job.id}`,
      group: "jobs",
      label: finished ? `${job.label} finished` : job.value === null ? `${job.label} running` : `${job.label}, ${percent} percent`,
      alert: finished,
      compact: {
        leading: <Glyph icon={TerminalGlyph} color={accent} />,
        trailing: progress,
      },
      minimal: <MinimalPair leading={<Glyph icon={TerminalGlyph} color={accent} />} trailing={progress} />,
      expanded: {
        leading: (
          <SensorRow glyph={<Glyph icon={TerminalGlyph} color={accent} size={18} />}>
            <ContextLabel>{finished ? "Done" : "Running"}</ContextLabel>
          </SensorRow>
        ),
        bottom: (
          <ExpandedBottom gap={6}>
            {job.value === null ? (
              <ExpandedSubtitle color={islandInk.primary}>
                <ShimmerText>{job.label}</ShimmerText>
              </ExpandedSubtitle>
            ) : (
              <>
                <ExpandedValue unit="%">
                  <NumberText value={percent} />
                </ExpandedValue>
                <ExpandedSubtitle color={islandInk.primary}>{job.label}</ExpandedSubtitle>
                <BottomBar>
                  <LinearProgress value={job.value} color={accent} height={5} label={job.label} />
                </BottomBar>
              </>
            )}
          </ExpandedBottom>
        ),
      },
    }),
    [job.id, job.label, job.value, finished, percent, accent],
  );
  return null;
};
