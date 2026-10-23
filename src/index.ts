/**
 * Referalli for React Native: referral links, Play Install Referrer, deferred deep links and
 * signup tracking.
 *
 *   import Referalli from '@referalli/react-native';
 *
 *   Referalli.configure('tk_…', { programId: 'prg_…' });   // once, at startup
 *   const referral = await Referalli.getReferral();          // null when not referred
 *   await Referalli.trackSignup(user.id);                    // after signup
 *
 * In-app purchases are reported from your backend with a secret API key
 * (POST /v1/mobile/purchases, after validating the receipt), never from the app.
 */
import { defaultDeps } from './native.js';
import { ReferalliTracker } from './tracker.js';
import type { ConfigureOptions, Referral, SignupOptions, SignupResult } from './types.js';

let current: ReferalliTracker | null = null;

function tracker(): ReferalliTracker {
  if (!current) throw new Error('Call Referalli.configure(publishableKey) before using the SDK');
  return current;
}

/** Configures the SDK. `publishableKey` is your org's public tracking token (Settings → Tracking). */
export function configure(publishableKey: string, options: ConfigureOptions = {}): ReferalliTracker {
  current?.dispose();
  current = new ReferalliTracker(publishableKey, options, defaultDeps(options));
  return current;
}

/** The referral for this install, or null. Resolves the first open after install. */
export function getReferral(): Promise<Referral | null> {
  return tracker().getReferral();
}

/** Identifies the install as `customerRef` (your user id) and attributes the signup. */
export function trackSignup(customerRef: string, options?: SignupOptions): Promise<SignupResult> {
  return tracker().trackSignup(customerRef, options);
}

/** Captures a referral from a URL you received yourself (links via `Linking` are automatic). */
export function handleUrl(url: string): Promise<Referral | null> {
  return tracker().handleUrl(url);
}

/** Sets the referral from a code the user typed. */
export function setReferral(code: string): Promise<Referral> {
  return tracker().setReferral(code);
}

/** Runs the deferred resolver (for apps that turned `deferredResolution` off until consent). */
export function resolveDeferred(): Promise<Referral | null> {
  return tracker().resolveDeferred();
}

/** Listens for referrals captured while the app runs. Returns an unsubscribe function. */
export function addReferralListener(listener: (referral: Referral) => void): () => void {
  return tracker().onReferral(listener);
}

/** Forgets the install id and the referral. */
export function reset(): Promise<void> {
  return tracker().reset();
}

export { parseInstallReferrer, parseLink } from './attribution.js';
export { DEFAULT_BASE_URL, ReferalliError, ReferalliTracker, memoryStorage } from './tracker.js';
export type {
  ConfigureOptions,
  InstallInfo,
  Referral,
  ReferralSource,
  ReferalliStorage,
  SignupOptions,
  SignupResult,
} from './types.js';

const Referalli = {
  configure,
  getReferral,
  trackSignup,
  handleUrl,
  setReferral,
  resolveDeferred,
  addReferralListener,
  reset,
};

export default Referalli;
