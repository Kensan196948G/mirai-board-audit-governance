import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "QUORUM"
  | "SOD"
  | "MANIFEST"
  | "AI_GUARD"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    status = 400,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function createErrorResponse(
  c: Context,
  code: ErrorCode,
  message: string,
  opts: { status?: number; details?: Record<string, unknown>; correlationId?: string } = {},
) {
  const correlationId = opts.correlationId ?? `req_${crypto.randomUUID().slice(0, 8)}`;
  return c.json(
    {
      error: {
        code,
        message,
        correlationId,
        details: opts.details ?? {},
      },
    },
    (opts.status ?? 400) as ContentfulStatusCode,
  );
}

export function handleError(err: Error, c: Context): Response {
  if (err instanceof AppError) {
    return createErrorResponse(c, err.code, err.message, { status: err.status, details: err.details });
  }
  console.error("unhandled", err);
  return createErrorResponse(c, "INTERNAL", "一時的なエラーが発生しました", { status: 500 });
}
