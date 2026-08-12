import type { Db, RunResult, SqlValue } from "./types.ts";

export class D1Db implements Db {
  private readonly d1: D1Database;

  constructor(d1: D1Database) {
    this.d1 = d1;
  }

  async all<T = Record<string, unknown>>(sql: string, ...params: SqlValue[]): Promise<T[]> {
    const res = await this.d1.prepare(sql).bind(...params).all<T>();
    return res.results as T[];
  }

  async first<T = Record<string, unknown>>(sql: string, ...params: SqlValue[]): Promise<T | null> {
    return this.d1.prepare(sql).bind(...params).first<T>();
  }

  async run(sql: string, ...params: SqlValue[]): Promise<RunResult> {
    const res = await this.d1.prepare(sql).bind(...params).run();
    return { changes: res.meta.changes, lastRowId: res.meta.last_row_id };
  }

  async batch(ops: Array<{ sql: string; params?: SqlValue[] }>): Promise<RunResult[]> {
    const stmts = ops.map((op) => this.d1.prepare(op.sql).bind(...(op.params ?? [])));
    const results = await this.d1.batch(stmts);
    return results.map((r) => ({ changes: r.meta.changes, lastRowId: r.meta.last_row_id }));
  }

  async exec(sql: string): Promise<void> {
    // D1 はバッチで複数ステートメントを実行する（migration適用はwrangler側）
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    if (statements.length) {
      await this.d1.batch(statements.map((s) => this.d1.prepare(s)));
    }
  }
}
