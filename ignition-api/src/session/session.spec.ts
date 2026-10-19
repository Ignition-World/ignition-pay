import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import Keyv from 'keyv';
import { SessionService, SessionMetadata } from './session.service';
import { SessionController } from './session.controller';
import { SessionGuard } from './session.guard';
import { PermissionsService } from '../auth/permissions/permissions.service';

describe('Session Module', () => {
  let sessionService: SessionService;
  let sessionController: SessionController;
  let sessionGuard: SessionGuard;
  let mockCache: jest.Mocked<Pick<Keyv, 'get' | 'set' | 'delete'>>;
  let mockConfig: ConfigService;
  let mockJwt: jest.Mocked<Pick<JwtService, 'verify'>>;

  beforeEach(async () => {
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    } as any;

    mockConfig = {
      get: jest.fn().mockImplementation((key, defaultValue) => {
        if (key === 'SESSION_ACCESS_TTL_SECONDS') return 900;
        if (key === 'SESSION_TTL_SECONDS') return 604800;
        if (key === 'SESSION_IDLE_TIMEOUT_SECONDS') return 1800;
        if (key === 'JWT_SECRET') return 'secret';
        return defaultValue;
      }),
    } as any;

    mockJwt = {
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessionController],
      providers: [
        SessionService,
        SessionGuard,
        { provide: CACHE_MANAGER, useValue: mockCache },
        { provide: ConfigService, useValue: mockConfig },
        { provide: JwtService, useValue: mockJwt },
        // Issue #230 — SessionGuard now depends on PermissionsService to
        // resolve the JWT `scope` claim into req.user.scopes.
        PermissionsService,
      ],
    }).compile();

    sessionService = module.get<SessionService>(SessionService);
    sessionController = module.get<SessionController>(SessionController);
    sessionGuard = module.get<SessionGuard>(SessionGuard);
  });

  describe('SessionService', () => {
    it('should generate random session id', () => {
      const id1 = sessionService.generateSessionId();
      const id2 = sessionService.generateSessionId();
      expect(id1).toHaveLength(64);
      expect(id1).not.toEqual(id2);
    });

    it('should create and save a session', async () => {
      mockCache.get.mockResolvedValue(null);
      const params = {
        userId: 'u1',
        walletAddress: 'w1',
        role: 'USER',
        ipAddress: '127.0.0.1',
      };

      const session = await sessionService.createSession(params);

      expect(session.userId).toEqual(params.userId);
      expect(session.walletAddress).toEqual(params.walletAddress);
      expect(mockCache.set).toHaveBeenCalledTimes(2); // once for session, once for user index
    });

    it('should get session from cache', async () => {
      const mockSession: SessionMetadata = {
        sessionId: 's1',
        userId: 'u1',
        walletAddress: 'w1',
        role: 'USER',
        createdAt: Date.now(),
        expiresAt: Date.now() + 100000,
        lastSeenAt: Date.now(),
      };
      mockCache.get.mockResolvedValue(JSON.stringify(mockSession));

      const res = await sessionService.getSession('s1');
      expect(res).toEqual(mockSession);
    });

    it('should return null and revoke if session is expired', async () => {
      const mockSession: SessionMetadata = {
        sessionId: 's1',
        userId: 'u1',
        walletAddress: 'w1',
        role: 'USER',
        createdAt: Date.now() - 200000,
        expiresAt: Date.now() - 100000,
        lastSeenAt: Date.now() - 200000,
      };
      mockCache.get.mockResolvedValue(JSON.stringify(mockSession));
      mockCache.get.mockImplementation(async (key) => {
        if (key === 'user_sessions:u1') return JSON.stringify(['s1']);
        return JSON.stringify(mockSession);
      });

      const res = await sessionService.getSession('s1');
      expect(res).toBeNull();
      expect(mockCache.delete).toHaveBeenCalledWith('session:s1');
    });

    it('should handle invalid json in getSession', async () => {
      mockCache.get.mockResolvedValue('{invalid-json');
      const res = await sessionService.getSession('s1');
      expect(res).toBeNull();
    });

    it('should return null and revoke if session is idle-expired (Issue #264)', async () => {
      // idleTimeoutSeconds = 1800 (30 min) from mockConfig
      const mockSession: SessionMetadata = {
        sessionId: 's1',
        userId: 'u1',
        walletAddress: 'w1',
        role: 'USER',
        createdAt: Date.now() - 7200000,
        expiresAt: Date.now() + 100000, // absolute expiry is still valid
        lastSeenAt: Date.now() - 1801000, // but idle > 30 min
      };
      mockCache.get.mockImplementation(async (key) => {
        if (key === 'session:s1') return JSON.stringify(mockSession);
        if (key === 'user_sessions:u1') return JSON.stringify(['s1']);
        return null;
      });

      const res = await sessionService.getSession('s1');
      expect(res).toBeNull();
      expect(mockCache.delete).toHaveBeenCalledWith('session:s1');
    });

    it('should NOT revoke a session that is within the idle window (Issue #264)', async () => {
      const mockSession: SessionMetadata = {
        sessionId: 's1',
        userId: 'u1',
        walletAddress: 'w1',
        role: 'USER',
        createdAt: Date.now() - 600000,
        expiresAt: Date.now() + 100000,
        lastSeenAt: Date.now() - 300000, // 5 min ago — within 30-min window
      };
      mockCache.get.mockResolvedValue(JSON.stringify(mockSession));

      const res = await sessionService.getSession('s1');
      expect(res).toEqual(mockSession);
      expect(mockCache.delete).not.toHaveBeenCalled();
    });

    it('isIdleExpired() returns false when idleTimeoutSeconds is 0', () => {
      (mockConfig.get as jest.Mock).mockImplementation((key, def) => {
        if (key === 'SESSION_IDLE_TIMEOUT_SECONDS') return 0;
        return def;
      });
      // Re-create service with updated config mock
      const svc = new (sessionService.constructor as any)(mockCache, mockConfig);
      const session: SessionMetadata = {
        sessionId: 's1',
        userId: 'u1',
        walletAddress: 'w1',
        role: 'USER',
        createdAt: Date.now() - 9999999,
        expiresAt: Date.now() + 1000,
        lastSeenAt: Date.now() - 9999999, // very idle
      };
      expect(svc.isIdleExpired(session)).toBe(false);
    });

    it('should touch session to slide TTL', async () => {
      const mockSession: SessionMetadata = {
        sessionId: 's1',
        userId: 'u1',
        walletAddress: 'w1',
        role: 'USER',
        createdAt: Date.now(),
        expiresAt: Date.now() + 100000,
        lastSeenAt: Date.now(),
      };
      mockCache.get.mockResolvedValue(JSON.stringify(mockSession));

      await sessionService.touchSession('s1');
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should revoke all sessions', async () => {
      mockCache.get.mockResolvedValue(JSON.stringify(['s1', 's2']));
      await sessionService.revokeAllSessions('u1');
      expect(mockCache.delete).toHaveBeenCalledWith('session:s1');
      expect(mockCache.delete).toHaveBeenCalledWith('session:s2');
      expect(mockCache.delete).toHaveBeenCalledWith('user_sessions:u1');
    });

    it('should get active sessions and prune stale ones', async () => {
      mockCache.get.mockImplementation(async (key) => {
        if (key === 'user_sessions:u1') return JSON.stringify(['s1', 's2']);
        if (key === 'session:s1') {
          return JSON.stringify({
            sessionId: 's1',
            userId: 'u1',
            walletAddress: 'w1',
            role: 'USER',
            createdAt: Date.now(),
            expiresAt: Date.now() + 100000,
            lastSeenAt: Date.now(),
          });
        }
        return null; // s2 is stale/expired
      });

      const active = await sessionService.getActiveSessions('u1');
      expect(active).toHaveLength(1);
      expect(active[0].sessionId).toEqual('s1');

      // Wait a tick for unawaited pruneUserIndex to execute
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockCache.set).toHaveBeenCalledWith(
        'user_sessions:u1',
        JSON.stringify(['s1']),
        604800000,
      );
    });
  });

  describe('SessionController', () => {
    it('listSessions() should return formatted sessions', async () => {
      const req = { user: { userId: 'u1', sessionId: 's1' } } as any;
      const mockSessions = [
        {
          sessionId: 's1',
          userId: 'u1',
          walletAddress: 'w1',
          role: 'USER',
          createdAt: 1,
          lastSeenAt: 2,
          expiresAt: 3,
        } as any,
        {
          sessionId: 's2',
          userId: 'u1',
          walletAddress: 'w2',
          role: 'USER',
          createdAt: 1,
          lastSeenAt: 2,
          expiresAt: 3,
        } as any,
      ];
      jest
        .spyOn(sessionService, 'getActiveSessions')
        .mockResolvedValue(mockSessions);

      const res = await sessionController.listSessions(req);
      expect(res).toEqual([
        {
          sessionId: 's1',
          walletAddress: 'w1',
          role: 'USER',
          createdAt: 1,
          lastSeenAt: 2,
          expiresAt: 3,
          isCurrent: true,
        },
        {
          sessionId: 's2',
          walletAddress: 'w2',
          role: 'USER',
          createdAt: 1,
          lastSeenAt: 2,
          expiresAt: 3,
          isCurrent: false,
        },
      ]);
    });

    it('revokeSession() should revoke session if it belongs to user', async () => {
      const req = { user: { userId: 'u1', sessionId: 's1' } } as any;
      jest
        .spyOn(sessionService, 'getSession')
        .mockResolvedValue({ userId: 'u1', sessionId: 's2' } as any);
      const revokeSpy = jest
        .spyOn(sessionService, 'revokeSession')
        .mockResolvedValue(undefined);

      await sessionController.revokeSession(req, 's2');
      expect(revokeSpy).toHaveBeenCalledWith('u1', 's2');
    });

    it('revokeSession() should throw UnauthorizedException if req.user is missing', async () => {
      const req = {} as any;
      await expect(sessionController.revokeSession(req, 's2')).rejects.toThrow(
        new UnauthorizedException('Invalid token'),
      );
    });

    it('revokeAllSessions() should revoke all user sessions', async () => {
      const req = { user: { userId: 'u1' } } as any;
      const revokeSpy = jest
        .spyOn(sessionService, 'revokeAllSessions')
        .mockResolvedValue(undefined);

      await sessionController.revokeAllSessions(req);
      expect(revokeSpy).toHaveBeenCalledWith('u1');
    });
  });

  describe('SessionGuard', () => {
    let mockContext: ExecutionContext;
    let mockRequest: any;

    beforeEach(() => {
      mockRequest = {
        headers: {},
      };
      mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any;
    });

    it('should throw UnauthorizedException if authorization header is missing', async () => {
      await expect(sessionGuard.canActivate(mockContext)).rejects.toThrow(
        new UnauthorizedException('Missing or invalid Authorization header'),
      );
    });

    it('should throw UnauthorizedException if authorization header does not start with Bearer', async () => {
      mockRequest.headers['authorization'] = 'Basic 1234';
      await expect(sessionGuard.canActivate(mockContext)).rejects.toThrow(
        new UnauthorizedException('Missing or invalid Authorization header'),
      );
    });

    it('should throw UnauthorizedException if token verification fails', async () => {
      mockRequest.headers['authorization'] = 'Bearer invalid';
      mockJwt.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      await expect(sessionGuard.canActivate(mockContext)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired token'),
      );
    });

    it('should throw UnauthorizedException if token lacks session id', async () => {
      mockRequest.headers['authorization'] = 'Bearer valid';
      mockJwt.verify.mockReturnValue({
        sub: 'u1',
        walletAddress: 'w1',
        role: 'USER',
      });

      await expect(sessionGuard.canActivate(mockContext)).rejects.toThrow(
        new UnauthorizedException('Token is missing session identifier'),
      );
    });

    it('should throw UnauthorizedException if session is not active in cache', async () => {
      mockRequest.headers['authorization'] = 'Bearer valid';
      mockJwt.verify.mockReturnValue({
        sub: 'u1',
        walletAddress: 'w1',
        role: 'USER',
        sid: 's1',
      });
      jest.spyOn(sessionService, 'getSession').mockResolvedValue(null);

      await expect(sessionGuard.canActivate(mockContext)).rejects.toThrow(
        new UnauthorizedException('Session has expired or been revoked'),
      );
    });

    it('should return true and attach user if session is active', async () => {
      mockRequest.headers['authorization'] = 'Bearer valid';
      mockJwt.verify.mockReturnValue({
        sub: 'u1',
        walletAddress: 'w1',
        role: 'USER',
        sid: 's1',
      });
      jest
        .spyOn(sessionService, 'getSession')
        .mockResolvedValue({ userId: 'u1', sessionId: 's1' } as any);
      const touchSpy = jest
        .spyOn(sessionService, 'touchSession')
        .mockResolvedValue(undefined);

      const res = await sessionGuard.canActivate(mockContext);

      expect(res).toBe(true);
      // Issue #230 — SessionGuard now also attaches `scopes`, derived
      // from the role (no `scope` claim on this legacy token). Pin the
      // shape with objectContaining so future fields don't break this test,
      // but ALSO assert one USER-role permission is present so a silent
      // regression to empty scopes would be caught.
      expect(mockRequest.user).toEqual(
        expect.objectContaining({
          userId: 'u1',
          walletAddress: 'w1',
          role: 'USER',
          sessionId: 's1',
          scopes: expect.any(Array),
        }),
      );
      expect(mockRequest.user.scopes).toContain('wallet:read');
      expect(touchSpy).toHaveBeenCalledWith('s1');
    });
  });
});
