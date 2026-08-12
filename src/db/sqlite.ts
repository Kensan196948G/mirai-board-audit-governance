import { DatabaseSync } from "node:sqlite";
import type { Db, RunResult, SqlValue } from "./types.ts";

export class SqliteDb implements Db {
  private readonly db: DatabaseSync;

  constructor(path: string | ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON;");
  }

  all<T = Record<string, unknown>>(sql: string, ...params: SqlValue[]): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...this.normalize(params)) as unknown[];
    return Promise.resolve(rows as T[]);
  }

  first<T = Record<string, unknown>>(sql: string, ...params: SqlValue[]): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const row = stmt.get(...this.normalize(params)) as unknown;
    return Promise.resolve((row ?? null) as T | null);
  }

  run(sql: string, ...params: SqlValue[]): Promise<RunResult> {
    const stmt = this.db.prepare(sql);
    const res = stmt.run(...this.normalize(params));
    return Promise.resolve({ changes: Number(res.changes), lastRowId: Number(res.lastInsertRowid) });
  }

  async batch(ops: Array<{ sql: string; params?: SqlValue[] }>): Promise<RunResult[]> {
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const results: RunResult[] = [];
      for (const op of ops) {
        const stmt = this.db.prepare(op.sql);
        const res = stmt.run(...this.normalize(op.params ?? []));
        results.push({ changes: Number(res.changes), lastRowId: Number(res.lastInsertRowid) });
      }
      this.db.exec("COMMIT;");
      return results;
    } catch (e) {
      this.db.exec("ROLLBACK;");
      throw e;
    }
  }

  close() {
    this.db.close();
  }

  private normalize(params: SqlValue[]): Array<string | number | bigint | Uint8Array | null> {
    return params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p));
  }
}
