import { Hono } from "hono";
import type { Db } from "./db/types.ts";
import { createErrorResponse, handleError } from "./errors.ts";
import { corsMiddleware, type AppVars } from "./middleware.ts";
import { authRoutes } from "./routes/auth.ts";
import { meetingsRoutes } from "./routes/meetings.ts";
import { agendaRoutes } from "./routes/agenda.ts";
import { auditRoutes } from "./routes/audit.ts";
import { evidenceRoutes } from "./routes/evidence.ts";
import { retentionRoutes } from "./routes/retention.ts";
import { adminRoutes } from "./routes/admin.ts";
import { aiRoutes } from "./routes/ai.ts";
import { seedAll } from "./seed.ts";

export type AppDeps = {
  db: Db;
  sessionSecret: string;
  seedKey?: string;
  environment: string;
  assets?: Fetcher;
  assetRoot?: string;
};

export function buildApp(deps: AppDeps) {
  const app = new Hono<{ Variables: AppVars }>();
  app.use("*", corsMiddleware);
  app.use("/api/*", async (c, next) => {
    c.set("deps", deps);
    await next();
  });

  app.get("/api/health", (c) =>
    c.json({ ok: true, app: "mirai-board-audit-governance", environment: deps.environment, at: new Date().toISOString() }),
  );

  app.get("/api/users", async (c) => {
    const users = await deps.db.all<Record<string, unknown>>(
      "SELECT id, name, role, title, department, outside FROM users WHERE active = 1 ORDER BY role, name",
    );
    return c.json({ items: users, total: users.length });
  });

  app.post("/api/dev/seed", async (c) => {
    const key = c.req.header("x-seed-key") ?? "";
    if (!deps.seedKey || key !== deps.seedKey) {
      return createErrorResponse(c, "FORBIDDEN", "シード実行が許可されていません", { status: 403 });
    }
    const summary = await seedAll(deps.db);
    return c.json({ ok: true, summary });
  });

  app.route("/api/auth", authRoutes());
  app.route("/api", meetingsRoutes());
  app.route("/api", agendaRoutes());
  app.route("/api", auditRoutes());
  app.route("/api", evidenceRoutes());
  app.route("/api", retentionRoutes());
  app.route("/api", adminRoutes());
  app.route("/api/ai", aiRoutes());

  app.notFound((c) => createErrorResponse(c, "NOT_FOUND", "対象が見つかりません", { status: 404 }));
  app.onError(handleError);

  return app;
}
