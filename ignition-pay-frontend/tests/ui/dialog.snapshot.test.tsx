import '@testing-library/jest-dom/vitest'
import { describe, it } from 'vitest'
import { render } from '@testing-library/react'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

describe('Dialog Component Snapshots', () => {
  it('renders dialog trigger', () => {
    const { container } = render(
      <Dialog>
        <DialogTrigger>Open Dialog</DialogTrigger>
      </Dialog>
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders dialog content when open', () => {
    const { container } = render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog Title</DialogTitle>
            <DialogDescription>Dialog description</DialogDescription>
          </DialogHeader>
          <div>Content</div>
          <DialogFooter>Footer</DialogFooter>
        </DialogContent>
      </Dialog>
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders dialog without close button', () => {
    const { container } = render(
      <Dialog open>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
    expect(container.firstChild).toMatchSnapshot()
  })
})
