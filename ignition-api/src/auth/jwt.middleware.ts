import {
  Injectable,
  NestMiddleware,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class JwtMiddleware implements NestMiddleware {
  private readonly logger = new Logger(JwtMiddleware.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  use(req: Request & { user?: unknown }, _res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];

    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      // Issue #404 — log missing / malformed Authorization headers so
      // token-abuse attempts are visible in security audit logs.
      this.logger.warn(
        `Malformed or missing Authorization header from ${req.ip} ` +
          `(${req.method} ${req.path}) — ` +
          `user-agent: ${req.headers['user-agent'] ?? 'unknown'}`,
      );
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );
    }

    const token = authHeader.slice(7);

    try {
      const payload = this.jwt.verify(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
      req.user = payload;
      next();
    } catch (error) {
      // Issue #404 — log the specific verification failure for each
      // malformed / expired / invalid token so the abuse pattern is
      // visible in security audit logs.
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.warn(
        `JWT verification failed (${errorName}): ${errorMessage} ` +
          `from ${req.ip} (${req.method} ${req.path})`,
      );

      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token has expired');
      }
      throw new UnauthorizedException('Invalid token');
    }
  }
}
