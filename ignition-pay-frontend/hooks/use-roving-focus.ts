'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

/** Attribute marking an element as a navigable item inside the container. */
export const ROVING_ITEM_ATTRIBUTE = 'data-roving-item'

export interface UseRovingFocusOptions {
  /** How many items the list currently renders. */
  itemCount: number
  /** Selector for the focusable item elements. */
  itemSelector?: string
}

/**
 * Roving-tabindex keyboard navigation for a vertical list (issue #628).
 *
 * The list becomes a single tab stop: Tab moves into it and straight out again,
 * and Arrow Up/Down move between items once inside. With a plain list of links
 * every row is its own tab stop, so tabbing through a page of fifty transactions
 * takes fifty presses to get past the list.
 *
 * Only one item carries `tabIndex={0}` at a time — {@link itemTabIndex} — and the
 * rest are `-1`, which is what makes the list one stop rather than N.
 *
 * Arrows clamp at the ends rather than wrapping. The list is paginated and
 * scrolls, so jumping from the last row back to the first reads as a glitch
 * rather than as navigation.
 *
 * @param options - Item count and, optionally, the item selector.
 * @returns A ref for the container, its `onKeyDown`, and a tabIndex helper.
 */
export function useRovingFocus<T extends HTMLElement = HTMLElement>({
  itemCount,
  itemSelector = `[${ROVING_ITEM_ATTRIBUTE}]`,
}: UseRovingFocusOptions) {
  const containerRef = useRef<T | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  // Keep the active index inside the list when it shrinks — a filter change can
  // leave it pointing past the end, which would strand the only tab stop.
  useEffect(() => {
    setActiveIndex((current) => {
      if (itemCount === 0) return 0
      return current > itemCount - 1 ? itemCount - 1 : current
    })
  }, [itemCount])

  const itemsOf = useCallback((): HTMLElement[] => {
    const container = containerRef.current
    if (!container) return []
    return Array.from(container.querySelectorAll<HTMLElement>(itemSelector))
  }, [itemSelector])

  const focusIndex = useCallback(
    (index: number) => {
      const items = itemsOf()
      const target = items[index]
      if (!target) return
      setActiveIndex(index)
      target.focus()
    },
    [itemsOf],
  )

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      const items = itemsOf()
      if (items.length === 0) return

      // Prefer where focus actually is over the tracked index: a click or a
      // screen-reader jump can move focus without going through this handler.
      const focused = items.indexOf(document.activeElement as HTMLElement)
      const from = focused === -1 ? activeIndex : focused

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          focusIndex(Math.min(from + 1, items.length - 1))
          break
        case 'ArrowUp':
          event.preventDefault()
          focusIndex(Math.max(from - 1, 0))
          break
        case 'Home':
          event.preventDefault()
          focusIndex(0)
          break
        case 'End':
          event.preventDefault()
          focusIndex(items.length - 1)
          break
        case ' ':
        case 'Spacebar':
          // An anchor activates on Enter but not on Space, and a list that moves
          // with the arrows is expected to open with either.
          event.preventDefault()
          items[from]?.click()
          break
        default:
          break
      }
    },
    [activeIndex, focusIndex, itemsOf],
  )

  /**
   * tabIndex for the item at `index`.
   *
   * @param index - Position in the list.
   * @returns 0 for the active item, -1 for the rest.
   */
  const itemTabIndex = useCallback(
    (index: number) => (index === activeIndex ? 0 : -1),
    [activeIndex],
  )

  return { containerRef, activeIndex, onKeyDown, itemTabIndex, focusIndex }
}
