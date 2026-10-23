/**
 * Expo config plugin:
 *
 *   // app.json
 *   { "expo": { "plugins": [["@referalli/react-native", { "domains": ["app.example.com"] }]] } }
 *
 * Adds `applinks:<domain>` associated domains (iOS) and a verified App Links intent filter
 * (Android). The Play Install Referrer library comes with the native module via autolinking.
 */
import { addAppLinkIntentFilters, addAssociatedDomains, normalizeDomains, type ReferalliPluginProps } from './mutations';

type Mod<R> = { modResults: R } & Record<string, unknown>;
type Config = Record<string, unknown>;
interface ConfigPlugins {
  withEntitlementsPlist(config: Config, action: (c: Mod<Record<string, unknown>>) => Mod<Record<string, unknown>>): Config;
  withAndroidManifest(config: Config, action: (c: Mod<any>) => Mod<any>): Config;
  createRunOncePlugin<P>(plugin: (config: Config, props: P) => Config, name: string, version?: string): (config: Config, props: P) => Config;
}

// Resolved from the app's `expo` install at prebuild time; not a dependency of this package.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugins = require('expo/config-plugins') as ConfigPlugins;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require('../../package.json') as { name: string; version: string };

function withReferalli(config: Config, props: ReferalliPluginProps | undefined): Config {
  const domains = normalizeDomains(props);
  if (domains.length === 0) return config;
  let next = plugins.withEntitlementsPlist(config, (c) => {
    c.modResults = addAssociatedDomains(c.modResults, domains);
    return c;
  });
  next = plugins.withAndroidManifest(next, (c) => {
    c.modResults = addAppLinkIntentFilters(c.modResults, domains, props?.androidPathPrefixes);
    return c;
  });
  return next;
}

export default plugins.createRunOncePlugin(withReferalli, pkg.name, pkg.version);
