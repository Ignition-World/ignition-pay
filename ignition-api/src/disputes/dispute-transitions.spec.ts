import { UnprocessableEntityException } from '@nestjs/common';
import { DisputeStatus } from './entities/dispute.entity';
import {
  DISPUTE_TRANSITIONS,
  RESOLVABLE_DISPUTE_STATUSES,
  TERMINAL_DISPUTE_STATUSES,
  allowedTransitions,
  assertTransitionAllowed,
  isValidTransition,
} from './dispute-transitions';

const ALL_STATUSES = Object.values(DisputeStatus);

/** Every edge the map declares as legal. */
const VALID_EDGES: Array<[DisputeStatus, DisputeStatus]> = [
  // OPEN (legacy "new dispute" state)
  [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW],
  [DisputeStatus.OPEN, DisputeStatus.RESOLVED],
  [DisputeStatus.OPEN, DisputeStatus.RESOLVED_REFUNDED],
  [DisputeStatus.OPEN, DisputeStatus.RESOLVED_REJECTED],
  [DisputeStatus.OPEN, DisputeStatus.REJECTED],
  // OPENED (the column default for a newly filed dispute)
  [DisputeStatus.OPENED, DisputeStatus.UNDER_REVIEW],
  [DisputeStatus.OPENED, DisputeStatus.RESOLVED],
  [DisputeStatus.OPENED, DisputeStatus.RESOLVED_REFUNDED],
  [DisputeStatus.OPENED, DisputeStatus.RESOLVED_REJECTED],
  [DisputeStatus.OPENED, DisputeStatus.REJECTED],
  // UNDER_REVIEW
  [DisputeStatus.UNDER_REVIEW, DisputeStatus.RESOLVED],
  [DisputeStatus.UNDER_REVIEW, DisputeStatus.RESOLVED_REFUNDED],
  [DisputeStatus.UNDER_REVIEW, DisputeStatus.RESOLVED_REJECTED],
  [DisputeStatus.UNDER_REVIEW, DisputeStatus.REJECTED],
];

describe('dispute transition map', () => {
  it('declares a target list for every enum member', () => {
    for (const status of ALL_STATUSES) {
      expect(Array.isArray(DISPUTE_TRANSITIONS[status])).toBe(true);
    }
    expect(Object.keys(DISPUTE_TRANSITIONS).sort()).toEqual(
      [...ALL_STATUSES].sort(),
    );
  });

  it('lists only known statuses as targets', () => {
    for (const status of ALL_STATUSES) {
      for (const target of DISPUTE_TRANSITIONS[status]) {
        expect(ALL_STATUSES).toContain(target);
      }
    }
  });

  it('does not allow a dispute to transition to itself', () => {
    for (const status of ALL_STATUSES) {
      expect(DISPUTE_TRANSITIONS[status]).not.toContain(status);
    }
  });

  it('treats every terminal status as a dead end', () => {
    for (const status of TERMINAL_DISPUTE_STATUSES) {
      expect(DISPUTE_TRANSITIONS[status]).toEqual([]);
    }
    expect([...TERMINAL_DISPUTE_STATUSES].sort()).toEqual(
      [
        DisputeStatus.RESOLVED,
        DisputeStatus.RESOLVED_REFUNDED,
        DisputeStatus.RESOLVED_REJECTED,
        DisputeStatus.REJECTED,
      ].sort(),
    );
  });

  it('allows resolving from exactly the non-terminal statuses', () => {
    expect([...RESOLVABLE_DISPUTE_STATUSES].sort()).toEqual(
      [
        DisputeStatus.OPEN,
        DisputeStatus.OPENED,
        DisputeStatus.UNDER_REVIEW,
      ].sort(),
    );
  });
});

describe('isValidTransition — every valid edge', () => {
  it.each(VALID_EDGES)('allows %s -> %s', (from, to) => {
    expect(isValidTransition(from, to)).toBe(true);
    expect(allowedTransitions(from)).toContain(to);
    expect(() => assertTransitionAllowed('dispute-1', from, to)).not.toThrow();
  });
});

describe('isValidTransition — every invalid edge', () => {
  const VALID = new Set(VALID_EDGES.map(([from, to]) => `${from}->${to}`));

  const INVALID_EDGES = ALL_STATUSES.flatMap((from) =>
    ALL_STATUSES.filter((to) => !VALID.has(`${from}->${to}`)),
  );

  it('covers every remaining combination of the 7x7 status space', () => {
    expect(VALID_EDGES.length + INVALID_EDGES.length).toBe(
      ALL_STATUSES.length * ALL_STATUSES.length,
    );
    expect(INVALID_EDGES).toHaveLength(49 - 14);
  });

  it.each(INVALID_EDGES)('rejects %s -> %s', (from, to) => {
    expect(isValidTransition(from, to)).toBe(false);
    expect(allowedTransitions(from)).not.toContain(to);
  });

  it.each(INVALID_EDGES)(
    'throws 422 UnprocessableEntity for %s -> %s',
    (from, to) => {
      expect(() => assertTransitionAllowed('dispute-9', from, to)).toThrow(
        UnprocessableEntityException,
      );
    },
  );

  it('answers 422, not 400, for an illegal edge', () => {
    try {
      assertTransitionAllowed(
        'dispute-9',
        DisputeStatus.RESOLVED_REFUNDED,
        DisputeStatus.RESOLVED_REJECTED,
      );
      fail('expected a UnprocessableEntityException');
    } catch (err) {
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      expect((err as UnprocessableEntityException).getStatus()).toBe(422);
    }
  });

  it('explains a terminal source status', () => {
    expect(() =>
      assertTransitionAllowed(
        'dispute-9',
        DisputeStatus.RESOLVED,
        DisputeStatus.UNDER_REVIEW,
      ),
    ).toThrow(/terminal status/);
  });

  it('lists the allowed targets when the source is not terminal', () => {
    expect(() =>
      assertTransitionAllowed(
        'dispute-9',
        DisputeStatus.OPENED,
        DisputeStatus.OPENED,
      ),
    ).toThrow(/Allowed transitions from OPENED/);
  });

  it('names the dispute and both statuses in the message', () => {
    expect(() =>
      assertTransitionAllowed(
        'dispute-9',
        DisputeStatus.REJECTED,
        DisputeStatus.UNDER_REVIEW,
      ),
    ).toThrow(/dispute-9.*REJECTED.*UNDER_REVIEW/);
  });
});

describe('allowedTransitions', () => {
  it('returns an empty list for a status outside the map', () => {
    expect(allowedTransitions('NOT_A_STATUS' as DisputeStatus)).toEqual([]);
  });

  it('cannot be used to mutate the map', () => {
    expect(Object.isFrozen(DISPUTE_TRANSITIONS)).toBe(true);
    expect(Object.isFrozen(allowedTransitions(DisputeStatus.OPEN))).toBe(true);
  });
});
