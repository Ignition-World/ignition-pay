import * as Sentry from '@sentry/nextjs'
import type { ErrorCodeType } from './constants/errors'

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
