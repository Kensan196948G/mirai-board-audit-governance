import { Hono } from "hono";
import type { Db } from "./db/types.ts";
import { createErrorResponse, handleError } from "./errors.ts";

export type AppDeps = {
  db: Db;
  sessionSecret: string;
  seedKey?: string;
  environment: string;
  assets?: Fetcher;
  assetRoot?: string;
};

export function buildApp(deps: AppDeps) {
  const app = new Hono<{ Variables: { deps: AppDeps } }>();
  app.use("*", async (c, next) => {
    c.set("deps", deps);
    await next();
  });

  app.get("/api/health", (c) =>
    c.json({ ok: true, app: "mirai-board-audit-governance", environment: deps.environment, at: new Date().toISOString() }),
  );

  app.notFound((c) => createErrorResponse(c, "NOT_FOUND", "対象が見つかりません", { status: 404 }));
  app.onError(handleError);

  return app;
}
