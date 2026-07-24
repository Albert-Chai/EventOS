/**
 * Structured logger (spec §30).
 *
 * Hand-rolled rather than pino: this module is imported from middleware, which
 * runs in the Edge runtime where pino's Node internals are unavailable. Seventy
 * lines of JSON.stringify beats a dependency we would have to work around.
 *
 * Production emits one JSON object per line for log-aggregator ingestion.
 * Development pretty-prints.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogFields = Record<string, unknown>;

/**
 * Keys whose values are replaced before serialisation. Matching is on the
 * lowercased key name and is substring-based, so `access_token`,
 * `refreshToken`, and `Authorization` are all caught.
 */
const REDACT_SUBSTRINGS = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "credential",
  "session",
];

/**
 * Anything named `*key` as well: `supabaseServiceRoleKey`, `stripeApiKey`,
 * `anonKey`, `privateKey`. A suffix match rather than a substring one so
 * ordinary words like `keyword` are not swallowed.
 */
const REDACT_SUFFIXES = ["key"];

const REDACTED = "[redacted]";

function shouldRedact(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    REDACT_SUBSTRINGS.some((needle) => lower.includes(needle)) ||
    REDACT_SUFFIXES.some((suffix) => lower.endsWith(suffix))
  );
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = shouldRedact(key) ? REDACTED : redact(val, depth + 1);
  }
  return out;
}

function resolveMinLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL as LogLevel | undefined;
  if (configured && configured in LEVEL_ORDER) return configured;
  if (process.env.NODE_ENV === "test") return "warn";
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

export type Logger = {
  debug: (message: string, fields?: LogFields) => void;
  info: (message: string, fields?: LogFields) => void;
  warn: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
  /** Returns a logger that merges `bindings` into every subsequent entry. */
  child: (bindings: LogFields) => Logger;
};

function createLogger(bindings: LogFields = {}): Logger {
  const minLevel = LEVEL_ORDER[resolveMinLevel()];
  const pretty = process.env.NODE_ENV !== "production";

  const emit = (level: LogLevel, message: string, fields?: LogFields) => {
    if (LEVEL_ORDER[level] < minLevel) return;

    const entry = {
      level,
      time: new Date().toISOString(),
      message,
      ...(redact({ ...bindings, ...fields }) as LogFields),
    };

    const line = pretty
      ? `${level.toUpperCase().padEnd(5)} ${message}${
          Object.keys(entry).length > 3
            ? ` ${JSON.stringify(redact({ ...bindings, ...fields }))}`
            : ""
        }`
      : JSON.stringify(entry);

    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
  };

  return {
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
    child: (extra) => createLogger({ ...bindings, ...extra }),
  };
}

export const logger = createLogger({ service: "eventos" });
