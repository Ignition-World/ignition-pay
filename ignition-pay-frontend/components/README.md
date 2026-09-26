# Shared components

Reusable React components used across the Ignition Pay frontend. Each
component has a usage guide with a prop table and a copy-paste example.

| Component | Purpose |
| --- | --- |
| [AssetCard](./docs/asset-card.md) | Compact summary of a single Stellar asset holding. |
| [WalletCard](./docs/wallet-card.md) | Per-asset balance card with an optional 7-day sparkline. |
| [TransactionRow](./docs/transaction-row.md) | A tappable history row that links to the transaction detail page. |
| [PortfolioSummaryCard](./docs/portfolio-summary-card.md) | Wallet header with the address, total value and refresh status. |
| [AssetAmountPicker](./docs/asset-amount-picker.md) | Asset selector plus amount input with a spendable-balance guard. |

Prop tables in these docs are generated from each component's TypeScript
interface. Regenerate them after changing a component's props:

```bash
npm run docs:components
```
