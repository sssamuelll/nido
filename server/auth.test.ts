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
  jwtSecret: 'test-secret-1234567890-1234567890-123456',
  isSupabaseAuthConfigured: true,
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key',
  supabaseServiceRoleKey: undefined,
  magicLinkAllowedEmails: ['samuel@example.com', 'maria@example.com'],
  appBaseUrl: 'http://localhost:3100',
  appSessionDays: 30,
  appSessionCookieName: 'nido_session',
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
import {
  login,
  authenticateToken,
  createAppSession,
  type AuthRequest,
  isMagicLinkEmailAllowed,
  sendMagicLink,
  confirmMagicLink,
  findOrCreateAppUserFromSupabase,
} from './auth.js';

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
    vi.stubGlobal('fetch', vi.fn());
    const { getDatabase } = await import('./db.js');
    mockDb = mockDbFactory();
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

  describe('magic link allowlist', () => {
    it('accepts configured emails case-insensitively', () => {
      expect(isMagicLinkEmailAllowed(' Samuel@Example.com ')).toBe(true);
      expect(isMagicLinkEmailAllowed('maria@example.com')).toBe(true);
    });

    it('rejects emails outside the configured allowlist', () => {
      expect(isMagicLinkEmailAllowed('other@example.com')).toBe(false);
    });
  });

  describe('sendMagicLink', () => {
    it('does not send for emails outside the allowlist', async () => {
      const result = await sendMagicLink('other@example.com');

      expect(result).toEqual({ success: false, reason: 'forbidden' });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('sends OTP request with the REST API redirect field and without create_user', async () => {
      (fetch as any).mockResolvedValue({ ok: true, json: vi.fn() });

      const result = await sendMagicLink('Samuel@Example.com');

      expect(result).toEqual({ success: true });
      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (fetch as any).mock.calls[0];
      expect(url).toBe('https://example.supabase.co/auth/v1/otp');
      expect(options.headers).toMatchObject({
        'Content-Type': 'application/json',
        apikey: 'anon-key',
        Authorization: 'Bearer anon-key',
      });
      expect(JSON.parse(options.body)).toEqual({
        email: 'samuel@example.com',
        email_redirect_to: 'http://localhost:3100/auth/confirm',
      });
      expect(options.body).not.toContain('create_user');
      expect(options.body).not.toContain('emailRedirectTo');
    });

    it('surfaces Supabase rate limits explicitly', async () => {
      (fetch as any).mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: vi.fn().mockResolvedValue({ code: 'over_email_send_rate_limit', msg: 'Rate limit hit' }),
      });

      const result = await sendMagicLink('samuel@example.com');

      expect(result).toEqual({
        success: false,
        reason: 'rate_limited',
        status: 429,
        error: 'Supabase rate limit reached. Please try again shortly.',
      });
    });

    it('surfaces Supabase auth errors instead of a generic upstream failure', async () => {
      (fetch as any).mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: vi.fn().mockResolvedValue({ msg: 'Email provider is disabled' }),
      });

      const result = await sendMagicLink('samuel@example.com');

      expect(result).toEqual({
        success: false,
        reason: 'auth',
        status: 400,
        error: 'Email provider is disabled',
      });
    });
  });

  describe('confirmMagicLink', () => {
    it('verifies token_hash via Supabase and returns the access token', async () => {
      (fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ access_token: 'verified-access-token' }),
      });

      const result = await confirmMagicLink('abc123', 'email');

      expect(result).toEqual({ success: true, accessToken: 'verified-access-token' });
      expect(fetch).toHaveBeenCalledWith('https://example.supabase.co/auth/v1/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: 'anon-key',
          Authorization: 'Bearer anon-key',
        },
        body: JSON.stringify({ token_hash: 'abc123', type: 'email' }),
      });
    });

    it('surfaces invalid token_hash responses as auth errors', async () => {
      (fetch as any).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: vi.fn().mockResolvedValue({ msg: 'OTP expired' }),
      });

      const result = await confirmMagicLink('expired-token', 'email');

      expect(result).toEqual({
        success: false,
        reason: 'auth',
        status: 401,
        error: 'OTP expired',
      });
    });
  });

  describe('findOrCreateAppUserFromSupabase', () => {
    it('rejects Supabase users outside the email allowlist', async () => {
      (fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'supabase-user-1', email: 'other@example.com' }),
      });

      const result = await findOrCreateAppUserFromSupabase('access-token');

      expect(result).toEqual({ success: false, reason: 'forbidden' });
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    it('surfaces invalid Supabase access tokens as auth errors', async () => {
      (fetch as any).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: vi.fn().mockResolvedValue({ msg: 'Invalid JWT' }),
      });

      const result = await findOrCreateAppUserFromSupabase('bad-access-token');

      expect(result).toEqual({
        success: false,
        reason: 'auth',
        status: 401,
        error: 'Invalid JWT',
      });
    });
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
