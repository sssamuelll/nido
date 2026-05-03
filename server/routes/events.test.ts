import { describe, expect, it, vi } from 'vitest';
import { getRouteMiddleware, createMockResponse } from '../../test/route-helpers';
import eventsRouter from './events.js';

describe('GET /api/events — wiring (Decision 6B)', () => {
  it('validateQuery middleware rejects ?context=household with HTTP 400', () => {
    const middleware = getRouteMiddleware(eventsRouter, '/', 'get', 2);
    const req: any = { query: { context: 'household' } };
    const res = createMockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Error de validación' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('validateQuery middleware accepts ?context=personal and calls next()', () => {
    const middleware = getRouteMiddleware(eventsRouter, '/', 'get', 2);
    const req: any = { query: { context: 'personal' } };
    const res = createMockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });
});
