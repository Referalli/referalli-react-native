import { createMobileClient } from 'referalli';
import { parseInstallReferrer, parseLink } from './attribution.js';
import type {
  ConfigureOptions,
  LinkingLike,
  Referral,
  ReferalliNativeModule,
  ReferalliStorage,
  SignupOptions,
  SignupResult,
} from './types.js';

export const DEFAULT_BASE_URL = 'https://referalli.com';
/** Installs older than this when the SDK first runs (an existing user updating) skip first-open matching. */
export const FRESH_INSTALL_WINDOW_MS = 24 * 60 * 60 * 1000;

export const STORAGE_KEYS = {
  anonId: 'referalli.anon_id',
  referral: 'referalli.referral',
  firstOpen: 'referalli.first_open_done',
} as const;

/** A tracker call failed: `status` is the HTTP status, or null for a network error. */
export class ReferalliError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'ReferalliError';
  }
}

export interface TrackerDeps {
  linking: LinkingLike | null;
  native: ReferalliNativeModule | null;
  storage: ReferalliStorage;
  now?: () => number;
}

type MobileClient = ReturnType<typeof createMobileClient>;

function randomAnonId(): string {
  const bytes = new Uint8Array(10);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return 'a_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class ReferalliTracker {
  readonly publishableKey: string;
  readonly programId: string | null;
  readonly baseUrl: string;
  readonly deferredResolution: boolean;

  private readonly deps: TrackerDeps;
  private readonly fetchImpl: typeof fetch;
  private readonly mobile: MobileClient;
  private readonly now: () => number;
  private readonly listeners = new Set<(referral: Referral) => void>();
  private subscription: { remove(): void } | null = null;
  private firstOpenRun: Promise<Referral | null> | null = null;
  private deferredRun: Promise<Referral | null> | null = null;
  private initialUrlChecked = false;

  constructor(publishableKey: string, options: ConfigureOptions, deps: TrackerDeps) {
    if (!publishableKey) throw new Error('Referalli.configure needs your publishable tracking token');
    this.publishableKey = publishableKey;
    this.programId = options.programId ?? null;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.deferredResolution = options.deferredResolution !== false;
    this.deps = deps;
    this.now = deps.now ?? Date.now;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.mobile = this.mobileClient(this.programId ?? '');
    if (options.listenForLinks !== false && deps.linking) {
      this.subscription = deps.linking.addEventListener('url', ({ url }) => {
        void this.handleUrl(url);
      });
    }
  }

  /** Random install id, persisted. Not derived from the device. */
  async anonId(): Promise<string> {
    const existing = await this.deps.storage.getItem(STORAGE_KEYS.anonId);
    if (existing) return existing;
    const fresh = randomAnonId();
    await this.deps.storage.setItem(STORAGE_KEYS.anonId, fresh);
    return fresh;
  }

  /** The stored referral, without any lookup. */
  async storedReferral(): Promise<Referral | null> {
    const raw = await this.deps.storage.getItem(STORAGE_KEYS.referral);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Referral;
    } catch {
      return null;
    }
  }

  /**
   * The referral for this install: the stored one; else the link that launched the app; else, on
   * the first open after install, the Play Install Referrer (Android) and then a deferred match
   * from the API. Never rejects: network failures resolve to null and are retried next time.
   */
  async getReferral(): Promise<Referral | null> {
    const stored = await this.storedReferral();
    if (stored) return stored;
    this.firstOpenRun ??= this.firstOpen().finally(() => {
      this.firstOpenRun = null;
    });
    return this.firstOpenRun;
  }

  /** Captures a referral from a link URL (called automatically for `Linking` events). */
  async handleUrl(url: string): Promise<Referral | null> {
    const captured = parseLink(url, this.now());
    if (!captured) return null;
    await this.save(captured);
    await this.deps.storage.setItem(STORAGE_KEYS.firstOpen, '1');
    await this.reportVisit(captured, url);
    const current = (await this.storedReferral()) ?? captured;
    this.emit(current);
    return current;
  }

  /** Sets the referral from a code the user typed (an invite-code field). */
  async setReferral(code: string): Promise<Referral> {
    const referral: Referral = { clickId: null, code, destination: null, programId: null, source: 'manual', capturedAt: this.now() };
    await this.save(referral);
    await this.deps.storage.setItem(STORAGE_KEYS.firstOpen, '1');
    await this.reportVisit(referral);
    const current = (await this.storedReferral()) ?? referral;
    this.emit(current);
    return current;
  }

  /** Runs the deferred resolver once per install (call it when `deferredResolution` is off). */
  async resolveDeferred(): Promise<Referral | null> {
    const stored = await this.storedReferral();
    if (stored) return stored;
    if (await this.deps.storage.getItem(STORAGE_KEYS.firstOpen)) return null;
    return this.deferred();
  }

  /**
   * Reports a signup: links the install to `customerRef` and, when a program is known, asks the
   * API to attribute the customer. Rejects with `ReferalliError` when the API refuses.
   */
  async trackSignup(customerRef: string, options: SignupOptions = {}): Promise<SignupResult> {
    if (!customerRef) throw new Error('trackSignup needs your customer reference (user id)');
    const current = await this.getReferral();
    await this.identify(customerRef, options.emailHash);
    const program = this.programId ?? current?.programId ?? null;
    if (!program) return { attributed: false, referralId: null, partnerId: null };
    const client = program === this.programId ? this.mobile : this.mobileClient(program);
    let result: Awaited<ReturnType<MobileClient['attributeInstall']>>;
    try {
      result = await client.attributeInstall(customerRef, current?.clickId ?? undefined, await this.anonId());
    } catch (e) {
      throw new ReferalliError(`could not reach Referalli: ${(e as Error).message}`, null);
    }
    if (typeof result?.attributed !== 'boolean') {
      throw new ReferalliError('Referalli refused the install attribution', null);
    }
    return { attributed: result.attributed, referralId: result.referralId ?? null, partnerId: result.partnerId ?? null };
  }

  /** Ties the install to a signed-up customer (or a hashed email). */
  async identify(customerRef?: string, emailHash?: string): Promise<void> {
    const body: Record<string, string> = { anonId: await this.anonId() };
    if (customerRef) body.customerRef = customerRef;
    if (emailHash) body.emailHash = emailHash;
    await this.post('/identify', body);
  }

  /** Reports an app visit; returns the click id the API recorded or echoed. */
  async trackVisit(visit: { code?: string | null; clickId?: string | null; url?: string } = {}): Promise<string | null> {
    const body: Record<string, string> = { anonId: await this.anonId() };
    if (visit.code) body.code = visit.code;
    if (visit.clickId) body.clickId = visit.clickId;
    if (visit.url) body.url = visit.url.slice(0, 2048);
    const json = (await this.post('/visit', body)) as { clickId?: string | null };
    return json.clickId ?? visit.clickId ?? null;
  }

  /** Called with every referral captured from now on (links opened while the app runs). */
  onReferral(listener: (referral: Referral) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Forgets the install id, the referral and the first-open flag. */
  async reset(): Promise<void> {
    for (const key of Object.values(STORAGE_KEYS)) await this.deps.storage.removeItem(key);
  }

  /** Stops listening for links (configure() calls it on the previous tracker). */
  dispose(): void {
    this.subscription?.remove();
    this.subscription = null;
    this.listeners.clear();
  }

  // -- internals ---------------------------------------------------------------

  private mobileClient(programId: string): MobileClient {
    return createMobileClient({
      endpoint: this.baseUrl,
      trackingToken: this.publishableKey,
      programId,
      fetchImpl: this.fetchImpl,
    });
  }

  private async firstOpen(): Promise<Referral | null> {
    if (!this.initialUrlChecked && this.deps.linking) {
      this.initialUrlChecked = true;
      const url = await this.deps.linking.getInitialURL().catch(() => null);
      if (url) {
        const fromLink = await this.handleUrl(url);
        if (fromLink) return fromLink;
      }
    }
    const stored = await this.storedReferral();
    if (stored) return stored;
    if (await this.deps.storage.getItem(STORAGE_KEYS.firstOpen)) return null;

    const info = this.deps.native?.getInstallInfo ? await this.deps.native.getInstallInfo().catch(() => null) : null;
    if (info?.firstInstallTime != null && this.now() - info.firstInstallTime > FRESH_INSTALL_WINDOW_MS) {
      await this.deps.storage.setItem(STORAGE_KEYS.firstOpen, '1');
      return null;
    }
    const fromStore = parseInstallReferrer(info?.referrer, this.now());
    if (fromStore) {
      await this.save(fromStore);
      await this.deps.storage.setItem(STORAGE_KEYS.firstOpen, '1');
      await this.reportVisit(fromStore);
      const current = (await this.storedReferral()) ?? fromStore;
      this.emit(current);
      return current;
    }
    if (!this.deferredResolution) return null;
    return this.deferred();
  }

  private deferred(): Promise<Referral | null> {
    this.deferredRun ??= this.runDeferred().finally(() => {
      this.deferredRun = null;
    });
    return this.deferredRun;
  }

  private async runDeferred(): Promise<Referral | null> {
    let match: { matched?: unknown; clickId?: string; code?: string; destination?: string; programId?: string };
    try {
      match = await this.mobile.resolveDeferred();
    } catch {
      return null; // retried on the next call
    }
    if (typeof match?.matched !== 'boolean') return null; // an error body, not an answer
    await this.deps.storage.setItem(STORAGE_KEYS.firstOpen, '1');
    if (!match.matched || (!match.clickId && !match.code)) return null;
    const found: Referral = {
      clickId: match.clickId ?? null,
      code: match.code ?? null,
      destination: match.destination ?? null,
      programId: match.programId ?? null,
      source: 'deferred',
      capturedAt: this.now(),
    };
    await this.save(found);
    // Tie the install id to the click so identify-based attribution works too.
    await this.trackVisit({ clickId: found.clickId }).catch(() => null);
    this.emit(found);
    return found;
  }

  /** Records the visit and fills in the click id the API created for code-only referrals. */
  private async reportVisit(referral: Referral, url?: string): Promise<void> {
    const clickId = await this.trackVisit({ code: referral.code, clickId: referral.clickId, url }).catch(() => null);
    if (!referral.clickId && clickId) {
      const current = await this.storedReferral();
      if (current?.capturedAt === referral.capturedAt) await this.save({ ...current, clickId });
    }
  }

  private async save(referral: Referral): Promise<void> {
    await this.deps.storage.setItem(STORAGE_KEYS.referral, JSON.stringify(referral));
  }

  private emit(referral: Referral): void {
    for (const listener of this.listeners) {
      try {
        listener(referral);
      } catch {
        // a listener's error must not break attribution
      }
    }
  }

  private async post(path: string, body: Record<string, string>): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/t/${encodeURIComponent(this.publishableKey)}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new ReferalliError(`could not reach Referalli: ${(e as Error).message}`, null);
    }
    if (!res.ok) throw new ReferalliError(`Referalli answered ${res.status} for POST ${path}`, res.status);
    return res.json().catch(() => ({}));
  }
}

/** Storage that lasts only for this JS session (used when nothing persistent is available). */
export function memoryStorage(): ReferalliStorage {
  const map = new Map<string, string>();
  return {
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => {
      map.set(k, v);
    },
    removeItem: async (k) => {
      map.delete(k);
    },
  };
}
