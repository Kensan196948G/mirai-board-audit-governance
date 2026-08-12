import { buildApp } from "./app.ts";
import { D1Db } from "./db/d1.ts";

type WorkerEnv = Env & { SESSION_SECRET?: string; SEED_KEY?: string };

export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
    const app = buildApp({
      db: new D1Db(env.DB),
      sessionSecret: env.SESSION_SECRET ?? "",
      seedKey: env.SEED_KEY,
      environment: env.ENVIRONMENT ?? "preview",
      assets: env.ASSETS,
    });
    return app.fetch(request, env, ctx);
  },
};
