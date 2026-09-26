import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { createHash } from 'crypto';
import { SessionService } from './session.service';
import { PermissionsService } from '../auth/permissions/permissions.service';

export interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    walletAddress: string;
    role: string;
    sessionId: string;
    // Issue #230: scopes from the JWT `scope` claim, or the role fall-back
    // when the token predates the claim. Always defined so guards have a
    // uniform shape to consume.
    scopes: string[];
  };
}

@Injectable()
export class SessionGuard implements CanActivate {
  private readonly logger = new Logger(SessionGuard.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly sessionService: SessionService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authHeader = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );
    }

    const token = authHeader.slice(7);
    let payload: Record<string, unknown>;

    try {
      payload = this.jwt.verify(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const sessionId = payload['sid'] as string | undefined;
    if (!sessionId) {
      throw new UnauthorizedException('Token is missing session identifier');
    }

    // Validate session is still active in Redis
    const session = await this.sessionService.getSession(sessionId);
    if (!session) {
      throw new UnauthorizedException('Session has expired or been revoked');
    }

    // Issue #405 — Device binding: if the session was minted with a device
    // fingerprint, reject requests whose fingerprint does not match.  This
    // prevents session hijacking via JWT theft — the attacker would need
    // both the token *and* the exact same device fingerprint to pass.
    const currentFingerprint = this.deriveDeviceFingerprint(request);
    if (session.deviceFingerprint && currentFingerprint) {
      if (session.deviceFingerprint !== currentFingerprint) {
        this.logger.warn(
          `Device fingerprint mismatch for session ${sessionId}: ` +
            `expected=${session.deviceFingerprint} got=${currentFingerprint} ` +
            `from ${request.ip}`,
        );
        throw new UnauthorizedException(
          'Session is bound to a different device',
        );
      }
    }

    // Slide the session TTL on each use
    void this.sessionService.touchSession(sessionId);

    // Issue #230: prefer the JWT `scope` claim (least-privilege enforced by
    // the token itself), fall back to the role→permission map for legacy
    // tokens minted before the claim was introduced.
    const encodedScopes = this.permissionsService.parseScopeString(
      payload['scope'] as string | undefined,
    );
    const role = (payload['role'] as string | undefined) ?? '';
    const scopes =
      encodedScopes.length > 0
        ? encodedScopes
        : this.permissionsService.getUserPermissions(role);

    request.user = {
      userId: payload['sub'] as string,
      walletAddress: payload['walletAddress'] as string,
      role,
      sessionId,
      scopes,
    };

    return true;
  }

  /**
   * Issue #405 — Derive a stable device fingerprint from request headers.
   *
   * Combines User-Agent + Sec-CH-UA (when available) + Accept-Language into
   * a SHA-256 hash.  This is intentionally coarse — we want to detect
   * cross-device token theft, not fingerprint the exact browser version.
   */
  private deriveDeviceFingerprint(req: Request): string | null {
    const ua = req.headers['user-agent'];
    if (!ua) return null;

    const chUa = (req.headers['sec-ch-ua'] as string) ?? '';
    const lang = (req.headers['accept-language'] as string) ?? '';

    const raw = `${ua}|${chUa}|${lang}`;
    return createHash('sha256').update(raw).digest('hex').slice(0, 32);
  }
}
