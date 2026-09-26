import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const DOCUMENTED_COMPONENTS = [
  'asset-card',
  'wallet-card',
  'transaction-row',
  'portfolio-summary-card',
  'asset-amount-picker',
]

describe('component docs (#674)', () => {
  it('are up to date with the component interfaces', () => {
    expect(() =>
      execFileSync('node', ['scripts/generate-component-docs.mjs', '--check'], {
        cwd: ROOT,
        stdio: 'pipe',
      }),
    ).not.toThrow()
  })

  it('links every component doc from components/README.md', () => {
    const readme = readFileSync(join(ROOT, 'components', 'README.md'), 'utf8')

    for (const slug of DOCUMENTED_COMPONENTS) {
      expect(existsSync(join(ROOT, 'components', 'docs', `${slug}.md`))).toBe(true)
      expect(readme).toContain(`./docs/${slug}.md`)
    }
  })

  it('documents a typed prop table and a usage example per component', () => {
    for (const slug of DOCUMENTED_COMPONENTS) {
      const doc = readFileSync(join(ROOT, 'components', 'docs', `${slug}.md`), 'utf8')
      expect(doc).toMatch(/\| Prop \| Type \| Required \| Default \| Description \|/)
      expect(doc).toContain('## Usage')
      expect(doc).toContain('```tsx')
    }
  })
})
