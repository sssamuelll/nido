import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';

vi.mock('./db.js', () => ({
  getDatabase: vi.fn(() => ({
    get: vi.fn(),
  })),
}));

vi.mock('./config.js', () => ({
  jwtSecret: 'test-secret-1234567890-1234567890-123456',
}));

vi.mock('bcryptjs', () => ({
  compareSync: vi.fn(),
  default: { compareSync: vi.fn() },
}));

vi.mock('jsonwebtoken', () => ({
  sign: vi.fn(),
  verify: vi.fn(),
  default: { sign: vi.fn(), verify: vi.fn() },
}));

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { login, authenticateToken, type AuthRequest } from './auth.js';

describe('Auth module', () => {
  let mockDb: any;
  let mockRequest: Partial<AuthRequest>;
  let mockResponse: {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  let mockNext: NextFunction;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { getDatabase } = await import('./db.js');
    mockDb = { get: vi.fn() };
    getDatabase.mockReturnValue(mockDb);

    mockRequest = { cookies: {}, headers: {} };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  describe('login', () => {
    it('returns token and user on valid credentials', async () => {
      const mockUser = { id: 1, username: 'samuel', password: 'hashedPassword' };
      mockDb.get.mockResolvedValue(mockUser);
      (bcrypt.compareSync as any).mockReturnValue(true);
      (jwt.sign as any).mockReturnValue('fake-jwt-token');

      const result = await login('samuel', 'password123');

      expect(mockDb.get).toHaveBeenCalledWith('SELECT * FROM users WHERE username = ?', 'samuel');
      expect(bcrypt.compareSync).toHaveBeenCalledWith('password123', 'hashedPassword');
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: 1, username: 'samuel' },
        'test-secret-1234567890-1234567890-123456',
        { expiresIn: '365d' }
      );
      expect(result).toEqual({
        token: 'fake-jwt-token',
        user: { id: 1, username: 'samuel' },
      });
    });

    it('returns null if user is not found', async () => {
      mockDb.get.mockResolvedValue(null);

      const result = await login('unknown', 'password');

      expect(result).toBeNull();
      expect(bcrypt.compareSync).not.toHaveBeenCalled();
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('returns null if password mismatches', async () => {
      const mockUser = { id: 1, username: 'samuel', password: 'hashedPassword' };
      mockDb.get.mockResolvedValue(mockUser);
      (bcrypt.compareSync as any).mockReturnValue(false);

      const result = await login('samuel', 'wrongpassword');

      expect(result).toBeNull();
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('returns null on database error', async () => {
      mockDb.get.mockRejectedValue(new Error('DB error'));

      const result = await login('samuel', 'password');

      expect(result).toBeNull();
    });
  });

  describe('authenticateToken middleware', () => {
    it('accepts a valid cookie token', () => {
      mockRequest.cookies = { token: 'valid-cookie-token' };
      (jwt.verify as any).mockImplementation((_token: string, _secret: string, callback: any) => {
        callback(null, { id: 1, username: 'samuel' });
      });

      authenticateToken(mockRequest as AuthRequest, mockResponse as unknown as Response, mockNext);

      expect(jwt.verify).toHaveBeenCalledWith(
        'valid-cookie-token',
        'test-secret-1234567890-1234567890-123456',
        expect.any(Function)
      );
      expect(mockRequest.user).toEqual({ id: 1, username: 'samuel' });
      expect(mockNext).toHaveBeenCalled();
    });

    it('falls back to a bearer token when present', () => {
      mockRequest.headers = { authorization: 'Bearer valid-bearer-token' };
      (jwt.verify as any).mockImplementation((_token: string, _secret: string, callback: any) => {
        callback(null, { id: 2, username: 'maria' });
      });

      authenticateToken(mockRequest as AuthRequest, mockResponse as unknown as Response, mockNext);

      expect(jwt.verify).toHaveBeenCalledWith(
        'valid-bearer-token',
        'test-secret-1234567890-1234567890-123456',
        expect.any(Function)
      );
      expect(mockRequest.user).toEqual({ id: 2, username: 'maria' });
      expect(mockNext).toHaveBeenCalled();
    });

    it('returns 401 when no auth token is present', () => {
      authenticateToken(mockRequest as AuthRequest, mockResponse as unknown as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 401 when token verification fails', () => {
      mockRequest.cookies = { token: 'invalid-token' };
      (jwt.verify as any).mockImplementation((_token: string, _secret: string, callback: any) => {
        callback(new Error('Invalid token'), undefined);
      });

      authenticateToken(mockRequest as AuthRequest, mockResponse as unknown as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Session expired' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
