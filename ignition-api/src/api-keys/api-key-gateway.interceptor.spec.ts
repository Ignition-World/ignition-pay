import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { ApiKeyScopeInterceptor } from './api-key-gateway.interceptor';

// ─── Helpers ────────────────────────────────────────────────────────────────

const mockReflector = (scopes: string[] | undefined): Reflector =>
  ({
    getAllAndOverride: jest.fn().mockReturnValue(scopes),
  }) as unknown as Reflector;

const buildContext = (user: Record<string, unknown> | undefined): ExecutionContext =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  }) as unknown as ExecutionContext;

const callHandler = { handle: () => of('ok') };

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ApiKeyScopeInterceptor', () => {
  describe('pass-through — non API-key requests', () => {
    it('passes when there is no user on the request (public route)', () => {
      const interceptor = new ApiKeyScopeInterceptor(mockReflector(undefined));
      expect(() =>
        interceptor.intercept(buildContext(undefined), callHandler),
      ).not.toThrow();
    });

    it('passes when the user has no apiKeyId (JWT-authenticated request)', () => {
      const interceptor = new ApiKeyScopeInterceptor(mockReflector(undefined));
      const jwtUser = { id: 'user-1', role: 'user' }; // no apiKeyId
      expect(() =>
        interceptor.intercept(buildContext(jwtUser), callHandler),
      ).not.toThrow();
    });

    it('passes when apiKeyId is an empty string (treated as falsy)', () => {
      const interceptor = new ApiKeyScopeInterceptor(mockReflector(undefined));
      const user = { id: 'user-1', apiKeyId: '' };
      expect(() =>
        interceptor.intercept(buildContext(user), callHandler),
      ).not.toThrow();
    });
  });

  describe('pass-through — API-key requests with declared scope', () => {
    it('passes when @RequireScope is declared and the route has a single scope', () => {
      const interceptor = new ApiKeyScopeInterceptor(mockReflector(['read']));
      const apiKeyUser = { id: 'u', apiKeyId: 'key-123', scope: 'read' };
      expect(() =>
        interceptor.intercept(buildContext(apiKeyUser), callHandler),
      ).not.toThrow();
    });

    it('passes when @RequireScope declares multiple scopes', () => {
      const interceptor = new ApiKeyScopeInterceptor(
        mockReflector(['read', 'write']),
      );
      const apiKeyUser = { id: 'u', apiKeyId: 'key-123', scope: 'write' };
      expect(() =>
        interceptor.intercept(buildContext(apiKeyUser), callHandler),
      ).not.toThrow();
    });

    it('passes for write-scoped route', () => {
      const interceptor = new ApiKeyScopeInterceptor(mockReflector(['write']));
      const apiKeyUser = { id: 'u', apiKeyId: 'key-123', scope: 'write' };
      expect(() =>
        interceptor.intercept(buildContext(apiKeyUser), callHandler),
      ).not.toThrow();
    });

    it('passes for admin-scoped route', () => {
      const interceptor = new ApiKeyScopeInterceptor(mockReflector(['admin']));
      const apiKeyUser = { id: 'u', apiKeyId: 'key-123', scope: 'admin' };
      expect(() =>
        interceptor.intercept(buildContext(apiKeyUser), callHandler),
      ).not.toThrow();
    });
  });

  describe('blocking — API-key requests with missing @RequireScope', () => {
    it('throws ForbiddenException when @RequireScope is not declared (undefined)', () => {
      const interceptor = new ApiKeyScopeInterceptor(mockReflector(undefined));
      const apiKeyUser = { id: 'u', apiKeyId: 'key-123', scope: 'read' };
      expect(() =>
        interceptor.intercept(buildContext(apiKeyUser), callHandler),
      ).toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when @RequireScope is declared as empty array', () => {
      const interceptor = new ApiKeyScopeInterceptor(mockReflector([]));
      const apiKeyUser = { id: 'u', apiKeyId: 'key-abc', scope: 'admin' };
      expect(() =>
        interceptor.intercept(buildContext(apiKeyUser), callHandler),
      ).toThrow(ForbiddenException);
    });

    it('error message mentions @RequireScope', () => {
      const interceptor = new ApiKeyScopeInterceptor(mockReflector(undefined));
      const apiKeyUser = { id: 'u', apiKeyId: 'key-123', scope: 'write' };
      try {
        interceptor.intercept(buildContext(apiKeyUser), callHandler);
      } catch (err) {
        expect((err as ForbiddenException).message).toContain('@RequireScope');
      }
    });

    it('error message mentions the word "scope"', () => {
      const interceptor = new ApiKeyScopeInterceptor(mockReflector(undefined));
      const apiKeyUser = { id: 'u', apiKeyId: 'key-123', scope: 'read' };
      try {
        interceptor.intercept(buildContext(apiKeyUser), callHandler);
      } catch (err) {
        expect((err as ForbiddenException).message.toLowerCase()).toContain(
          'scope',
        );
      }
    });

    it('returns 403 status code in the exception', () => {
      const interceptor = new ApiKeyScopeInterceptor(mockReflector(undefined));
      const apiKeyUser = { id: 'u', apiKeyId: 'key-xyz', scope: 'admin' };
      try {
        interceptor.intercept(buildContext(apiKeyUser), callHandler);
      } catch (err) {
        expect((err as ForbiddenException).getStatus()).toBe(403);
      }
    });
  });

  describe('reflector integration', () => {
    it('calls reflector with handler and class context', () => {
      const handler = { name: 'testHandler' };
      const cls = { name: 'TestController' };
      const reflectorMock = {
        getAllAndOverride: jest.fn().mockReturnValue(['read']),
      } as unknown as Reflector;

      const ctx: ExecutionContext = {
        getHandler: () => handler,
        getClass: () => cls,
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'u', apiKeyId: 'key-123', scope: 'read' },
          }),
        }),
      } as unknown as ExecutionContext;

      const interceptor = new ApiKeyScopeInterceptor(reflectorMock);
      interceptor.intercept(ctx, callHandler);

      expect(reflectorMock.getAllAndOverride).toHaveBeenCalledWith(
        'api_key_scope',
        [handler, cls],
      );
    });

    it('does NOT call reflector when request has no API key user', () => {
      const reflectorMock = {
        getAllAndOverride: jest.fn(),
      } as unknown as Reflector;

      const interceptor = new ApiKeyScopeInterceptor(reflectorMock);
      interceptor.intercept(buildContext(undefined), callHandler);

      expect(reflectorMock.getAllAndOverride).not.toHaveBeenCalled();
    });
  });
});
