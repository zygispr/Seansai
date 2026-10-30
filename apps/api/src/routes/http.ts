import type { ErrorCode, ErrorResponse } from '@seansai/shared';
import type { FastifyReply } from 'fastify';
import type { z } from 'zod';

/** An error with a status and a public error code, answered as an `ErrorResponse`. */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly statusCode: number;
  readonly code: ErrorCode;

  constructor(statusCode: number, code: ErrorCode, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function errorBody(code: ErrorCode, message: string): ErrorResponse {
  return { error: { code, message } };
}

/**
 * Validates query parameters; on failure answers 400 with the error code mapped from the first
 * invalid parameter (e.g. `city` → `invalid_city`).
 */
export function parseQuery<T>(
  schema: z.ZodType<T>,
  query: unknown,
  codeByParam: Partial<Record<string, ErrorCode>>,
): T {
  const result = schema.safeParse(query);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const param = String(issue?.path[0] ?? '');
  const code = codeByParam[param];
  if (code === undefined) {
    // Every parameter a route validates must have a public error code.
    throw new Error(`No error code mapped for query parameter "${param}"`);
  }
  throw new ApiError(400, code, `${param}: ${issue?.message ?? 'invalid value'}`);
}

/** List responses may be cached for 5 minutes; ETags let clients revalidate cheaply. */
export function setListCaching(reply: FastifyReply): void {
  reply.header('cache-control', 'public, max-age=300');
}
