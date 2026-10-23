/** How the referral was captured. */
export type ReferralSource = 'link' | 'deferred' | 'installReferrer' | 'manual';

/** The referral captured for this install. */
export interface Referral {
  /** The click id (`ref_click_id`): deterministic attribution when present. */
  clickId: string | null;
  /** The partner's referral code (`via`). */
  code: string | null;
  /** Where the link wanted to send the user (deferred matches only). */
  destination: string | null;
  /** The program the click belongs to, when the API reports it. */
  programId: string | null;
  source: ReferralSource;
  /** Epoch milliseconds. */
  capturedAt: number;
}

/** The outcome of `trackSignup`. */
export interface SignupResult {
  /** True when the API attributed this customer to a partner. */
  attributed: boolean;
  referralId: string | null;
  partnerId: string | null;
}

/** AsyncStorage-compatible persistence. */
export interface ReferalliStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface ConfigureOptions {
  /** The program installs belong to; needed for `trackSignup` to attribute. */
  programId?: string;
  /** Defaults to https://referalli.com. */
  baseUrl?: string;
  /**
   * Match the first open after install to a recent link click via the API (IP-based, see the
   * README on App Tracking Transparency). Default true. When false, call `resolveDeferred()`
   * yourself once your consent policy allows it.
   */
  deferredResolution?: boolean;
  /** Persistence. Default: the native module, then AsyncStorage if installed, then memory. */
  storage?: ReferalliStorage;
  /** Subscribe to `Linking` URL events and capture referral links automatically. Default true. */
  listenForLinks?: boolean;
  /** Custom fetch (tests, proxies). */
  fetch?: typeof fetch;
}

export interface SignupOptions {
  /** SHA-256 of the lowercased email, if you match by email too. */
  emailHash?: string;
}

/** What the native module reports about the install (Android; iOS returns nulls). */
export interface InstallInfo {
  /** The raw Play Install Referrer string. */
  referrer: string | null;
  /** When the app was first installed (epoch ms). */
  firstInstallTime: number | null;
}

/** The native module (`NativeModules.ReferalliModule`). Every method is optional. */
export interface ReferalliNativeModule {
  getInstallInfo?(): Promise<InstallInfo>;
  getItem?(key: string): Promise<string | null>;
  setItem?(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
}

/** The slice of React Native's `Linking` the SDK uses. */
export interface LinkingLike {
  getInitialURL(): Promise<string | null | undefined>;
  addEventListener(type: 'url', handler: (event: { url: string }) => void): { remove(): void };
}
