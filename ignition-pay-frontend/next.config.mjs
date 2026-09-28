import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  dryRun: process.env.NODE_ENV === 'development',
  hideSourceMaps: true,
  widenClientFileUpload: true,
  tunnelRoute: '/api/monitoring',
  disableClientWebpackPlugin: false,
  disableServerWebpackPlugin: false,
  autoInstrumentServerSideSpans: true,
  autoInstrumentClientSideSpans: true,
})
