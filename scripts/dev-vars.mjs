import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(".dev.vars");
if (!existsSync(file)) {
  const secret = randomBytes(24).toString("base64url");
  const seedKey = randomBytes(16).toString("base64url");
  writeFileSync(file, `SESSION_SECRET=${secret}\nSEED_KEY=${seedKey}\n`);
  console.log("created .dev.vars with random dev-only secrets");
}
