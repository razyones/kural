/**
 * The dial. Configures the sensitivity knobs that control when a structural
 * signal becomes a finding. It is the only module that owns audit tuning
 * parameters — no other module decides detection thresholds.
 */

/** Tuning parameters for the structural audit system. */
type AuditsConfig = {
  /** Standard deviations from the mean to flag (higher = stricter). Default: 2.0 */
  sensitivity: number;
  /** Absolute floor: containment requires dominant child above this. Default: 0.9 */
  containmentFloor: number;
  /** Minimum group size for per-group statistical tests. Default: 4 */
  minGroup: number;
  /** Audit names to skip (e.g. ["incomplete-docs", "identity-language"]) */
  disable?: string[];
};

export type { AuditsConfig };
