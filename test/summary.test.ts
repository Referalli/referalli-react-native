import { describe, expect, it } from 'vitest';
import { renderHook } from './mocks/react.js';
import { ReferralPanel, useReferrerSummary } from '../src/react.js';
import { fetchReferrerSummary, ReferrerSummaryError } from '../src/summary.js';
import { fakeApi } from './helpers.js';

const me = {
  program: { id: 'prg_1', name: 'Acme', howItWorksMd: '' },
  partner: { displayName: 'Dana' },
  code: 'dana',
  canonicalCode: 'dana',
  coupon: null,
  link: 'https://acme.com/?via=dana',
  share: null,
  progress: { clicks: 4, signups: 2, payingCustomers: 1 },
  earnings: [{ currency: 'usd', pending: 100, approved: 200, paid: 300 }],
  refereeReward: null,
};
const routes = () => ({ '/v1/widget/session': { json: { token: 'wt_1', expiresAt: '2030-01-01T00:00:00Z' } }, '/widget/me': { json: me } });
const opts = (api: ReturnType<typeof fakeApi>) => ({ programId: 'prg_1', trackingToken: 'tk_1', getAuthToken: async () => 'jwt_1', fetch: api.fetch });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('fetchReferrerSummary', () => {
  it('exchanges the JWT for a widget token, then reads widget/me', async () => {
    const api = fakeApi(routes());
    expect(await fetchReferrerSummary(opts(api))).toMatchObject({ code: 'dana' });
    expect(api.last('/v1/widget/session')?.body).toEqual({ programId: 'prg_1' });
    expect(api.calls[1]?.path).toBe('/t/tk_1/widget/me');
  });
  it('fails signed out without calling the API, and on a refused session', async () => {
    const api = fakeApi(routes());
    await expect(fetchReferrerSummary({ ...opts(api), getAuthToken: () => null })).rejects.toMatchObject({ status: 0 });
    expect(api.calls).toHaveLength(0);
    const refused = fakeApi({ '/v1/widget/session': { status: 403, json: {} } });
    await expect(fetchReferrerSummary(opts(refused))).rejects.toBeInstanceOf(ReferrerSummaryError);
  });
});

describe('useReferrerSummary and ReferralPanel', () => {
  it('loads the summary and renders the panel', async () => {
    const api = fakeApi(routes());
    const hook = renderHook(() => useReferrerSummary(opts(api)));
    expect(hook.current.loading).toBe(true);
    await tick();
    expect(hook.current.summary?.link).toBe(me.link);
    const panel = renderHook(() => ReferralPanel({ ...opts(api), theme: { accent: '#f00' } }));
    expect(panel.current).toBeNull();
    await tick();
    expect(JSON.stringify(panel.current)).toContain('#f00');
    expect(JSON.stringify(panel.current)).toContain('6.00 USD');
  });
  it('reports an error and renders nothing when signed out', async () => {
    const api = fakeApi(routes());
    const hook = renderHook(() => useReferrerSummary({ ...opts(api), getAuthToken: () => null }));
    await tick();
    expect(hook.current.error).toBeInstanceOf(ReferrerSummaryError);
    expect(hook.current.summary).toBeNull();
  });
});
