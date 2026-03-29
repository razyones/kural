/**
 * Logging utilities.
 * @kuralUtil
 */
export function logWithTime(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

/** Log level configuration. */
export type LogLevel = {
  name: string;
  priority: number;
};
