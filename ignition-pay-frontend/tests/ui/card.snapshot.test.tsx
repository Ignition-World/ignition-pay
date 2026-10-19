import '@testing-library/jest-dom/vitest'
import { describe, it } from 'vitest'
import { render } from '@testing-library/react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'

describe('Card Component Snapshots', () => {
  it('renders basic card', () => {
    const { container } = render(
      <Card>
        <CardContent>Content</CardContent>
      </Card>
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders card with header', () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Content</CardContent>
      </Card>
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders card with footer', () => {
    const { container } = render(
      <Card>
        <CardContent>Content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders full card structure', () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card description text</CardDescription>
        </CardHeader>
        <CardContent>Card content goes here</CardContent>
        <CardFooter>Card footer actions</CardFooter>
      </Card>
    )
    expect(container.firstChild).toMatchSnapshot()
  })
})
