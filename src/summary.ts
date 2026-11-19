/** The referrer widget's data (`GET /t/{token}/widget/me`) for the signed-in customer. */
export interface ReferrerSummary {
  program: { id: string; name: string; howItWorksMd: string };
  partner: { displayName: string };
  code: string | null;
  canonicalCode: string | null;
  coupon: string | null;
  link: string | null;
  share: { x: string; facebook: string; linkedin: string; whatsapp: string; email: string } | null;
  progress: { clicks: number; signups: number; payingCustomers: number };
  earnings: Array<{ currency: string; pending: number; approved: number; paid: number }>;
  refereeReward: { kind: string; bps?: number; amountMinor?: number; capMinor?: number; currency: string; on: string } | null;
  referrals?: unknown[];
}

export interface ReferrerSummaryOptions {
  /** The program (`prg_…` or public handle); the user's session JWT is exchanged for it at `POST /v1/widget/session`. */
  programId: string;
  /** Returns the signed-in user's JWT (Atlas, Clerk, Firebase…), or null when signed out. */
  getAuthToken: () => Promise<string | null | undefined> | string | null | undefined;
  /** Your public tracking token; defaults to the one passed to `configure`. */
  trackingToken?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

let defaults: { trackingToken: string; baseUrl: string } | null = null;
/** Called by `configure` so the hook needs no repeated settings. */
export function setSummaryDefaults(trackingToken: string, baseUrl: string): void {
  defaults = { trackingToken, baseUrl };
}

/** Thrown for a refused or failed call; `status` is the HTTP status (0 when signed out). */
export class ReferrerSummaryError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ReferrerSummaryError';
  }
}

/** Exchanges the user's JWT for a widget token, then reads the summary. Same two calls as the web widget. */
export async function fetchReferrerSummary(o: ReferrerSummaryOptions): Promise<ReferrerSummary> {
  const trackingToken = o.trackingToken ?? defaults?.trackingToken;
  if (!trackingToken) throw new Error('Pass trackingToken or call Referalli.configure first');
  const base = (o.baseUrl ?? defaults?.baseUrl ?? 'https://referalli.com').replace(/\/+$/, '');
  const f = o.fetch ?? ((i: string, init?: RequestInit) => fetch(i, init));
  const jwt = await o.getAuthToken();
  if (!jwt) throw new ReferrerSummaryError('signed out', 0);
  const session = await f(`${base}/v1/widget/session`, {
    method: 'POST',
    headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
    body: JSON.stringify({ programId: o.programId }),
  });
  if (!session.ok) throw new ReferrerSummaryError('session refused', session.status);
  const { token } = (await session.json()) as { token: string };
  const me = await f(`${base}/t/${encodeURIComponent(trackingToken)}/widget/me`, { headers: { authorization: `Widget ${token}` } });
  if (!me.ok) throw new ReferrerSummaryError('summary refused', me.status);
  return (await me.json()) as ReferrerSummary;
}
