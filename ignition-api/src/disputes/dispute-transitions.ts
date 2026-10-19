import { UnprocessableEntityException } from '@nestjs/common';
import { DisputeStatus } from './entities/dispute.entity';

/**
 * Single source of truth for dispute status transitions (issue #620).
 *
 * Every status change in this module is validated against this map, so the
 * legal lifecycle is stated once instead of being re-derived from inline
 * `if` checks at each call site.
 *
 * Mapping the issue's vocabulary onto the enum that actually exists
 * ------------------------------------------------------------------
 * The issue describes `OPENED -> UNDER_REVIEW -> RESOLVED | REJECTED`. The
 * `DisputeStatus` enum persisted by this service has seven members, and they
 * are NOT renamed here because doing so would be a data migration:
 *
 *   OPEN                 legacy "new dispute" state
 *   OPENED               the column default for a newly filed dispute
 *   UNDER_REVIEW         an admin has picked the dispute up
 *   RESOLVED             generic terminal state
 *   RESOLVED_REFUNDED    terminal, money moved back to the donor
 *   RESOLVED_REJECTED    terminal, dispute dismissed, no money moved
 *   REJECTED             terminal, dispute rejected as invalid
 *
 * So the issue's `OPENED` maps to the `OPENED` member, and the issue's
 * `REJECTED` maps to the `REJECTED` member while the existing resolve endpoint
 * keeps writing `RESOLVED_REJECTED` for a rejected outcome. `RESOLVED_REFUNDED`
 * and `RESOLVED_REJECTED` are the more specific terminal states the resolve
 * endpoint actually produces, and both are legal targets of a review.
 *
 * `REJECTED` is a legal target in the map (that is the issue's `OPENED ->
 * REJECTED` edge) but nothing writes it yet; `resolveDispute` has no
 * "reject as invalid" route. Adding one needs a new controller endpoint.
 */
export const DISPUTE_TRANSITIONS: Readonly<
  Record<DisputeStatus, readonly DisputeStatus[]>
> = Object.freeze({
  [DisputeStatus.OPEN]: Object.freeze([
    DisputeStatus.UNDER_REVIEW,
    DisputeStatus.RESOLVED,
    DisputeStatus.RESOLVED_REFUNDED,
    DisputeStatus.RESOLVED_REJECTED,
    DisputeStatus.REJECTED,
  ]),
  [DisputeStatus.OPENED]: Object.freeze([
    DisputeStatus.UNDER_REVIEW,
    DisputeStatus.RESOLVED,
    DisputeStatus.RESOLVED_REFUNDED,
    DisputeStatus.RESOLVED_REJECTED,
    DisputeStatus.REJECTED,
  ]),
  [DisputeStatus.UNDER_REVIEW]: Object.freeze([
    DisputeStatus.RESOLVED,
    DisputeStatus.RESOLVED_REFUNDED,
    DisputeStatus.RESOLVED_REJECTED,
    DisputeStatus.REJECTED,
  ]),
  [DisputeStatus.RESOLVED]: Object.freeze([]),
  [DisputeStatus.RESOLVED_REFUNDED]: Object.freeze([]),
  [DisputeStatus.RESOLVED_REJECTED]: Object.freeze([]),
  [DisputeStatus.REJECTED]: Object.freeze([]),
});

/** Statuses a dispute can never leave. */
export const TERMINAL_DISPUTE_STATUSES: readonly DisputeStatus[] =
  Object.freeze(
    (Object.keys(DISPUTE_TRANSITIONS) as DisputeStatus[]).filter(
      (status) => DISPUTE_TRANSITIONS[status].length === 0,
    ),
  );

/** Statuses from which a dispute can still be resolved. */
export const RESOLVABLE_DISPUTE_STATUSES: readonly DisputeStatus[] =
  Object.freeze(
    (Object.keys(DISPUTE_TRANSITIONS) as DisputeStatus[]).filter(
      (status) =>
        DISPUTE_TRANSITIONS[status].includes(DisputeStatus.RESOLVED_REFUNDED) ||
        DISPUTE_TRANSITIONS[status].includes(DisputeStatus.RESOLVED_REJECTED),
    ),
  );

/** Statuses reachable in one step from `from`. */
export function allowedTransitions(
  from: DisputeStatus,
): readonly DisputeStatus[] {
  return DISPUTE_TRANSITIONS[from] ?? [];
}

/** Whether `from -> to` is a legal edge. A no-op (from === to) is illegal. */
export function isValidTransition(
  from: DisputeStatus,
  to: DisputeStatus,
): boolean {
  return allowedTransitions(from).includes(to);
}

/**
 * Throw a 422 for an illegal edge.
 *
 * 422 rather than 400: the request is syntactically valid and the dispute
 * exists, it is the state change the client asked for that cannot be applied.
 */
export function assertTransitionAllowed(
  disputeId: string,
  from: DisputeStatus,
  to: DisputeStatus,
): void {
  if (isValidTransition(from, to)) {
    return;
  }

  const allowed = allowedTransitions(from);
  const hint =
    allowed.length > 0
      ? `Allowed transitions from ${from}: ${allowed.join(', ')}.`
      : `${from} is a terminal status and cannot change.`;

  throw new UnprocessableEntityException(
    `Cannot transition dispute ${disputeId} from ${from} to ${to}. ${hint}`,
  );
}
