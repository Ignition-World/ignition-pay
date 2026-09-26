import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ConsentGate } from '@/components/consent-gate'
import { ToastProvider, Toaster } from '@/components/ui/toast'
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

const themeInitScript = `
(function(){
  try {
    var root = document.documentElement;
    var stored = localStorage.getItem('theme');
    var mode = stored || 'system';
    var resolved;
    if (mode === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else {
      resolved = mode;
    }
    root.classList.toggle('dark', resolved === 'dark');
    root.style.colorScheme = resolved;

    var contrastStored = localStorage.getItem('contrast');
    if (contrastStored === 'high') {
      root.classList.add('high-contrast');
    }
  } catch(e) {}
})();
`

import { LanguageProvider } from '@/lib/i18n'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        <LanguageProvider>
          {children}
          {process.env.NODE_ENV === 'production' && <ConsentGate />}
        </LanguageProvider>
        <ToastProvider>
          {children}
          <Toaster />
        </ToastProvider>
        {process.env.NODE_ENV === 'production' && <ConsentGate />}
        {children}
        <ConsentGate />
      </body>
    </html>
  )
}
