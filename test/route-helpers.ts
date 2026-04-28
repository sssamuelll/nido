import { vi } from 'vitest';

/** Fresh mock db exposing the methods used across server route tests. */
export const createMockDb = () => ({
  all: vi.fn(),
  get: vi.fn(),
  run: vi.fn(),
});
export type MockDb = ReturnType<typeof createMockDb>;

/** Chainable Express response mock with status/json/send spies. */
export const createMockResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
};

interface RouterLayer {
  route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: any }> };
}
interface RouterLike { stack: RouterLayer[] }

const findLayer = (router: RouterLike, path: string, method: string) => {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route?.methods?.[method],
  );
  if (!layer?.route) throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
  return layer;
};

/** Terminal handler (last middleware in the route stack). */
export const getRouteHandler = (
  router: RouterLike,
  path: string,
  method: 'get' | 'post' | 'put' | 'delete',
) => findLayer(router, path, method).route!.stack.at(-1)!.handle;

/** Middleware N positions before the terminal handler (default 2 → typically `validate`). */
export const getRouteMiddleware = (
  router: RouterLike,
  path: string,
  method: 'get' | 'post' | 'put' | 'delete',
  offsetFromEnd = 2,
) => findLayer(router, path, method).route!.stack.at(-offsetFromEnd)!.handle;

/** Full layer object for tests that need route metadata beyond a single handler. */
export const getRouteLayer = (
  router: RouterLike,
  path: string,
  method: 'get' | 'post' | 'put' | 'delete',
) => findLayer(router, path, method);
