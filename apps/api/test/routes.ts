import type { Express } from 'express';

export interface RegisteredRoute {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
}

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
}

/**
 * Every route registered in the app, nested routers included. Lets the
 * security tests cover endpoints added later without listing them by hand.
 */
export function listRoutes(app: Express): RegisteredRoute[] {
  const routes: RegisteredRoute[] = [];
  const walk = (stack: Layer[]) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          routes.push({ method: method as RegisteredRoute['method'], path: layer.route.path });
        }
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  walk((app as unknown as { router: { stack: Layer[] } }).router.stack);
  return routes;
}

/** Fills `:param` placeholders; unknown params fail loudly so new routes get covered on purpose. */
export function fillPath(path: string, params: Record<string, string>): string {
  return path.replace(/:(\w+)/g, (_match, name: string) => {
    const value = params[name];
    if (!value) throw new Error(`The test does not know which value to give :${name} in ${path}.`);
    return value;
  });
}
