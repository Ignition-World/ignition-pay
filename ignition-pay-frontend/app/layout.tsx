import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ConsentGate } from '@/components/consent-gate'
import { ToastProvider, Toaster } from '@/components/ui/toast'
import { LanguageProvider } from '@/lib/i18n'
import { themeBootstrapScript } from '@/lib/theme'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Ignition Pay - Stellar Wallet',
  description: 'A premium, cross-platform Stellar wallet for managing XLM, USDC, and anchored assets with ease',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}



export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        {/*
          Issue #627 — the page tree was rendered three times here: once inside
          LanguageProvider, once inside ToastProvider, and once bare, with
          ConsentGate mounted three times alongside it. A merge artifact.

          Beyond rendering everything in triplicate, it broke both providers. The
          first copy had no ToastProvider ancestor, so any component calling
          useToast() inside it threw "useToastManager must be used within
          <Toast.Provider>"; the second and third copies had no LanguageProvider,
          so translations fell back. It also tripled the number of useTheme
          consumers, which is what made the theme bug so easy to hit.

          One tree, both providers wrapping it, one ConsentGate.
        */}
        <LanguageProvider>
          <ToastProvider>
            {children}
            <Toaster />
            {process.env.NODE_ENV === 'production' && <ConsentGate />}
          </ToastProvider>
        </LanguageProvider>
      </body>
    </html>
  )
}
