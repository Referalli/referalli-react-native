import { vi } from 'vitest';

export interface Call {
  method: string;
  path: string;
  body: Record<string, string> | null;
}

/** A fetch double answering by path suffix; records every call. */
export function fakeApi(routes: Record<string, { status?: number; json: unknown } | (() => never)>) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({
      method: init?.method ?? 'GET',
      path: url.pathname,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, string>) : null,
    });
    const key = Object.keys(routes).find((k) => url.pathname.endsWith(k));
    const entry = key ? routes[key] : undefined;
    if (typeof entry === 'function') return entry();
    const route = entry;
    const status = route?.status ?? (route ? 200 : 404);
    return new Response(JSON.stringify(route?.json ?? { error: { code: 'not_found' } }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
  return {
    fetch: fetchImpl as unknown as typeof fetch,
    calls,
    count: (suffix: string) => calls.filter((c) => c.path.endsWith(suffix)).length,
    last: (suffix: string) => [...calls].reverse().find((c) => c.path.endsWith(suffix)),
  };
}
