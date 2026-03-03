import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock dependencies (hoisted)
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

// Import after mocks
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { login, authenticateToken } from './auth.js';

describe('Auth module', () => {
  let mockDb: any;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Setup db mock
    const { getDatabase } = await import('./db.js');
    mockDb = { get: vi.fn() };
    getDatabase.mockReturnValue(mockDb);

    mockRequest = { cookies: {} }; // Updated to expect cookies
    mockResponse = { sendStatus: vi.fn() };
    mockNext = vi.fn();
  });

  describe('login', () => {
    it('should return token and user on valid credentials', async () => {
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
        { expiresIn: '365d' } // Updated to 365d
      );
      expect(result).toEqual({
        token: 'fake-jwt-token',
        user: { id: 1, username: 'samuel' },
      });
    });

    it('should return null if user not found', async () => {
      mockDb.get.mockResolvedValue(null);

      const result = await login('unknown', 'password');

      expect(result).toBeNull();
      expect(bcrypt.compareSync).not.toHaveBeenCalled();
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('should return null if password mismatch', async () => {
      const mockUser = { id: 1, username: 'samuel', password: 'hashedPassword' };
      mockDb.get.mockResolvedValue(mockUser);
      (bcrypt.compareSync as any).mockReturnValue(false);

      const result = await login('samuel', 'wrongpassword');

      expect(result).toBeNull();
      expect(bcrypt.compareSync).toHaveBeenCalledWith('wrongpassword', 'hashedPassword');
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('should return null on database error', async () => {
      mockDb.get.mockRejectedValue(new Error('DB error'));

      const result = await login('samuel', 'password');

      expect(result).toBeNull();
    });
  });

  describe('authenticateToken middleware', () => {
    it('should call next() with valid token', () => {
      mockRequest.cookies = { token: 'valid-token' }; // Updated to cookies
      (jwt.verify as any).mockImplementation((token: string, secret: string, callback: any) => {
        callback(null, { id: 1, username: 'samuel' });
      });

      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(jwt.verify).toHaveBeenCalledWith(
        'valid-token',
        'test-secret-1234567890-1234567890-123456',
        expect.any(Function)
      );
      expect(mockRequest.user).toEqual({ id: 1, username: 'samuel' });
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.sendStatus).not.toHaveBeenCalled();
    });

    it('should return 401 if no token cookie', () => { // Updated test case name
      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.sendStatus).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 if token verification fails', () => {
      mockRequest.cookies = { token: 'invalid-token' }; // Updated to cookies
      (jwt.verify as any).mockImplementation((token: string, secret: string, callback: any) => {
        callback(new Error('Invalid token'), undefined);
      });

      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.sendStatus).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});