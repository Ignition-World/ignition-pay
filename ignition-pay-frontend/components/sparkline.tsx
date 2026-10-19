interface SparklineProps {
  /**
   * Values ordered oldest to newest. Non-finite values (NaN, Infinity) are
   * dropped; fewer than two usable points renders nothing.
   */
  points: number[]
  label: string
  trend?: 'up' | 'down' | 'flat'
  className?: string
}

const VIEWBOX_WIDTH = 100
const VIEWBOX_HEIGHT = 28

const TREND_COLORS = {
  up: 'text-green-500',
  down: 'text-red-500',
  flat: 'text-muted-foreground',
} as const

/** Keeps only finite numbers so a bad sample can't poison min/max (NaN) and the path. */
export function sanitizeSparklinePoints(points: readonly number[] | null | undefined): number[] {
  if (!Array.isArray(points)) return []
  return points.filter((point): point is number => typeof point === 'number' && Number.isFinite(point))
}

export function Sparkline({ points: rawPoints, label, trend = 'flat', className }: SparklineProps) {
  const points = sanitizeSparklinePoints(rawPoints)
  if (points.length < 2) return null

  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1

  const coordinates = points.map((point, index) => {
    const x = (index / (points.length - 1)) * VIEWBOX_WIDTH
    // SVG y grows downwards, so invert the normalised value.
    const y = VIEWBOX_HEIGHT - ((point - min) / span) * VIEWBOX_HEIGHT
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
      className={`${TREND_COLORS[trend]} ${className ?? 'h-8 w-full'}`}
    >
      <polyline
        points={coordinates.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
