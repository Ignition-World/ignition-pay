/**
 * Filter definitions and URL synchronisation for the transaction history view
 * (Issue #665).
 *
 * The backend already supports every filter expressed here — the service layer
 * in `services/index.ts` sends `status`, `asset`, `type`, `dateFrom`, `dateTo`
 * and `search` to `GET /transactions`. What was missing was the UI and a
 * shareable representation, so this module owns:
 *
 *  - the chip/dropdown definitions, including the *real* status values the API
 *    accepts;
 *  - a pure parse/serialise pair that maps the filters onto URL query params,
 *    so a filtered view can be copied and shared.
 */

/**
 * Status chips.
 *
 * `value` is exactly what is sent as `?status=`, taken from the
 * `TransactionStatus` enum in the API's Prisma schema — the same set the
 * `GetTransactionsQueryDto` validates against. The UI labels are display names
 * only: the API has no `CONFIRMED` status, so the chip that used to be labelled
 * "Confirmed" now sends `COMPLETED`, which the API actually recognises.
 */
export const HISTORY_STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'COMPLETED', label: 'Confirmed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'PENDING', label: 'Pending' },
] as const

/** Direction chips. Sent as the service's `type` option. */
export const HISTORY_DIRECTION_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'sent', label: 'Sent' },
  { value: 'received', label: 'Received' },
] as const

/** Relative date presets plus an explicit custom range. */
export const HISTORY_DATE_PRESETS = [
  { value: 'all', label: 'All time' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom range' },
] as const

export type HistoryStatusFilter = (typeof HISTORY_STATUS_FILTERS)[number]['value']
export type HistoryDirectionFilter =
  (typeof HISTORY_DIRECTION_FILTERS)[number]['value']
export type HistoryDatePreset = (typeof HISTORY_DATE_PRESETS)[number]['value']

/** Days covered by each relative preset. `all` and `custom` are handled apart. */
const PRESET_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

export interface HistoryFilters {
  /** `all`, or a status the API accepts (COMPLETED / FAILED / PENDING / …). */
  status: HistoryStatusFilter
  /** `all`, or an asset code present in the loaded history. */
  asset: string
  /** `all`, `sent` or `received`. */
  direction: HistoryDirectionFilter
  /** Relative preset or an explicit custom range. */
  range: HistoryDatePreset
  /** Custom range start, `YYYY-MM-DD`. Only used when `range === 'custom'`. */
  from: string
  /** Custom range end, `YYYY-MM-DD`. Only used when `range === 'custom'`. */
  to: string
  /** Free-text search passed through to the API's `search` parameter. */
  search: string
}

export const DEFAULT_HISTORY_FILTERS: HistoryFilters = {
  status: 'all',
  asset: 'all',
  direction: 'all',
  range: 'all',
  from: '',
  to: '',
  search: '',
}

/** Minimal shape of both `URLSearchParams` and Next's `ReadonlyURLSearchParams`. */
interface ParamReader {
  get(name: string): string | null
}

const STATUS_VALUES = new Set<string>(
  HISTORY_STATUS_FILTERS.map((option) => option.value),
)
const DIRECTION_VALUES = new Set<string>(
  HISTORY_DIRECTION_FILTERS.map((option) => option.value),
)
const RANGE_VALUES = new Set<string>(
  HISTORY_DATE_PRESETS.map((option) => option.value),
)

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Read filters out of a query string. Unknown or malformed values fall back to
 * the default rather than being forwarded, so a hand-edited URL can never make
 * the API return 400.
 */
export function parseHistoryFilters(params: ParamReader): HistoryFilters {
  const rawStatus = params.get('status') ?? ''
  const rawDirection = params.get('dir') ?? ''
  const rawRange = params.get('range') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''

  // A bare from/to pair (no `range`) is a custom range — this keeps older
  // shared links working.
  const range: HistoryDatePreset =
    RANGE_VALUES.has(rawRange)
      ? (rawRange as HistoryDatePreset)
      : from || to
        ? 'custom'
        : 'all'

  return {
    status: (STATUS_VALUES.has(rawStatus)
      ? rawStatus
      : 'all') as HistoryStatusFilter,
    asset: params.get('asset') || 'all',
    direction: (DIRECTION_VALUES.has(rawDirection)
      ? rawDirection
      : 'all') as HistoryDirectionFilter,
    range,
    from: ISO_DATE_PATTERN.test(from) ? from : '',
    to: ISO_DATE_PATTERN.test(to) ? to : '',
    search: params.get('q') ?? '',
  }
}

/**
 * Render filters as a query string, omitting anything left at its default so
 * an unfiltered view stays a clean `/history`.
 */
export function serialiseHistoryFilters(filters: HistoryFilters): string {
  const params = new URLSearchParams()

  if (filters.status !== DEFAULT_HISTORY_FILTERS.status) {
    params.set('status', filters.status)
  }
  if (filters.asset !== DEFAULT_HISTORY_FILTERS.asset) {
    params.set('asset', filters.asset)
  }
  if (filters.direction !== DEFAULT_HISTORY_FILTERS.direction) {
    params.set('dir', filters.direction)
  }
  if (filters.range !== DEFAULT_HISTORY_FILTERS.range) {
    params.set('range', filters.range)
  }
  if (filters.range === 'custom') {
    if (filters.from) params.set('from', filters.from)
    if (filters.to) params.set('to', filters.to)
  }
  if (filters.search) {
    params.set('q', filters.search)
  }

  return params.toString()
}

export function hasActiveFilters(filters: HistoryFilters): boolean {
  return (
    filters.status !== DEFAULT_HISTORY_FILTERS.status ||
    filters.asset !== DEFAULT_HISTORY_FILTERS.asset ||
    filters.direction !== DEFAULT_HISTORY_FILTERS.direction ||
    filters.range !== DEFAULT_HISTORY_FILTERS.range ||
    filters.from !== '' ||
    filters.to !== '' ||
    filters.search !== ''
  )
}

/**
 * Turn the date filter into the `dateFrom` / `dateTo` values the API expects.
 *
 * Relative presets are resolved at call time so a shared `?range=7d` link stays
 * meaningful whenever it is opened. Custom ranges are passed through as the
 * bare `YYYY-MM-DD` the date inputs produce, which the API's `@IsDateString()`
 * validation accepts.
 */
export function resolveDateRange(
  filters: HistoryFilters,
  now: Date = new Date(),
): { dateFrom?: string; dateTo?: string } {
  if (filters.range === 'custom') {
    return {
      dateFrom: filters.from || undefined,
      dateTo: filters.to || undefined,
    }
  }

  const days = PRESET_DAYS[filters.range]
  if (!days) {
    return {}
  }

  return {
    dateFrom: new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
    dateTo: now.toISOString(),
  }
}

/**
 * Asset codes that actually occur in the loaded history, so the dropdown never
 * offers a filter that would return nothing. The currently selected asset is
 * kept in the list even when it is not present in the current page, otherwise
 * the select would silently reset the user's choice.
 */
export function availableAssets(
  transactions: { asset: string }[],
  selected: string = 'all',
): string[] {
  const assets = new Set<string>()

  for (const transaction of transactions) {
    if (transaction.asset) {
      assets.add(transaction.asset)
    }
  }

  if (selected !== 'all') {
    assets.add(selected)
  }

  return [...assets].sort((a, b) => a.localeCompare(b))
}
