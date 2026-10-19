import { HttpStatus } from '@nestjs/common';
import { AuthTokenService } from './auth-token.service';
import { AuthRefreshController } from './auth-refresh.controller';
import { RefreshTokenDto } from './dto/refresh-token.dto';

describe('AuthRefreshController', () => {
  let controller: AuthRefreshController;
  let tokenService: AuthTokenService;

  beforeEach(() => {
    tokenService = {
      validateAndRotate: jest.fn(),
    } as unknown as AuthTokenService;

    controller = new AuthRefreshController(tokenService);
  });

  describe('refresh', () => {
    // Feature: token-refresh-endpoint, Property 9: Body-only acceptance — non-body token delivery is always rejected
    it('delegates to AuthTokenService.validateAndRotate', async () => {
      const dto: RefreshTokenDto = { refreshToken: 'test-token' };
      const expectedResponse = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer' as const,
      };

      (tokenService.validateAndRotate as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const result = await controller.refresh(dto);

      expect(tokenService.validateAndRotate).toHaveBeenCalledWith('test-token');
      expect(result).toEqual(expectedResponse);
    });

    it('returns HTTP 200 with token pair on success', async () => {
      const dto: RefreshTokenDto = { refreshToken: 'valid-token' };
      const expectedResponse = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        tokenType: 'Bearer' as const,
      };

      (tokenService.validateAndRotate as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const result = await controller.refresh(dto);

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.tokenType).toBe('Bearer');
    });
  });
});
