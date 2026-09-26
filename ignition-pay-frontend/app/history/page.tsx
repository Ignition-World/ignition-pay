import { Suspense } from 'react'
import { HistoryPage } from '@/features/history/widgets/HistoryPage'

/**
 * `HistoryPage` keeps the active filters in the URL query string via
 * `useSearchParams`, which Next.js only prerenders safely behind a Suspense
 * boundary. The fallback matches the page's own loading treatment.
 */
export default function HistoryRoute() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background">
          <div className="max-w-7xl mx-auto px-6 py-8 text-center">
            <p className="text-muted-foreground">Loading transactions…</p>
          </div>
        </div>
      }
    >
      <HistoryPage />
    </Suspense>
  )
}
