// デモデータ投入スクリプト
// 使い方: npm run seed -- --url http://localhost:8787
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const url = (process.argv.indexOf("--url") >= 0 ? process.argv[process.argv.indexOf("--url") + 1] : "http://localhost:8790");
const vars = readFileSync(resolve(".dev.vars"), "utf8");
const seedKey = (vars.match(/^SEED_KEY=(.+)$/m) ?? [])[1] ?? "";
const res = await fetch(`${url}/api/dev/seed`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-seed-key": seedKey },
  body: "{}",
});
console.log(res.status, await res.text());
if (!res.ok) process.exit(1);
