import { Linking, NativeModules } from 'react-native';
import { memoryStorage, type TrackerDeps } from './tracker.js';
import type { ConfigureOptions, ReferalliNativeModule, ReferalliStorage } from './types.js';

let warned = false;

/** The native module, or null in Expo Go / when autolinking did not run. */
export function nativeModule(): ReferalliNativeModule | null {
  return (NativeModules.ReferalliModule as ReferalliNativeModule | undefined) ?? null;
}

function nativeStorage(native: ReferalliNativeModule | null): ReferalliStorage | null {
  if (!native?.getItem || !native.setItem || !native.removeItem) return null;
  return {
    getItem: (k) => native.getItem!(k),
    setItem: (k, v) => native.setItem!(k, v),
    removeItem: (k) => native.removeItem!(k),
  };
}

export function defaultDeps(options: ConfigureOptions): TrackerDeps {
  const native = nativeModule();
  let storage = options.storage ?? nativeStorage(native);
  if (!storage) {
    storage = memoryStorage();
    if (!warned) {
      warned = true;
      console.warn(
        '[referalli] The native module is not linked (Expo Go?), so the referral is kept in memory only. ' +
          'Use a development build, or pass `storage` (e.g. AsyncStorage) to configure().',
      );
    }
  }
  return { linking: Linking, native, storage };
}
