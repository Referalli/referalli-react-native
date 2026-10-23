/** Pure config mutations behind the Expo plugin (unit-tested without Expo installed). */

export interface ReferalliPluginProps {
  /**
   * Hosts that open the app: your referral link destinations (and your link domain once it
   * serves apple-app-site-association / assetlinks.json for your app). Example: ['app.example.com'].
   */
  domains?: string[];
  /** Limit Android App Links to these path prefixes (default: every path on the domains). */
  androidPathPrefixes?: string[];
}

const ASSOCIATED_DOMAINS = 'com.apple.developer.associated-domains';
const HOST = /^(?=.{1,253}$)(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeDomains(props: ReferalliPluginProps | undefined): string[] {
  const out: string[] = [];
  for (const raw of props?.domains ?? []) {
    const host = String(raw).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!HOST.test(host)) throw new Error(`@referalli/react-native plugin: "${raw}" is not a domain name`);
    if (!out.includes(host)) out.push(host);
  }
  return out;
}

export function addAssociatedDomains(entitlements: Record<string, unknown>, domains: string[]): Record<string, unknown> {
  const existing = Array.isArray(entitlements[ASSOCIATED_DOMAINS]) ? (entitlements[ASSOCIATED_DOMAINS] as string[]) : [];
  const next = [...existing];
  for (const d of domains) if (!next.includes(`applinks:${d}`)) next.push(`applinks:${d}`);
  return { ...entitlements, [ASSOCIATED_DOMAINS]: next };
}

type XmlNode = { $?: Record<string, string> } & Record<string, unknown>;
interface ManifestLike {
  manifest: { application?: Array<{ activity?: XmlNode[] } & XmlNode> } & XmlNode;
}

function names(nodes: unknown): string[] {
  return Array.isArray(nodes) ? (nodes as XmlNode[]).map((n) => n.$?.['android:name'] ?? '') : [];
}

function isLauncher(activity: XmlNode): boolean {
  const filters = (activity['intent-filter'] as XmlNode[] | undefined) ?? [];
  return filters.some(
    (f) => names(f.action).includes('android.intent.action.MAIN') && names(f.category).includes('android.intent.category.LAUNCHER'),
  );
}

/** Adds a verified App Links intent filter for `domains` to the launcher activity. */
export function addAppLinkIntentFilters<T extends ManifestLike>(manifest: T, domains: string[], pathPrefixes: string[] = []): T {
  const app = manifest.manifest.application?.[0];
  const activity = app?.activity?.find(isLauncher) ?? app?.activity?.[0];
  if (!activity) throw new Error('@referalli/react-native plugin: no launcher activity in AndroidManifest.xml');
  const filters = ((activity['intent-filter'] as XmlNode[] | undefined) ?? []).slice();
  const hostsPresent = new Set(
    filters.flatMap((f) => ((f.data as XmlNode[] | undefined) ?? []).map((d) => d.$?.['android:host'] ?? '')),
  );
  const missing = domains.filter((d) => !hostsPresent.has(d));
  if (missing.length === 0) return manifest;
  const data: XmlNode[] = [{ $: { 'android:scheme': 'https' } }];
  for (const host of missing) data.push({ $: { 'android:host': host } });
  for (const prefix of pathPrefixes) data.push({ $: { 'android:pathPrefix': prefix.startsWith('/') ? prefix : `/${prefix}` } });
  filters.push({
    $: { 'android:autoVerify': 'true' },
    action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
    category: [
      { $: { 'android:name': 'android.intent.category.DEFAULT' } },
      { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
    ],
    data,
  });
  activity['intent-filter'] = filters;
  return manifest;
}
