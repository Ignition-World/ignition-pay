import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AnchorsPage from '../features/anchors/widgets/AnchorsPage'

describe('AnchorsPage', () => {
  it('renders SEP support badges and health status for available anchors', () => {
    render(<AnchorsPage />)

    expect(screen.getAllByText('SEP-24').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Online').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Maintenance').length).toBeGreaterThan(0)
  })
})
