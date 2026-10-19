import { createBullBoardAuthMiddleware } from '../bull-board.guard';
import { Request, Response, NextFunction } from 'express';

describe('BullBoardAuthMiddleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should allow access with correct basic auth credentials in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.BULL_BOARD_USER = 'admin';
    process.env.BULL_BOARD_PASSWORD = 'secure-password-123';

    const middleware = createBullBoardAuthMiddleware();
    
    const req = {
      headers: {
        authorization: 'Basic ' + Buffer.from('admin:secure-password-123').toString('base64'),
      },
    } as unknown as Request;

    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn(),
    } as unknown as Response;

    const next = jest.fn() as NextFunction;

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should block access and return unauthorized challenge when credentials are missing', () => {
    process.env.NODE_ENV = 'development';
    const middleware = createBullBoardAuthMiddleware();

    const req = {
      headers: {},
    } as unknown as Request;

    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn(),
    } as unknown as Response;

    const next = jest.fn() as NextFunction;

    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});