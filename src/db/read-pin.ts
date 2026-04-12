/**
 * Peeks into a snapshot database file to read pin metadata
 * without triggering a full collection preload. It is the only module that
 * queries the collection registry table directly — no other module performs
 * raw SQL reads against snapshot files for pin names.
 */

import BetterSqlite3 from "better-sqlite3";

const PIN_NAME_KEY = "pin_name";

/**
 * Reads the pin name from a snapshot database without full preload.
 * @param dbPath - Absolute path to the SQLite database file
 * @returns The pin name if set, undefined otherwise
 * @kuralCauses opens and closes a SQLite database to read metadata
 */
function readPinName(dbPath: string): string | undefined {
  let db: BetterSqlite3.Database;
  try {
    db = new BetterSqlite3(dbPath);
  } catch {
    // database file unreadable — treat as no pin
    return undefined;
  }
  try {
    const reg: unknown = db
      .prepare("SELECT table_name FROM collection_registry WHERE collection_id = 'metadata'")
      .get();
    if (reg === undefined || reg === null || typeof reg !== "object" || !("table_name" in reg)) {
      return undefined;
    }
    const table = String(reg.table_name);
    const row: unknown = db
      .prepare(`SELECT value FROM ${table} WHERE key = ?`)
      .get(`s:${PIN_NAME_KEY}`);
    if (row !== null && row !== undefined && typeof row === "object" && "value" in row) {
      try {
        const parsed: unknown = JSON.parse(String(row.value));
        if (parsed !== null && typeof parsed === "object" && "value" in parsed) {
          return String(parsed.value);
        }
      } catch {
        // malformed pin metadata JSON — treat as no pin
        return undefined;
      }
    }
    return undefined;
  } catch {
    // schema mismatch or corrupt database — treat as no pin
    return undefined;
  } finally {
    db.close();
  }
}

export { readPinName };
