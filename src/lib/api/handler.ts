import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";

import { getRequestContext } from "@/server/auth/session";
import type { RequestContext } from "@/server/context";

import { AppError, isAppError } from "./errors";
import { fail, ok, REQUEST_ID_HEADER, type ApiMeta } from "./response";

export type ApiHandler<T> = (args: { request: NextRequest; ctx: RequestContext }) => Promise<T> | T;

/**
 * Wraps a route handler so every endpoint gets the same behaviour (spec §15, §16):
 *
 *  - a request-correlation ID, echoed in the header and the body's `meta`
 *  - structured request/response logging
 *  - `AppError` mapped to its status and code
 *  - `ZodError` mapped to VALIDATION_ERROR with field details
 *  - anything else logged with its stack and returned as a bare INTERNAL_ERROR,
 *    so a stack trace or SQL fragment can never reach the client
 *
 * Return the payload directly; the wrapper builds the envelope. Return a
 * `NextResponse` to take full control (used by redirects and health probes).
 */
export function withApi<T>(handler: ApiHandler<T>) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const ctx = await getRequestContext();
    const meta: ApiMeta = { requestId: ctx.requestId };
    const started = Date.now();

    const log = ctx.log.child({
      method: request.method,
      path: new URL(request.url).pathname,
    });

    try {
      const result = await handler({ request, ctx });

      if (result instanceof NextResponse) {
        result.headers.set(REQUEST_ID_HEADER, ctx.requestId);
        log.info("request.completed", { status: result.status, durationMs: Date.now() - started });
        return result;
      }

      log.info("request.completed", { status: 200, durationMs: Date.now() - started });
      return ok(result, meta);
    } catch (error) {
      return handleError(error, meta, log, started);
    }
  };
}

function handleError(
  error: unknown,
  meta: ApiMeta,
  log: RequestContext["log"],
  started: number,
): NextResponse {
  const durationMs = Date.now() - started;

  if (error instanceof ZodError) {
    log.warn("request.validation_failed", { durationMs, issues: error.issues });
    return fail("VALIDATION_ERROR", "The request contained invalid data.", 422, meta, {
      fields: flattenZodIssues(error),
    });
  }

  if (isAppError(error)) {
    // 5xx AppErrors are our fault; 4xx are the caller's. Log accordingly so
    // alerting on `level: error` stays meaningful.
    const level = error.status >= 500 ? "error" : "warn";
    log[level]("request.failed", {
      durationMs,
      code: error.code,
      status: error.status,
      cause: error.cause,
    });
    return fail(error.code, error.message, error.status, meta, error.details);
  }

  log.error("request.unhandled_error", { durationMs, error });
  return fail("INTERNAL_ERROR", "Something went wrong on our end.", 500, meta);
}

function flattenZodIssues(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

/** Parses and validates a JSON body, converting a malformed body into an AppError. */
export async function parseJsonBody<S extends ZodType>(
  request: NextRequest,
  schema: S,
): Promise<import("zod").infer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new AppError("MALFORMED_REQUEST", { message: "Request body is not valid JSON." });
  }
  return schema.parse(raw);
}

/** Parses and validates search params. */
export function parseSearchParams<S extends ZodType>(
  request: NextRequest,
  schema: S,
): import("zod").infer<S> {
  return schema.parse(Object.fromEntries(new URL(request.url).searchParams));
}
