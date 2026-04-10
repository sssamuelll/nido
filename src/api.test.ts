import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api, ApiError } from './api';

describe('Api auth requests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('uses cookie credentials without an Authorization header for /auth/me', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: { id: 1, username: 'samuel' } }),
    } as Response);

    const response = await Api.getMe();

    expect(response).toEqual({ user: { id: 1, username: 'samuel' } });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-nido-request': 'true',
      },
    });
  });

  it('falls back to /auth/session when /auth/me is unavailable', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ user: { id: 2, username: 'maria' } }),
      } as Response);

    const response = await Api.getMe();

    expect(response).toEqual({ user: { id: 2, username: 'maria' } });
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/auth/me', expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/auth/session', expect.any(Object));
  });

  it('does not trigger the unauthorized handler during bootstrap 401s', async () => {
    const fetchMock = vi.mocked(fetch);
    const unauthorizedHandler = vi.fn();
    Api.setUnauthorizedHandler(unauthorizedHandler);

    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    } as Response);

    await expect(Api.getMe()).rejects.toBeInstanceOf(ApiError);
    expect(unauthorizedHandler).not.toHaveBeenCalled();
  });

  it('fetches passkeys list', async () => {
    const fetchMock = vi.mocked(fetch);
    const passkeys = [
      { id: 1, device_name: 'Chrome on Mac', created_at: '2026-03-01T00:00:00Z' },
    ];
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => passkeys,
    } as Response);

    const response = await Api.getPasskeys();

    expect(response).toEqual(passkeys);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/passkeys', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-nido-request': 'true',
      },
    });
  });
});
