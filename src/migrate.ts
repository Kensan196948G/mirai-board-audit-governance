import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "./db/types.ts";

export async function applyMigrations(db: Db, dir: string): Promise<string[]> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8");
    await db.exec(sql);
  }
  return files;
}
