import 'server-only';

import type { PostgrestError } from '@supabase/supabase-js';

/**
 * The database raises errors as `token: human readable message`, where the
 * token is stable and the prose is not. Translating them here means screens
 * branch on a code, and the Gujarati/English wording stays in the UI where it
 * belongs.
 *
 * See the header of supabase/migrations/20260914001300_rpc_registration.sql for
 * the convention and the SQLSTATE each token travels with.
 */
export const APP_ERROR_CODES = [
  'unauthenticated',
  'forbidden',
  'not_found',
  'conflict',
  'invalid',
  'incomplete',
  'unconfirmed',
  'ineligible',
  'unknown',
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export class AppError extends Error {
  readonly code: AppErrorCode;
  /** Field keys or verdicts the message listed after the colon, if any. */
  readonly detail: string[];

  constructor(code: AppErrorCode, message: string, detail: string[] = []) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.detail = detail;
  }
}

const SQLSTATE_FALLBACK: Record<string, AppErrorCode> = {
  '42501': 'forbidden',
  P0002: 'not_found',
  '23505': 'conflict',
  '23514': 'invalid',
  '23503': 'invalid',
  PGRST301: 'unauthenticated',
};

function isAppErrorCode(value: string): value is AppErrorCode {
  return (APP_ERROR_CODES as readonly string[]).includes(value);
}

export function toAppError(error: PostgrestError): AppError {
  const raw = error.message ?? '';
  const separator = raw.indexOf(':');
  const token = separator > 0 ? raw.slice(0, separator).trim() : '';
  const rest = separator > 0 ? raw.slice(separator + 1).trim() : raw;

  if (isAppErrorCode(token)) {
    // `incomplete: full_name,city` and `ineligible: excluded_shared_mosal`
    // carry a machine-readable payload; anything else is prose.
    const detail = /^[a-z0-9_,. ]+$/i.test(rest)
      ? rest.split(',').map((part) => part.trim()).filter(Boolean)
      : [];
    return new AppError(token, rest, detail);
  }

  return new AppError(SQLSTATE_FALLBACK[error.code] ?? 'unknown', raw);
}

/**
 * Throws on failure; use in the data access layer, where a throw is correct.
 *
 * PostgREST types `data` as nullable because it is null whenever `error` is
 * set. Once the error has been dealt with, it is not — so this narrows it, and
 * callers stop writing `!` on every line.
 */
export function unwrap<T>(result: { data: T; error: PostgrestError | null }): NonNullable<T> {
  if (result.error) throw toAppError(result.error);
  return result.data as NonNullable<T>;
}

/** For `.maybeSingle()`, where "no row" is an answer rather than a failure. */
export function unwrapMaybe<T>(result: { data: T; error: PostgrestError | null }): T | null {
  if (result.error) throw toAppError(result.error);
  return result.data ?? null;
}

/* ------------------------------------------------------------- actions ---- */

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; code: AppErrorCode; message: string; detail: string[] };

/**
 * Wraps a data-access call for a Server Action. Actions return values to the
 * client, so a thrown error would surface as an opaque digest; a result object
 * lets the form render the right message next to the right field.
 */
export async function actionResult<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, code: error.code, message: error.message, detail: error.detail };
    }
    // Never forward an unexpected message to the client: it may quote a row.
    console.error('unhandled action error', error);
    return { ok: false, code: 'unknown', message: 'Something went wrong.', detail: [] };
  }
}
