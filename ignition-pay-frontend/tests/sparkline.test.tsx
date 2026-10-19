import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Sparkline, sanitizeSparklinePoints } from '../components/sparkline'

afterEach(cleanup)

describe('Sparkline (#866)', () => {
  it('renders a valid path for ordinary data', () => {
    const { container } = render(<Sparkline points={[1, 3, 2]} label="trend" />)
    const points = container.querySelector('polyline')?.getAttribute('points') ?? ''
    expect(points).not.toMatch(/NaN|Infinity/)
    expect(points.split(' ')).toHaveLength(3)
  })

  it.each([[[]], [[5]], [[NaN, NaN]], [[Infinity, 4]]])(
    'renders nothing for empty or unusable history %j',
    (points) => {
      const { container } = render(<Sparkline points={points} label="trend" />)
      expect(container.querySelector('svg')).toBeNull()
    },
  )

  it('drops non-finite samples instead of emitting NaN coordinates', () => {
    const { container } = render(<Sparkline points={[1, NaN, 2, Infinity, 3]} label="trend" />)
    const points = container.querySelector('polyline')?.getAttribute('points') ?? ''
    expect(points).not.toMatch(/NaN|Infinity/)
    expect(points.split(' ')).toHaveLength(3)
  })

  it('tolerates missing data', () => {
    expect(sanitizeSparklinePoints(undefined)).toEqual([])
    expect(sanitizeSparklinePoints(null)).toEqual([])
  })

  it('handles a flat series without dividing by zero', () => {
    const { container } = render(<Sparkline points={[2, 2, 2]} label="flat" />)
    expect(container.querySelector('polyline')?.getAttribute('points')).not.toMatch(/NaN/)
  })
})
