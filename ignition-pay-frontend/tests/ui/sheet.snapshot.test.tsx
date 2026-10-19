import '@testing-library/jest-dom/vitest'
import { describe, it } from 'vitest'
import { render } from '@testing-library/react'
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet'

describe('Sheet Component Snapshots', () => {
  it('renders sheet trigger', () => {
    const { container } = render(
      <Sheet>
        <SheetTrigger>Open Sheet</SheetTrigger>
      </Sheet>
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders sheet content from right side', () => {
    const { container } = render(
      <Sheet open>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Sheet Title</SheetTitle>
            <SheetDescription>Sheet description</SheetDescription>
          </SheetHeader>
          <div>Content</div>
          <SheetFooter>Footer</SheetFooter>
        </SheetContent>
      </Sheet>
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders sheet content from left side', () => {
    const { container } = render(
      <Sheet open>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>Title</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders sheet without close button', () => {
    const { container } = render(
      <Sheet open>
        <SheetContent showCloseButton={false}>
          <SheetHeader>
            <SheetTitle>Title</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    )
    expect(container.firstChild).toMatchSnapshot()
  })
})
