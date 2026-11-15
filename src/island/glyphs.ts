import { Mic01Icon, Sun03Icon, VolumeHighIcon, VolumeLowIcon, VolumeMute01Icon } from "@hugeicons/core-free-icons";

import { glyphFrom } from "@/components/islandcn/glyphs";

/** Glyphs the kit doesn't ship, drawn from the free Hugeicons set at the island's weight. */
export const VolumeHighGlyph = glyphFrom("VolumeHighGlyph", VolumeHighIcon, { parts: "fill" });
export const VolumeLowGlyph = glyphFrom("VolumeLowGlyph", VolumeLowIcon, { parts: "fill" });
export const VolumeMuteGlyph = glyphFrom("VolumeMuteGlyph", VolumeMute01Icon, { parts: "fill" });
export const BrightnessGlyph = glyphFrom("BrightnessGlyph", Sun03Icon, { parts: "fill" });
export const MicGlyph = glyphFrom("MicGlyph", Mic01Icon, { parts: "fill" });
