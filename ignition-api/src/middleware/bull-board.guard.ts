import { Request, Response, NextFunction } from 'express';
import * as basicAuth from 'express-basic-auth';

export function createBullBoardAuthMiddleware() {
  const isProduction = process.env.NODE_ENV === 'production';
  const adminUser = process.env.BULL_BOARD_USER || 'admin';
  const adminPassword = process.env.BULL_BOARD_PASSWORD;

  if (isProduction && !adminPassword) {
    throw new Error('FATAL: BULL_BOARD_PASSWORD environment variable must be set in production.');
  }

  // If disabled in production via config flag, block access entirely
  if (isProduction && process.env.ENABLE_BULL_BOARD === 'false') {
    return (_req: Request, res: Response) => {
      res.status(404).send('Not Found');
    };
  }

  // Enforce HTTP Basic Authentication for dashboard endpoints
  return basicAuth({
    users: { [adminUser]: adminPassword || 'development-fallback-secret' },
    challenge: true,
    realm: 'Ignition Pay Queue Dashboard',
  });
}