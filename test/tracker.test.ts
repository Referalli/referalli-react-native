import { describe, expect, it } from 'vitest';
import { FRESH_INSTALL_WINDOW_MS, ReferalliError, ReferalliTracker, memoryStorage } from '../src/tracker.js';
import type { InstallInfo, LinkingLike } from '../src/types.js';
import { fakeApi } from './helpers.js';

const NOW = 1_800_000_000_000;

function linking(initialUrl: string | null = null) {
  const handlers = new Set<(e: { url: string }) => void>();
  const l: LinkingLike & { emit(url: string): void; handlers: typeof handlers } = {
    handlers,
    getInitialURL: async () => initialUrl,
    addEventListener: (_t, h) => {
      handlers.add(h);
      return { remove: () => handlers.delete(h) };
    },
    emit: (url) => handlers.forEach((h) => h({ url })),
  };
  return l;
}

function make(
  api: ReturnType<typeof fakeApi>,
  opts: { programId?: string; initialUrl?: string; install?: InstallInfo; deferred?: boolean; storage?: ReturnType<typeof memoryStorage> } = {},
) {
  const l = linking(opts.initialUrl ?? null);
  const tracker = new ReferalliTracker(
    'tk_test',
    { programId: opts.programId ?? 'prg_1', baseUrl: 'https://api.example/', fetch: api.fetch, deferredResolution: opts.deferred },
    {
      linking: l,
      native: opts.install ? { getInstallInfo: async () => opts.install! } : null,
      storage: opts.storage ?? memoryStorage(),
      now: () => NOW,
    },
  );
  return { tracker, linking: l };
}

const resolved = { json: { matched: true, clickId: 'clk_d', code: 'dana', destination: 'https://app.example/w' } };

describe('getReferral', () => {
  it('uses the launch link and never fingerprints', async () => {
    const api = fakeApi({ '/visit': { json: { ok: true, clickId: 'clk_7' } } });
    const { tracker } = make(api, { initialUrl: 'https://app.example/?via=dana&ref_click_id=clk_7' });
    const ref = await tracker.getReferral();
    expect(ref).toMatchObject({ clickId: 'clk_7', code: 'dana', source: 'link' });
    expect(api.count('/mobile/resolve')).toBe(0);
    expect(api.last('/visit')?.body).toMatchObject({ clickId: 'clk_7', code: 'dana' });
  });

  it('records the click for a /go link that opened the app directly', async () => {
    const api = fakeApi({ '/visit': { json: { ok: true, clickId: 'clk_new' } } });
    const { tracker } = make(api, { initialUrl: 'https://referalli.com/go/tk_test/dana' });
    expect(await tracker.getReferral()).toMatchObject({ code: 'dana', clickId: 'clk_new' });
  });

  it('uses the Play Install Referrer before the deferred resolver', async () => {
    const api = fakeApi({ '/visit': { json: { ok: true, clickId: 'clk_r' } } });
    const { tracker } = make(api, { install: { referrer: 'ref_click_id=clk_r&via=dana', firstInstallTime: NOW - 1000 } });
    expect(await tracker.getReferral()).toMatchObject({ clickId: 'clk_r', source: 'installReferrer' });
    expect(api.count('/mobile/resolve')).toBe(0);
  });

  it('falls back to one deferred lookup and stores the match', async () => {
    const api = fakeApi({ '/mobile/resolve': resolved, '/visit': { json: { ok: true, clickId: 'clk_d' } } });
    const { tracker } = make(api, { install: { referrer: 'utm_medium=organic', firstInstallTime: NOW } });
    const [a, b] = await Promise.all([tracker.getReferral(), tracker.getReferral()]);
    expect(a).toMatchObject({ clickId: 'clk_d', destination: 'https://app.example/w', source: 'deferred' });
    expect(b).toEqual(a);
    expect(await tracker.getReferral()).toEqual(a);
    expect(api.count('/mobile/resolve')).toBe(1);
    expect(api.last('/visit')?.body).toMatchObject({ clickId: 'clk_d' });
  });

  it('treats an unmatched answer as final', async () => {
    const api = fakeApi({ '/mobile/resolve': { json: { matched: false } } });
    const { tracker } = make(api);
    expect(await tracker.getReferral()).toBeNull();
    expect(await tracker.getReferral()).toBeNull();
    expect(api.count('/mobile/resolve')).toBe(1);
  });

  it('retries after a server error or network failure', async () => {
    const down = fakeApi({ '/mobile/resolve': { status: 503, json: { error: { code: 'unavailable' } } } });
    const t1 = make(down).tracker;
    expect(await t1.getReferral()).toBeNull();
    expect(await t1.getReferral()).toBeNull();
    expect(down.count('/mobile/resolve')).toBe(2);

    const offline = fakeApi({
      '/mobile/resolve': () => {
        throw new TypeError('Network request failed');
      },
    });
    const t2 = make(offline).tracker;
    expect(await t2.getReferral()).toBeNull();
    expect(await t2.getReferral()).toBeNull();
    expect(offline.count('/mobile/resolve')).toBe(2);
  });

  it('skips first-open matching for an old install and when deferred resolution is off', async () => {
    const api = fakeApi({ '/mobile/resolve': resolved });
    const old = make(api, { install: { referrer: null, firstInstallTime: NOW - FRESH_INSTALL_WINDOW_MS - 1 } }).tracker;
    expect(await old.getReferral()).toBeNull();
    const off = make(api, { deferred: false }).tracker;
    expect(await off.getReferral()).toBeNull();
    expect(api.count('/mobile/resolve')).toBe(0);
    // ...until the app calls resolveDeferred itself (e.g. after consent).
    expect(await off.resolveDeferred()).toMatchObject({ clickId: 'clk_d' });
  });

  it('captures links opened while the app runs and notifies listeners', async () => {
    const api = fakeApi({ '/visit': { json: { ok: true, clickId: 'clk_9' } } });
    const { tracker, linking: l } = make(api);
    const seen: string[] = [];
    tracker.onReferral((r) => seen.push(r.clickId ?? ''));
    l.emit('https://app.example/?ref_click_id=clk_9');
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(['clk_9']);
    expect((await tracker.storedReferral())?.clickId).toBe('clk_9');
    tracker.dispose();
    expect(l.handlers.size).toBe(0);
  });
});

describe('trackSignup', () => {
  it('identifies, then attributes through the core mobile client', async () => {
    const api = fakeApi({
      '/mobile/resolve': resolved,
      '/visit': { json: { ok: true, clickId: 'clk_d' } },
      '/identify': { json: { ok: true } },
      '/mobile/install': { json: { attributed: true, referralId: 'ref_1', partnerId: 'ptr_1' } },
    });
    const { tracker } = make(api);
    expect(await tracker.trackSignup('cus_42', { emailHash: 'h' })).toEqual({
      attributed: true,
      referralId: 'ref_1',
      partnerId: 'ptr_1',
    });
    const anonId = await tracker.anonId();
    expect(api.last('/identify')?.body).toEqual({ anonId, customerRef: 'cus_42', emailHash: 'h' });
    expect(api.last('/mobile/install')).toMatchObject({
      method: 'POST',
      path: '/t/tk_test/mobile/install',
      body: { programId: 'prg_1', customerRef: 'cus_42', clickId: 'clk_d', deviceId: anonId },
    });
  });

  it('only identifies when no program is known', async () => {
    const api = fakeApi({ '/mobile/resolve': { json: { matched: false } }, '/identify': { json: { ok: true } } });
    const tracker = new ReferalliTracker('tk_test', { fetch: api.fetch, baseUrl: 'https://api.example' }, {
      linking: null,
      native: null,
      storage: memoryStorage(),
    });
    expect((await tracker.trackSignup('cus_1')).attributed).toBe(false);
    expect(api.count('/mobile/install')).toBe(0);
    expect(api.count('/identify')).toBe(1);
  });

  it('uses the program the resolver reported when none is configured', async () => {
    const api = fakeApi({
      '/mobile/resolve': { json: { ...resolved.json, programId: 'prg_from_click' } },
      '/visit': { json: { ok: true } },
      '/identify': { json: { ok: true } },
      '/mobile/install': { json: { attributed: true, referralId: 'r', partnerId: 'p' } },
    });
    const tracker = new ReferalliTracker('tk_test', { fetch: api.fetch, baseUrl: 'https://api.example' }, {
      linking: null,
      native: null,
      storage: memoryStorage(),
    });
    await tracker.trackSignup('cus_1');
    expect(api.last('/mobile/install')?.body?.programId).toBe('prg_from_click');
  });

  it('rejects with the HTTP status when the API refuses', async () => {
    const api = fakeApi({ '/mobile/resolve': { json: { matched: false } }, '/identify': { status: 400, json: {} } });
    const { tracker } = make(api);
    const error = await tracker.trackSignup('cus_1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReferalliError);
    expect((error as ReferalliError).status).toBe(400);
  });

  it('rejects when the install call returns an error body', async () => {
    const api = fakeApi({
      '/mobile/resolve': { json: { matched: false } },
      '/identify': { json: { ok: true } },
      '/mobile/install': { status: 400, json: { error: { code: 'validation_error' } } },
    });
    await expect(make(api).tracker.trackSignup('cus_1')).rejects.toBeInstanceOf(ReferalliError);
  });
});

describe('state', () => {
  it('keeps a stable install id and forgets everything on reset', async () => {
    const storage = memoryStorage();
    const api = fakeApi({ '/visit': { json: { ok: true } } });
    const a = make(api, { storage }).tracker;
    const id = await a.anonId();
    expect(id).toMatch(/^a_[0-9a-f]{20}$/);
    expect(await make(api, { storage }).tracker.anonId()).toBe(id);
    await a.setReferral('dana');
    expect((await a.storedReferral())?.source).toBe('manual');
    await a.reset();
    expect(await a.storedReferral()).toBeNull();
    expect(await a.anonId()).not.toBe(id);
  });

  it('requires a publishable key', () => {
    expect(() => new ReferalliTracker('', {}, { linking: null, native: null, storage: memoryStorage() })).toThrow();
  });
});
