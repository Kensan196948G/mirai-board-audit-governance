// WebUI配信バンドルの生成（Cloudflare Pages用）
// 出力先: webui-dist/
import { cpSync, mkdirSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SRC = join(ROOT, "webui");
const OUT = join(ROOT, "webui-dist");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// webui/ 以下のファイル一式（HTML・assets）をコピー
cpSync(SRC, OUT, { recursive: true });

// 提示されたHTML4点をそのままコピー（webui配下とindex.html以外のルートHTML）
const docs = readdirSync(ROOT).filter((f) => f.endsWith(".html") && !f.startsWith("webui") && f !== "index.html");
for (const f of docs) {
  cpSync(join(ROOT, f), join(OUT, f));
}

// ルートは index.html（説明・一覧ページ）を assets が直接配信するため、_redirects は不要

// セキュリティヘッダー（Pages）
writeFileSync(
  join(OUT, "_headers"),
  `/*.html
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: SAMEORIGIN
  Cache-Control: no-cache
`,
);

console.log(`webui-dist built: ${docs.length} docs + webui files`);
