/**
 * The pace-keeper. Wraps sequential async steps with animated progress
 * spinners that auto-advance through a named step list. It is the only
 * module that owns multi-step progress animation — no other module
 * tracks numbered step completion.
 */

import { logger } from "./log.ts";

const NONE = 0;

/** Batch progress callback — reports completed and total counts. */
type OnProgress = (completed: number, total: number) => void;

/**
 * An auto-advancing step runner — each call executes the next named step
 * with a spinner that optionally displays batch progress.
 */
type TrackedStep = <T>(work: (onProgress: OnProgress) => Promise<T>) => Promise<T>;

/**
 * Creates an auto-advancing step tracker with spinners for each named step.
 * @param label - Verb prefix for spinner text (e.g., "Embedding")
 * @param stepNames - Ordered names for each step
 * @returns A function that wraps each call with the next step's spinner
 */
function createStepTracker(label: string, stepNames: string[]): TrackedStep {
  let stepIndex = NONE;
  return async (work) => {
    const name = stepNames[stepIndex] ?? "data";
    stepIndex++;
    const step = `(${stepIndex}/${stepNames.length})`;
    const spinner = logger.await(`${label} ${step} ${name}`);
    spinner.start();
    let stepTotal = NONE;
    const result = await work((completed, total) => {
      stepTotal = total;
      spinner.update(`${label} ${step} ${name} (${completed}/${total})`);
    });
    if (stepTotal === NONE) {
      spinner.update(`${label} ${step} ${name} (skipped)`);
    }
    spinner.stop();
    return result;
  };
}

export { createStepTracker };
export type { OnProgress, TrackedStep };
