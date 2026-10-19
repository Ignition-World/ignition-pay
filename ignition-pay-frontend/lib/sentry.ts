import * as Sentry from '@sentry/nextjs'

export function initSentry() {
  if (process.env.NODE_ENV === 'development') {
    return
  }

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

  if (!dsn) {
    console.warn('NEXT_PUBLIC_SENTRY_DSN is not set. Sentry will not be initialized.')
    return
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    beforeSend(event) {
      if (process.env.NODE_ENV === 'development') {
        return null
      }
      return event
    },
  })
}
