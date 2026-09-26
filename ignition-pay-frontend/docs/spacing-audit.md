# Spacing scale audit

Ignition Pay uses Tailwind's 4px spacing scale for every layout value. This
document records the page-by-page audit from issue #669 and the guards that
keep spacing consistent.

## The scale

Tailwind derives spacing utilities from a single `--spacing` step of `0.25rem`
(4px), so the numeric suffix is the number of 4px units:

| Utility | Value | Utility | Value |
| ------- | ----- | ------- | ----- |
| `p-1`   | 4px   | `p-6`   | 24px  |
| `p-2`   | 8px   | `p-8`   | 32px  |
| `p-3`   | 12px  | `p-10`  | 40px  |
| `p-4`   | 16px  | `p-12`  | 48px  |
| `p-5`   | 20px  | `p-16`  | 64px  |

Half steps (`p-0.5` = 2px, `p-1.5` = 6px, `p-2.5` = 10px) are part of the
scale and stay valid.

**Do not use** arbitrary bracket lengths for spacing utilities:

```tsx
// ❌ breaks the rhythm
<div className="mt-[7px] gap-[10px] after:left-[2px]" />

// ✅ stays on the 4px scale
<div className="mt-2 gap-2.5 after:left-0.5" />
```

> Note: viewport-relative and computed values such as `max-h-[80vh]` or
> `w-[calc(100%-2rem)]` are layout constraints, not spacing tokens, and are
> allowed.

## Guards

1. **ESLint** — `no-restricted-syntax` in `eslint.config.mjs` fails the build
   when a margin, padding, gap, inset, position or size utility uses an
   arbitrary `px`/`rem`/`em` bracket value.
2. **Test** — `tests/spacing-scale.test.ts` walks every app, component and
   feature source file and asserts no arbitrary spacing values remain.

## Page-by-page audit

Audited after normalising the remaining outliers (`after:left-[2px]` →
`after:left-0.5` and `min-w-[2.75rem]` → `min-w-11`).

| Surface                                | Result | Notes                                                                 |
| -------------------------------------- | ------ | --------------------------------------------------------------------- |
| `app/dashboard` / `features/dashboard` | ✅     | Cards, grids and stats all use `p-*`, `gap-*`, `space-y-*` steps.     |
| `app/send` / `features/send`           | ✅     | Form field spacing on the 4px scale; progress rail uses `h-1`/`w-10`. |
| `app/receive` / `features/receive`     | ✅     | QR card, address and memo sections share `p-6`/`space-y-*`.           |
| `app/history` / `features/history`     | ✅     | Filter bar, stats and list rows on the scale.                         |
| `app/anchors` / `features/anchors`     | ✅     | Wizard steps and badges use scale tokens.                             |
| `app/settings` / `features/settings`   | ✅     | Section cards use `p-8`; switch track/knob normalised.                |
| `app/transactions/[id]`                | ✅     | Detail rows use `p-*` and `gap-*`.                                    |
| `components/*` (shared)                | ✅     | `theme-toggle` normalised to `min-w-11`.                              |
| `components/ui/*` (primitives)         | ✅     | Computed/radius values only; no spacing outliers.                     |
