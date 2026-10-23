import { afterEach, describe, expect, it } from 'vitest';
import Referalli, { configure, getReferral, trackSignup } from '../src/index.js';
import { NativeModules, rn } from './mocks/react-native.js';
import { fakeApi } from './helpers.js';

afterEach(() => {
  rn.initialUrl = null;
  delete NativeModules.ReferalliModule;
});

describe('public API', () => {
  it('throws a helpful error before configure', async () => {
    expect(() => getReferral()).toThrow(/configure/);
  });

  it('wires Linking and the native module (storage + install info)', async () => {
    const store = new Map<string, string>();
    NativeModules.ReferalliModule = {
      getInstallInfo: async () => ({ referrer: 'via=dana', firstInstallTime: Date.now() }),
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => void store.set(k, v),
      removeItem: async (k: string) => void store.delete(k),
    };
    const api = fakeApi({
      '/visit': { json: { ok: true, clickId: 'clk_r' } },
      '/identify': { json: { ok: true } },
      '/mobile/install': { json: { attributed: true, referralId: 'ref_1', partnerId: 'ptr_1' } },
    });
    configure('tk_test', { programId: 'prg_1', fetch: api.fetch });
    expect(await getReferral()).toMatchObject({ code: 'dana', clickId: 'clk_r', source: 'installReferrer' });
    expect(store.get('referalli.referral')).toContain('clk_r');
    expect((await trackSignup('cus_1')).attributed).toBe(true);
    expect(api.calls[0]?.path).toBe('/t/tk_test/visit');
  });

  it('captures Linking url events after configure, and reconfigure drops the old listener', async () => {
    const api = fakeApi({ '/visit': { json: { ok: true } } });
    Referalli.configure('tk_a', { fetch: api.fetch, storage: undefined });
    Referalli.configure('tk_b', { fetch: api.fetch });
    expect(rn.handlers.size).toBe(1);
    rn.emitUrl('https://app.example/?via=dana');
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(api.last('/visit')?.path).toBe('/t/tk_b/visit');
  });
});
