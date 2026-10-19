import * as Sentry from '@sentry/nextjs'
import {
  ErrorCode,
  ErrorMessage,
  HttpStatusToErrorCode,
  type ErrorCodeType,
} from './constants/errors'

export interface ErrorContext {
  errorCode?: ErrorCodeType
  statusCode?: number
  message?: string
  [key: string]: unknown
}

export function captureError(error: Error | unknown, context?: ErrorContext) {
  if (process.env.NODE_ENV === 'development') {
    console.error('Error captured:', error, context)
    return
  }

  Sentry.captureException(error, {
    tags: {
      errorCode: context?.errorCode,
      statusCode: context?.statusCode,
    },
    extra: context,
  })
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: ErrorContext) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[${level.toUpperCase()}] ${message}`, context)
    return
  }

  Sentry.captureMessage(message, {
    level,
    tags: {
      errorCode: context?.errorCode,
      statusCode: context?.statusCode,
    },
    extra: context,
  })
}

export function setUserContext(userId: string, email?: string) {
  if (process.env.NODE_ENV === 'development') {
    return
  }

  Sentry.setUser({
    id: userId,
    email,
  })
}

export function clearUserContext() {
  if (process.env.NODE_ENV === 'development') {
    return
  }

  Sentry.setUser(null)
}

// ---------------------------------------------------------------------------
// User-facing messages
// ---------------------------------------------------------------------------

/**
 * An error that carries the HTTP status a request failed with.
 *
 * The status is what lets a caller tell "your session expired" apart from "you
 * are being rate limited" or "the server broke"; an `Error` alone loses that as
 * soon as it leaves the response object.
 */
export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message?: string) {
    super(message ?? `Request failed with status ${status}`)
    this.name = 'HttpError'
    this.status = status
  }
}

const KNOWN_CODES = new Set<string>(Object.values(ErrorCode))

/**
 * Every string this module can return. Used to keep `toUserMessage` idempotent:
 * a value that is already user-facing is passed through untouched, so it is safe
 * to apply to state a caller may have formatted already.
 */
const USER_FACING_MESSAGES = new Set<string>(Object.values(ErrorMessage))

const TIMEOUT_PATTERN = /timed?\s*out|timeout|etimedout/i
const NETWORK_PATTERN =
  /failed to fetch|fetch failed|network|offline|econnreset|econnrefused|enotfound|eai_again/i

/** Reads an application error code off anything that carries one. */
function errorCodeOf(error: unknown): ErrorCodeType | undefined {
  if (typeof error !== 'object' || error === null) return undefined

  const { code } = error as { code?: unknown }
  return typeof code === 'string' && KNOWN_CODES.has(code) ? (code as ErrorCodeType) : undefined
}

/** Reads an HTTP status off an `HttpError` or any `Response`-shaped error. */
function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined

  const candidate = error as {
    status?: unknown
    statusCode?: unknown
    response?: { status?: unknown }
  }

  for (const value of [candidate.status, candidate.statusCode, candidate.response?.status]) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599) {
      return value
    }
  }

  return undefined
}

function nameOf(error: unknown): string {
  if (error instanceof Error) return error.name
  if (typeof error === 'object' && error !== null) {
    const { name } = error as { name?: unknown }
    if (typeof name === 'string') return name
  }
  return ''
}

function textOf(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return ''
}

/**
 * Turns a thrown value into a message that is safe and useful to show a user.
 *
 * Distinct failures stay distinct: an expired session, a rate limit, a server
 * error, a timeout and a dropped connection each produce their own string, drawn
 * from the canonical `ErrorMessage` table so the wording lives in one place.
 *
 * Precedence, most specific first:
 *
 *  1. an application `ErrorCode` on the error    (e.g. `DashboardError`)
 *  2. an HTTP status, via `HttpStatusToErrorCode`
 *  3. a timeout (`TimeoutError`, `AbortError`, or timeout wording)
 *  4. a network failure (`Failed to fetch`, `NetworkError`, socket codes)
 *  5. anything else, and any non-error value  ->  the generic message
 *
 * Raw technical text is never returned, so a stack-adjacent message cannot leak
 * into the UI through this path.
 */
export function toUserMessage(error: unknown): string {
  if (typeof error === 'string' && USER_FACING_MESSAGES.has(error)) {
    return error
  }

  const code = errorCodeOf(error)
  if (code) return ErrorMessage[code]

  const status = statusOf(error)
  if (status !== undefined) {
    return ErrorMessage[HttpStatusToErrorCode[status] ?? ErrorCode.GEN_INTERNAL_ERROR]
  }

  const name = nameOf(error)
  const text = textOf(error)

  // `AbortSignal.timeout()` rejects with a `TimeoutError`, while a caller that
  // cancels its own request produces an `AbortError`. The two are composed with
  // `AbortSignal.any()` at the fetch call sites, so they are indistinguishable
  // there and both are reported as a timeout.
  if (name === 'TimeoutError' || name === 'AbortError' || TIMEOUT_PATTERN.test(text)) {
    return ErrorMessage[ErrorCode.GEN_TIMEOUT]
  }

  if (name === 'NetworkError' || NETWORK_PATTERN.test(text)) {
    return ErrorMessage[ErrorCode.GEN_NETWORK_ERROR]
  }

  return ErrorMessage[ErrorCode.GEN_INTERNAL_ERROR]
}
