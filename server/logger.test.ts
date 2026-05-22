import { describe, expect, it } from 'vitest';
import { sanitizeUrl } from './logger.js';

describe('sanitizeUrl', () => {
  // Background: passkey invite tokens are 64-char one-time-use secrets that
  // live in URL path segments (server/routes/passkey-invite.ts). Without
  // redaction the pino-http per-request log would emit the raw token, so a
  // persisted/aggregated log would leak any live invitation to a reader.

  it('redacts the token segment of /invite/:token', () => {
    expect(sanitizeUrl('/api/auth/invite/abc123def456'))
      .toBe('/api/auth/invite/[REDACTED]');
  });

  it('redacts the token segment but keeps trailing path segments', () => {
    expect(sanitizeUrl('/api/auth/invite/abc123/register-options'))
      .toBe('/api/auth/invite/[REDACTED]/register-options');
    expect(sanitizeUrl('/api/auth/invite/xyz789/claim'))
      .toBe('/api/auth/invite/[REDACTED]/claim');
  });

  it('preserves query strings (which never carry the token today)', () => {
    expect(sanitizeUrl('/api/auth/invite/abc123?foo=bar'))
      .toBe('/api/auth/invite/[REDACTED]?foo=bar');
  });

  it('does not match unrelated paths that merely contain "invite"', () => {
    expect(sanitizeUrl('/api/invitee/123')).toBe('/api/invitee/123');
    expect(sanitizeUrl('/invite-list')).toBe('/invite-list');
  });

  it('passes URLs without an invite segment through unchanged', () => {
    expect(sanitizeUrl('/api/expenses/42')).toBe('/api/expenses/42');
    expect(sanitizeUrl('/api/health')).toBe('/api/health');
  });

  it('handles undefined and empty input', () => {
    expect(sanitizeUrl(undefined)).toBeUndefined();
    expect(sanitizeUrl('')).toBe('');
  });
});
