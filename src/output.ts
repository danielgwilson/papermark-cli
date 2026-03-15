function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export type CliError = {
  code: string;
  message: string;
  retryable: boolean;
  http?: { status: number };
  detail?: string;
};

export function toErrorCode(err: any): string {
  const status = err?.status as number | undefined;
  if (status === 401 || status === 403) return "AUTH_INVALID";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (typeof status === "number" && status >= 500) return "UPSTREAM_5XX";
  if (err?.name === "AbortError") return "TIMEOUT";
  return "UNKNOWN";
}

export function isRetryable(err: any): boolean {
  const code = toErrorCode(err);
  return code === "RATE_LIMITED" || code === "UPSTREAM_5XX" || code === "TIMEOUT";
}

export function makeError(err: any, { code, message }: { code?: string; message?: string } = {}): CliError {
  const status = err?.status as number | undefined;
  const errorData = err?.data as unknown;
  const resolvedCode = code || toErrorCode(err);
  const resolvedMessage = message || err?.message || "Request failed";

  const base: CliError = {
    code: resolvedCode,
    message: resolvedMessage,
    retryable: isRetryable(err),
  };

  if (typeof status === "number") base.http = { status };

  if (isObject(errorData)) {
    const detail = errorData.detail || errorData.msg || errorData.message || errorData.error;
    if (detail && String(detail) !== resolvedMessage) base.detail = String(detail);
  }

  return base;
}

export type OkEnvelope<T> = { ok: true; data: T; meta?: Record<string, unknown> };
export type FailEnvelope = { ok: false; error: CliError; meta?: Record<string, unknown> };

export function printJson(obj: unknown): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(obj, null, 2));
}

export function ok<T>(data: T, meta?: Record<string, unknown>): OkEnvelope<T> {
  return meta ? { ok: true, data, meta } : { ok: true, data };
}

export function fail(error: CliError, meta?: Record<string, unknown>): FailEnvelope {
  return meta ? { ok: false, error, meta } : { ok: false, error };
}
