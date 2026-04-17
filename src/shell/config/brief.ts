/**
 * Configures the output-size knobs that govern how many entries each
 * retrieval section returns. It is the only module that owns these
 * tuning parameters — no other module decides the per-section limits.
 */

import type { BriefCaps } from "../../analysis/brief/types.ts";

/** User-overridable limits — any omitted field uses the built-in default. */
type BriefConfig = Partial<BriefCaps>;

export type { BriefConfig };
