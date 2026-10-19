import {
  DEFAULT_WALLET_LIMITS,
  WalletLimitService,
} from './wallet-limit.service';

describe('WalletLimitService', () => {
  let service: WalletLimitService;

  beforeEach(() => {
    service = new WalletLimitService({} as never);
  });

  describe('resolveCreationLimits', () => {
    it('returns platform defaults when wallet creation omits limits', () => {
      expect(service.resolveCreationLimits()).toEqual(DEFAULT_WALLET_LIMITS);
      expect(service.resolveCreationLimits({})).toEqual(DEFAULT_WALLET_LIMITS);
    });

    it('preserves provided wallet creation limits', () => {
      expect(
        service.resolveCreationLimits({
          dailyLimit: 250,
          monthlyLimit: 2500,
        }),
      ).toEqual({
        dailyLimit: 250,
        monthlyLimit: 2500,
      });
    });
  });
});
