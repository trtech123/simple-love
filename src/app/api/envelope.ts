import { NextResponse } from "next/server";

export type ApiSuccessEnvelope<T = unknown> = {
  ok: true;
  data?: T;
};

export type ApiErrorEnvelope = {
  ok: false;
  code: string;
  message: string;
  details?: unknown;
};

export function apiSuccess<T>(data?: T, init?: ResponseInit) {
  const body: ApiSuccessEnvelope<T> = data === undefined ? { ok: true } : { ok: true, data };
  return NextResponse.json(body, init);
}

export function apiError(input: {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}) {
  const body: ApiErrorEnvelope =
    input.details === undefined
      ? { ok: false, code: input.code, message: input.message }
      : { ok: false, code: input.code, message: input.message, details: input.details };

  return NextResponse.json(body, { status: input.status });
}
