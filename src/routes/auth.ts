import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sessionExpiry, signSession } from "../auth.ts";
import { AppError } from "../errors.ts";
import { authMiddleware, rateLimit, type AppVars } from "../middleware.ts";
import { permissionsFor } from "../permissions.ts";
import type { SessionUser, UserRole } from "../types.ts";

const loginSchema = z.object({
  userId: z.string().min(1),
});

function toSessionUser(row: Record<string, unknown>): SessionUser {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    role: String(row.role) as UserRole,
    title: String(row.title),
    department: String(row.department),
    outside: Number(row.outside) === 1,
    bodyIds: JSON.parse(String(row.body_ids ?? "[]")) as string[],
  };
}

export function authRoutes() {
  const app = new Hono<{ Variables: AppVars }>();
  app.use("/me", authMiddleware);

  app.post("/login", zValidator("json", loginSchema), async (c) => {
    const deps = c.get("deps");
    const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "local";
    rateLimit(`login:${ip}`);
    const { userId } = c.req.valid("json");
    const row = await deps.db.first<Record<string, unknown>>("SELECT * FROM users WHERE id = ? AND active = 1", userId);
    if (!row) {
      throw new AppError("FORBIDDEN", "認証に失敗しました", 401);
    }
    const user = toSessionUser(row);
    const token = await signSession({ sub: user.id, role: user.role, iat: Math.floor(Date.now() / 1000), exp: sessionExpiry() }, deps.sessionSecret);
    return c.json({ token, user, permissions: permissionsFor(user.role) });
  });

  app.get("/me", async (c) => {
    const user = c.get("user");
    return c.json({ user, permissions: permissionsFor(user.role) });
  });

  app.post("/logout", (c) => c.json({ ok: true }));

  return app;
}
