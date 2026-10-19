import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PermissionsService } from './permissions/permissions.service';

/**
 * JWT payload shape produced by AuthTokenService. All claims EXCEPT
 * `sub` are optional so legacy tokens minted before Issue #230 still
 * parse. Downstream consumers must tolerate `undefined` on every field
 * other than `sub`. When `scope` is missing or empty, `JwtStrategy.validate`
 * falls back to the role→permission lookup so legacy tokens continue to
 * enforce the same effective permission set against `req.user.scopes`.
 */
export interface JwtPayload {
  sub: string;
  walletAddress?: string;
  email?: string;
  role?: string;
  sid?: string;
  scope?: string;
}
import { AuthTokenService } from './auth-token.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly permissionsService: PermissionsService,
    private readonly tokenService: AuthTokenService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid token');
    }

    // Issue #230: prefer the encoded `scope` claim (least-privilege enforced
    // by the token itself). If absent (legacy tokens), fall back to the
    // role→permission map so existing tokens continue to be authorized
    // against the same effective permission set.
    const encodedScopes = this.permissionsService.parseScopeString(
      payload.scope,
    );
    const scopes =
      encodedScopes.length > 0
        ? encodedScopes
        : this.permissionsService.getUserPermissions(payload.role ?? '');
    if (
      payload.sid &&
      (await this.tokenService.isAccessTokenBlacklisted(payload.sid))
    ) {
      throw new UnauthorizedException('Session has been revoked');
    }

    return {
      sub: payload.sub,
      userId: payload.sub,
      walletAddress: payload.walletAddress,
      email: payload.email,
      role: payload.role,
      sessionId: payload.sid,
      sid: payload.sid,
      scopes,
    };
  }
}
