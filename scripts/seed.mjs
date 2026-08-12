// デモデータ投入スクリプト
// 使い方: npm run seed -- --url http://localhost:8787
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const url = arg("--url") ?? "http://localhost:8790";
const envKey = process.env.SEED_KEY;
const seedKey = arg("--key") ?? envKey ?? readFileSync(resolve(".dev.vars"), "utf8").match(/^SEED_KEY=(.+)$/m)?.[1] ?? "";
const res = await fetch(`${url}/api/dev/seed`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-seed-key": seedKey },
  body: "{}",
});
console.log(res.status, await res.text());
if (!res.ok) process.exit(1);
