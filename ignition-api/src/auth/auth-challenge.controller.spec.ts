import { Test, TestingModule } from '@nestjs/testing';
import { AuthChallengeController } from './auth-challenge.controller';
import { AuthChallengeService, ChallengeResult } from './auth-challenge.service';

describe('AuthChallengeController', () => {
  let controller: AuthChallengeController;
  let service: jest.Mocked<
    Pick<AuthChallengeService, 'issueChallenge' | 'refreshChallenge'>
  >;

  const mockResult: ChallengeResult = {
    challenge: 'ignition-pay.local:login:abc123def456:1700000000',
    expiresAt: '2024-01-15T12:05:00.000Z',
  };

  beforeEach(async () => {
    service = {
      issueChallenge: jest.fn(),
      refreshChallenge: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthChallengeController],
      providers: [{ provide: AuthChallengeService, useValue: service }],
    }).compile();

    controller = module.get<AuthChallengeController>(AuthChallengeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // GET /auth/challenge
  // ---------------------------------------------------------------------------

  describe('getChallenge', () => {
    it('delegates to issueChallenge and returns { challenge, expiresAt }', async () => {
      const query = { walletAddress: 'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF' };
      service.issueChallenge.mockResolvedValue(mockResult);

      const res = await controller.getChallenge(query);

      expect(service.issueChallenge).toHaveBeenCalledWith(query.walletAddress);
      expect(res).toEqual(mockResult);
    });

    it('returns both challenge text and expiresAt from the service (#225)', async () => {
      const query = { walletAddress: 'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF' };
      service.issueChallenge.mockResolvedValue(mockResult);

      const res = await controller.getChallenge(query);

      expect(res).toHaveProperty('challenge');
      expect(res).toHaveProperty('expiresAt');
      expect(typeof res.expiresAt).toBe('string');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /auth/challenge/refresh — Issue #225
  // ---------------------------------------------------------------------------

  describe('refreshChallenge (#225)', () => {
    it('delegates to refreshChallenge and returns { challenge, expiresAt }', async () => {
      const query = { walletAddress: 'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF' };
      const refreshedResult: ChallengeResult = {
        challenge: 'ignition-pay.local:login:newNonce:1700001000',
        expiresAt: '2024-01-15T12:10:00.000Z',
      };
      service.refreshChallenge.mockResolvedValue(refreshedResult);

      const res = await controller.refreshChallenge(query);

      expect(service.refreshChallenge).toHaveBeenCalledWith(query.walletAddress);
      expect(res).toEqual(refreshedResult);
    });

    it('returns the same challenge when no refresh is needed', async () => {
      const query = { walletAddress: 'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF' };
      // Service decides not to re-issue; same challenge returned.
      service.refreshChallenge.mockResolvedValue(mockResult);

      const res = await controller.refreshChallenge(query);

      expect(res.challenge).toBe(mockResult.challenge);
      expect(res.expiresAt).toBe(mockResult.expiresAt);
    });

    it('returns a new challenge when within the refresh window', async () => {
      const query = { walletAddress: 'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF' };
      const newChallenge: ChallengeResult = {
        challenge: 'ignition-pay.local:login:brandNew:1700001234',
        expiresAt: '2024-01-15T12:15:00.000Z',
      };
      service.refreshChallenge.mockResolvedValue(newChallenge);

      const res = await controller.refreshChallenge(query);

      expect(res.challenge).not.toBe(mockResult.challenge);
      expect(res).toEqual(newChallenge);
    });
  });
});
