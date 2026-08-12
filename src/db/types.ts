export type SqlValue = string | number | bigint | null | Uint8Array | boolean;

export type RunResult = {
  changes: number;
  lastRowId?: number;
};

export interface Db {
  all<T = Record<string, unknown>>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  first<T = Record<string, unknown>>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  run(sql: string, ...params: SqlValue[]): Promise<RunResult>;
  exec(sql: string): Promise<void>;
  /** 複数ステートメントを原子的に実行（D1: batch / ローカル: トランザクション） */
  batch(ops: Array<{ sql: string; params?: SqlValue[] }>): Promise<RunResult[]>;
}
