import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Layout consistency guard for issue #669.
 *
 * Tailwind derives spacing utilities from a 4px step, so every margin,
 * padding, gap, inset, position and size utility must use a scale suffix
 * (`p-2`, `gap-4`, `after:left-0.5`) rather than an arbitrary bracket length
 * (`p-[10px]`). Computed / viewport values (`w-[calc(...)]`, `max-h-[80vh]`)
 * are layout constraints and deliberately allowed.
 */
const ARBITRARY_SPACING =
  /\b(?:m[trblxy]?|p[trblxy]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|bottom|left|right|size)-\[[0-9.]+(?:px|rem|em)\]/g

const SOURCE_DIRS = ['app', 'components', 'features', 'lib', 'hooks']
const SOURCE_ROOT = process.cwd()

function collectSourceFiles(dir: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }

  return entries.flatMap((entry) => {
    const fullPath = join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') return []
      return collectSourceFiles(fullPath)
    }
    if (!/\.(ts|tsx)$/.test(entry)) return []
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry)) return []
    return [fullPath]
  })
}

function findArbitrarySpacing(): string[] {
  const violations: string[] = []

  for (const dir of SOURCE_DIRS) {
    for (const file of collectSourceFiles(join(SOURCE_ROOT, dir))) {
      const contents = readFileSync(file, 'utf8')
      contents.split('\n').forEach((line, index) => {
        const matches = line.match(ARBITRARY_SPACING)
        if (!matches) return
        for (const match of matches) {
          violations.push(
            `${relative(SOURCE_ROOT, file).split(sep).join('/')}:${index + 1} ${match}`,
          )
        }
      })
    }
  }

  return violations
}

describe('spacing scale', () => {
  it('uses the 4px Tailwind scale for all spacing utilities', () => {
    expect(findArbitrarySpacing()).toEqual([])
  })
})
