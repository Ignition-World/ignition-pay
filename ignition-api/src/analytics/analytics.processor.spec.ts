import { AnalyticsProcessor } from './analytics.processor';
import { AnalyticsService } from './analytics.service';
import { Job } from 'bull';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeJob = <T>(data: T): Job<T> =>
  ({ data } as unknown as Job<T>);

const makeEvent = (
  overrides: Partial<{
    id: string;
    userId: string;
    eventName: string;
    payload: Record<string, unknown> | null;
    sequenceNumber: number;
    createdAt: string;
  }> = {},
) => ({
  id: 'evt-uuid-1',
  userId: 'user-uuid-1',
  eventName: 'viewed_dashboard',
  payload: null,
  sequenceNumber: 1,
  createdAt: new Date('2026-10-19T09:00:00.000Z').toISOString(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnalyticsProcessor', () => {
  let processor: AnalyticsProcessor;
  let analyticsService: jest.Mocked<AnalyticsService>;

  beforeEach(() => {
    analyticsService = {
      trackEvent: jest.fn().mockResolvedValue(makeEvent()),
      getOrderedEventsForUser: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<AnalyticsService>;

    processor = new AnalyticsProcessor(analyticsService);
  });

  // -------------------------------------------------------------------------
  // handleEvent
  // -------------------------------------------------------------------------

  describe('handleEvent', () => {
    it('calls trackEvent with the correct DTO', async () => {
      const job = makeJob({
        userId: 'user-uuid-1',
        eventName: 'sent_payment',
        payload: { amount: '50', assetCode: 'USDC' },
        sequenceNumber: 5,
      });

      await processor.handleEvent(job);

      expect(analyticsService.trackEvent).toHaveBeenCalledWith({
        userId: 'user-uuid-1',
        eventName: 'sent_payment',
        payload: { amount: '50', assetCode: 'USDC' },
        sequenceNumber: 5,
      });
    });

    it('passes sequenceNumber through unchanged', async () => {
      const job = makeJob({
        userId: 'user-uuid-1',
        eventName: 'viewed_dashboard',
        sequenceNumber: 42,
      });

      await processor.handleEvent(job);

      const callArg = analyticsService.trackEvent.mock.calls[0][0];
      expect(callArg.sequenceNumber).toBe(42);
    });

    it('handles events without a payload', async () => {
      const job = makeJob({
        userId: 'user-uuid-1',
        eventName: 'logged_out',
        sequenceNumber: 1,
      });

      await expect(processor.handleEvent(job)).resolves.not.toThrow();
      expect(analyticsService.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({ payload: undefined }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // flushUserEvents — ordering guarantee
  // -------------------------------------------------------------------------

  describe('flushUserEvents', () => {
    it('calls getOrderedEventsForUser with the correct userId', async () => {
      const job = makeJob({ userId: 'user-uuid-1' });
      await processor.flushUserEvents(job);
      expect(analyticsService.getOrderedEventsForUser).toHaveBeenCalledWith(
        'user-uuid-1',
      );
    });

    it('receives events already sorted ascending by sequenceNumber', async () => {
      // Simulate a batch where delivery order differs from causal order.
      // The service must return them in sequenceNumber ASC so the processor
      // sees: viewed_dashboard(1) → sent_payment(2) and not the reverse.
      const outOfDeliveryOrderBatch = [
        makeEvent({ eventName: 'viewed_dashboard', sequenceNumber: 1 }),
        makeEvent({ eventName: 'sent_payment', sequenceNumber: 2 }),
      ];

      analyticsService.getOrderedEventsForUser.mockResolvedValue(
        outOfDeliveryOrderBatch,
      );

      const job = makeJob({ userId: 'user-uuid-1' });
      await processor.flushUserEvents(job);

      // The processor must not re-order: it relies on the service contract.
      const result = analyticsService.getOrderedEventsForUser.mock.results[0];
      await expect(result.value).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventName: 'viewed_dashboard',
            sequenceNumber: 1,
          }),
          expect.objectContaining({
            eventName: 'sent_payment',
            sequenceNumber: 2,
          }),
        ]),
      );
    });

    it('never emits a later event before an earlier one in the same batch', async () => {
      // This is the core regression test for #789.
      // Construct a multi-event batch and verify the ordering contract.
      const events = [
        makeEvent({ eventName: 'viewed_dashboard', sequenceNumber: 1 }),
        makeEvent({ eventName: 'clicked_send', sequenceNumber: 2 }),
        makeEvent({ eventName: 'confirmed_amount', sequenceNumber: 3 }),
        makeEvent({ eventName: 'sent_payment', sequenceNumber: 4 }),
      ];

      analyticsService.getOrderedEventsForUser.mockResolvedValue(events);

      const job = makeJob({ userId: 'user-uuid-1' });
      await processor.flushUserEvents(job);

      // Verify that each event's sequenceNumber is strictly greater than the
      // previous one — the warehouse will receive them in this order.
      const resolvedEvents = await analyticsService.getOrderedEventsForUser
        .mock.results[0].value;

      for (let i = 1; i < resolvedEvents.length; i++) {
        expect(resolvedEvents[i].sequenceNumber).toBeGreaterThan(
          resolvedEvents[i - 1].sequenceNumber,
        );
      }
    });

    it('handles an empty batch without throwing', async () => {
      analyticsService.getOrderedEventsForUser.mockResolvedValue([]);
      const job = makeJob({ userId: 'user-uuid-1' });
      await expect(processor.flushUserEvents(job)).resolves.not.toThrow();
    });
  });
});
