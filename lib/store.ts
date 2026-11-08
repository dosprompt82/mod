import "server-only";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Minimal append-only JSONL store for reports, saved positions and AI logs (DECISIONS D-021).
 * Writes to DATA_DIR (default .data). If the filesystem is read-only (e.g. serverless),
 * it falls back to memory for the life of the instance. Postgres replaces this later.
 */
const dir = process.env.DATA_DIR ?? join(process.cwd(), ".data");
const memory = new Map<string, unknown[]>();
let writable = true;
try { mkdirSync(dir, { recursive: true }); } catch { writable = false; }

export function append<T>(table: string, row: T): void {
  const rows = memory.get(table) ?? load(table);
  rows.push(row);
  memory.set(table, rows);
  if (!writable) return;
  try { appendFileSync(join(dir, `${table}.jsonl`), JSON.stringify(row) + "\n"); } catch { writable = false; }
}

function load(table: string): unknown[] {
  const f = join(dir, `${table}.jsonl`);
  if (!writable || !existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

export function all<T>(table: string): T[] {
  if (!memory.has(table)) memory.set(table, load(table));
  return memory.get(table) as T[];
}
