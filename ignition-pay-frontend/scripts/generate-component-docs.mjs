#!/usr/bin/env node
/**
 * Generates component usage documentation for issue #674.
 *
 * Prop tables are derived from each component's exported `*Props` TypeScript
 * interface using the TypeScript compiler API, so types and required/optional
 * flags never drift from the code. Descriptions, defaults and copy-paste
 * examples live in the metadata below.
 *
 * Usage:
 *   node scripts/generate-component-docs.mjs           # write docs
 *   node scripts/generate-component-docs.mjs --check   # verify docs are current
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const rootDir = process.cwd()
const docsDir = path.join(rootDir, 'components', 'docs')

/**
 * Metadata for every documented component. `props` is keyed by property name
 * and supplies the human description + default; types come from the interface.
 */
const COMPONENTS = [
  {
    slug: 'asset-card',
    name: 'AssetCard',
    file: 'components/asset-card.tsx',
    interfaceName: 'AssetCardProps',
    summary: 'Compact summary of a single Stellar asset holding.',
    importPath: '@/components/asset-card',
    props: {
      code: { description: 'Asset ticker symbol, e.g. `XLM`.', default: '—' },
      issuer: { description: 'Stellar issuer account, or `native` for XLM.', default: '—' },
      balance: { description: 'Current asset balance.', default: '—' },
      value: { description: 'USD value of the balance.', default: '—' },
      change24h: {
        description: '24-hour percentage change. Omit to hide the trend badge.',
        default: '`undefined`',
      },
      hideAmounts: {
        description: 'Masks the balance and value for privacy.',
        default: '`false`',
      },
    },
    example: `import { AssetCard } from '@/components/asset-card'

export function AssetList() {
  return (
    <AssetCard
      code="XLM"
      issuer="native"
      balance={5234.5}
      value={1046.9}
      change24h={1.24}
    />
  )
}`,
  },
  {
    slug: 'wallet-card',
    name: 'WalletCard',
    file: 'components/wallet-card.tsx',
    interfaceName: 'WalletCardProps',
    summary: 'Per-asset balance card with an optional 7-day sparkline.',
    importPath: '@/components/wallet-card',
    props: {
      asset: {
        description: 'Asset with balance, value and optional price history.',
        default: '—',
      },
      hideAmounts: {
        description: 'Masks the balance and value for privacy.',
        default: '`false`',
      },
    },
    example: `import { WalletCard } from '@/components/wallet-card'
import type { AssetBalance } from '@/features/dashboard/models'

const xlm: AssetBalance = {
  code: 'XLM',
  issuer: 'native',
  balance: 5234.5,
  value: 1046.9,
  change24h: 1.24,
  history: [0.19, 0.2, 0.198, 0.205, 0.21, 0.208, 0.212],
}

export function Wallet() {
  return <WalletCard asset={xlm} />
}`,
  },
  {
    slug: 'transaction-row',
    name: 'TransactionRow',
    file: 'components/transaction-row.tsx',
    interfaceName: 'TransactionRowProps',
    summary: 'A tappable history row that links to the transaction detail page.',
    importPath: '@/components/transaction-row',
    props: {
      transaction: {
        description:
          'Transaction to render. Optimistic transactions show a pending badge.',
        default: '—',
      },
    },
    example: `import { TransactionRow } from '@/components/transaction-row'
import type { Transaction } from '@/features/history/models'

const tx: Transaction = {
  id: '1',
  type: 'received',
  asset: 'USDC',
  amount: 500,
  recipient: 'GBJCHUKZMTFSLOMNC7P4TS4VJJBTCYL3YCWKEANE7FCNHWHP6ZPWPX3',
  timestamp: new Date(),
  status: 'confirmed',
}

export function HistoryRow() {
  return <TransactionRow transaction={tx} />
}`,
  },
  {
    slug: 'portfolio-summary-card',
    name: 'PortfolioSummaryCard',
    file: 'components/portfolio-summary-card.tsx',
    interfaceName: 'PortfolioSummaryCardProps',
    summary: 'Wallet header with the address, total value and refresh status.',
    importPath: '@/components/portfolio-summary-card',
    props: {
      address: { description: 'Wallet address, truncated for display.', default: '—' },
      totalValue: { description: 'Total portfolio value in USD.', default: '—' },
      change24h: { description: '24-hour percentage change.', default: '—' },
      assetCount: { description: 'Number of assets held.', default: '—' },
      updatedAt: {
        description: 'ISO timestamp of the last refresh; `null` renders "never".',
        default: '—',
      },
      isRefreshing: {
        description: 'Shows the refreshing state and disables the refresh button.',
        default: '—',
      },
      isLive: { description: 'Shows the live-updates indicator.', default: '—' },
      hideAmounts: { description: 'Masks the total value.', default: '`false`' },
      onToggleHideAmounts: {
        description: 'Flips the shared privacy preference.',
        default: '`undefined`',
      },
      onRefresh: { description: 'Called when the refresh button is pressed.', default: '—' },
    },
    example: `import { PortfolioSummaryCard } from '@/components/portfolio-summary-card'

export function Header() {
  return (
    <PortfolioSummaryCard
      address="GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5K..."
      totalValue={1046.9}
      change24h={1.24}
      assetCount={3}
      updatedAt={new Date().toISOString()}
      isRefreshing={false}
      isLive
      onRefresh={() => {}}
    />
  )
}`,
  },
  {
    slug: 'asset-amount-picker',
    name: 'AssetAmountPicker',
    file: 'components/asset-amount-picker.tsx',
    interfaceName: 'AssetAmountPickerProps',
    summary: 'Asset selector plus amount input with a spendable-balance guard.',
    importPath: '@/components/asset-amount-picker',
    props: {
      assets: { description: 'Assets available to send.', default: '—' },
      selectedCode: { description: 'Code of the currently selected asset.', default: '—' },
      amount: { description: 'Raw amount input value.', default: '—' },
      onAssetChange: {
        description: 'Called with the new asset code when the selection changes.',
        default: '—',
      },
      onAmountChange: {
        description: 'Called with the new raw amount when the input changes.',
        default: '—',
      },
    },
    example: `'use client'

import { useState } from 'react'
import { AssetAmountPicker } from '@/components/asset-amount-picker'
import type { SendableAsset } from '@/features/send/models'

const assets: SendableAsset[] = [
  { code: 'XLM', issuer: 'native', balance: 5234.5, reserved: 1.5 },
  { code: 'USDC', issuer: 'GBBD47UZQ5ODSQIRQ73RQ5NBAYKU5NK2HRE3ENDQMAIL7UCHQVCD2Z4A', balance: 2150.75 },
]

export function SendForm() {
  const [asset, setAsset] = useState('XLM')
  const [amount, setAmount] = useState('')

  return (
    <AssetAmountPicker
      assets={assets}
      selectedCode={asset}
      amount={amount}
      onAssetChange={setAsset}
      onAmountChange={setAmount}
    />
  )
}`,
  },
]

/** Reads a component's `*Props` interface via the TypeScript compiler API. */
function extractProps(file) {
  const absolute = path.join(rootDir, file)
  const source = ts.createSourceFile(
    absolute,
    fs.readFileSync(absolute, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )

  const properties = []
  const visit = (node) => {
    if (
      ts.isInterfaceDeclaration(node) &&
      node.name.text.endsWith('Props')
    ) {
      for (const member of node.members) {
        if (!ts.isPropertySignature(member) || !member.name) continue
        properties.push({
          name: member.name.getText(source),
          type: member.type ? member.type.getText(source) : 'unknown',
          required: !member.questionToken,
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)

  // De-duplicate (declaration merging) while preserving order.
  const seen = new Set()
  return properties.filter((prop) => {
    if (seen.has(prop.name)) return false
    seen.add(prop.name)
    return true
  })
}

function renderDoc(component) {
  const extracted = extractProps(component.file)
  const rows = extracted.map((prop) => {
    const meta = component.props[prop.name] ?? {}
    const type = prop.type.replace(/\|/g, '\\|')
    return `| \`${prop.name}\` | \`${type}\` | ${prop.required ? 'Yes' : 'No'} | ${meta.default ?? '—'} | ${meta.description ?? ''} |`
  })

  return `<!-- Generated by scripts/generate-component-docs.mjs — do not edit by hand. -->

# ${component.name}

${component.summary}

**Import**

\`\`\`tsx
import { ${component.name} } from '${component.importPath}'
\`\`\`

## Props

| Prop | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
${rows.join('\n')}

## Usage

\`\`\`tsx
${component.example}
\`\`\`

---

[← All components](../README.md)
`
}

function renderReadme() {
  return `# Shared components

Reusable React components used across the Ignition Pay frontend. Each
component has a usage guide with a prop table and a copy-paste example.

| Component | Purpose |
| --- | --- |
${COMPONENTS.map((component) => `| [${component.name}](./docs/${component.slug}.md) | ${component.summary} |`).join('\n')}

Prop tables in these docs are generated from each component's TypeScript
interface. Regenerate them after changing a component's props:

\`\`\`bash
npm run docs:components
\`\`\`
`
}

function main() {
  const check = process.argv.includes('--check')
  const outputs = new Map()

  for (const component of COMPONENTS) {
    outputs.set(path.join(docsDir, `${component.slug}.md`), renderDoc(component))
  }
  outputs.set(path.join(rootDir, 'components', 'README.md'), renderReadme())

  let stale = false
  for (const [file, contents] of outputs) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
    if (current === contents) continue
    if (check) {
      stale = true
      console.error(`✗ ${path.relative(rootDir, file)} is out of date`)
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, contents)
      console.log(`✓ wrote ${path.relative(rootDir, file)}`)
    }
  }

  if (check && stale) process.exit(1)
  if (check) console.log('✓ component docs are up to date')
}

main()
