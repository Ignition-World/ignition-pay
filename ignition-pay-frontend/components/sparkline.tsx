interface SparklineProps {
  /** Values ordered oldest to newest. Fewer than two points renders nothing. */
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

export function Sparkline({ points, label, trend = 'flat', className }: SparklineProps) {
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
