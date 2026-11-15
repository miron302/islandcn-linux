import { RecordingActivity } from "@/components/islandcn/recording-activity";

/** The microphone is being used. The preset's own waveform animates; it is not a real level meter. */
export const MicActivity = ({ apps, since }: { apps: string[]; since: number }) => (
  <RecordingActivity id="microphone" priority={1} kind="audio" title={`Microphone in use by ${apps.join(", ")}`} state={{ kind: "recording", since }} />
);
