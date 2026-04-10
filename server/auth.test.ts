import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';

const mockDbFactory = () => ({
  get: vi.fn(),
  run: vi.fn(),
});

vi.mock('./db.js', () => ({
  getDatabase: vi.fn(() => mockDbFactory()),
  ensureSessionColumns: vi.fn(),
}));

vi.mock('./config.js', () => ({
  appBaseUrl: 'http://localhost:3100',
  appSessionDays: 30,
  appSessionCookieName: 'nido_session',
}));

vi.mock('bcryptjs', () => ({
  compare: vi.fn(),
  default: { compare: vi.fn(), hashSync: vi.fn(() => 'hashed') },
}));

import {
  authenticateToken,
  createAppSession,
  type AuthRequest,
} from './auth.js';

describe('Auth module', () => {
  let mockDb: ReturnType<typeof mockDbFactory>;
  let mockRequest: Partial<AuthRequest>;
  let mockResponse: {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  let mockNext: NextFunction;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { getDatabase } = await import('./db.js');
    mockDb = mockDbFactory();
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(mockDb);

    mockRequest = { cookies: {}, headers: {} };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  describe('createAppSession', () => {
    it('bootstraps the user_agent column once and retries on legacy databases', async () => {
      const missingColumnError = new Error('SQLITE_ERROR: table sessions has no column named user_agent');
      mockDb.run
        .mockRejectedValueOnce(missingColumnError)
        .mockResolvedValueOnce({ lastID: 1 });

      const { ensureSessionColumns } = await import('./db.js');
      const request = {
        get: vi.fn().mockReturnValue('Vitest UA'),
      } as any;

      const result = await createAppSession(42, request);

      expect(result.sessionToken).toMatch(/^[a-f0-9]{64}$/);
      expect(typeof result.expiresAt).toBe('string');
      expect(mockDb.run).toHaveBeenCalledTimes(2);
      expect(ensureSessionColumns).toHaveBeenCalledWith(mockDb);
      expect(request.get).toHaveBeenCalledWith('user-agent');
    });
  });

  describe('authenticateToken middleware', () => {
    it('returns 401 when no session cookie is present', async () => {
      await authenticateToken(mockRequest as AuthRequest, mockResponse as unknown as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 401 when session token is invalid', async () => {
      mockRequest.cookies = { nido_session: 'invalid-session-token' };
      mockDb.get.mockResolvedValue(null);

      await authenticateToken(mockRequest as AuthRequest, mockResponse as unknown as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
