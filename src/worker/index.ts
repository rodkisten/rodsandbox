import { Elysia } from 'elysia';

const api = new Elysia({ prefix: '/api', aot: false })
  .get('/health', () => ({ status: 'ok', service: 'rodsandbox', runtime: 'cloudflare-worker' }))
  .get('/capabilities', () => ({ browserBuild: true, remoteTerminal: false, remoteSync: false }))
  .get('/registry/metadata', async ({ query, set }) => {
    const name = query.name;
    if (typeof name !== 'string' || name.length > 214 || !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name)) {
      set.status = 400;
      return { error: 'Invalid package name' };
    }
    try {
      const response = await fetch('https://registry.npmjs.org/' + encodeURIComponent(name), {
        headers: { Accept: 'application/vnd.npm.install-v1+json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        set.status = response.status === 404 ? 404 : 502;
        return { error: 'Registry request failed' };
      }
      const data = await response.json() as { name?: string; 'dist-tags'?: Record<string, string>; versions?: Record<string, unknown> };
      set.headers['cache-control'] = 'public, max-age=300';
      return { name: data.name ?? name, tags: data['dist-tags'] ?? {}, versions: Object.keys(data.versions ?? {}) };
    } catch {
      set.status = 502;
      return { error: 'Registry unavailable' };
    }
  })
  .all('*', ({ set }) => { set.status = 404; return { error: 'API route not found' }; });

export default {
  fetch(request: Request): Response | Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/ws/')) return new Response('Remote gateway not configured', { status: 503 });
    return api.handle(request);
  },
};
