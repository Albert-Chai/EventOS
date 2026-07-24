import { NextResponse } from "next/server";

import type { ErrorCode } from "./error-codes";

/** Spec §16 — the shape every endpoint returns, success or failure. */
export type ApiMeta = { requestId: string } & Record<string, unknown>;

export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta: ApiMeta;
};

export type ApiFailure = {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details: Record<string, unknown>;
  };
  meta: ApiMeta;
};

export type ApiResponseBody<T> = ApiSuccess<T> | ApiFailure;

export const REQUEST_ID_HEADER = "x-request-id";

export function successBody<T>(data: T, meta: ApiMeta): ApiSuccess<T> {
  return { success: true, data, meta };
}

export function failureBody(
  code: ErrorCode,
  message: string,
  meta: ApiMeta,
  details: Record<string, unknown> = {},
): ApiFailure {
  return { success: false, error: { code, message, details }, meta };
}

export function ok<T>(data: T, meta: ApiMeta, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json(successBody(data, meta), {
    status,
    headers: { [REQUEST_ID_HEADER]: meta.requestId },
  });
}

export function fail(
  code: ErrorCode,
  message: string,
  status: number,
  meta: ApiMeta,
  details: Record<string, unknown> = {},
): NextResponse<ApiFailure> {
  return NextResponse.json(failureBody(code, message, meta, details), {
    status,
    headers: { [REQUEST_ID_HEADER]: meta.requestId },
  });
}
