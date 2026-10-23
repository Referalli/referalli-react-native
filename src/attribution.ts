import type { Referral } from './types.js';

function decode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

function parseQuery(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const pair of raw.split('&')) {
    if (!pair) continue;
    const i = pair.indexOf('=');
    const key = decode(i < 0 ? pair : pair.slice(0, i));
    const value = i < 0 ? '' : decode(pair.slice(i + 1));
    if (value && !out.has(key)) out.set(key, value);
  }
  return out;
}

/**
 * Extracts `ref_click_id` and `via` (or `ref`) from a universal link / app link / custom-scheme
 * URL, or the code of a `/go/<token>/<code>` short link. Null when the URL carries no referral.
 * String parsing on purpose: React Native's URL polyfill is incomplete.
 */
export function parseLink(url: string, now: number = Date.now()): Referral | null {
  const match = /^([a-z][a-z0-9+.-]*):(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?/i.exec(url.trim());
  if (!match) return null;
  const query = parseQuery(match[4] ?? '');
  const clickId = query.get('ref_click_id') ?? null;
  let code = query.get('via') ?? query.get('ref') ?? null;
  const parts = (match[3] ?? '').split('/').filter(Boolean);
  if (!code && parts.length === 3 && parts[0] === 'go') code = decode(parts[2]!);
  if (!clickId && !code) return null;
  return { clickId, code, destination: null, programId: null, source: 'link', capturedAt: now };
}

/** Parses a Play Install Referrer (`ref_click_id=…&via=…`, possibly URL-encoded once more). */
export function parseInstallReferrer(raw: string | null | undefined, now: number = Date.now()): Referral | null {
  if (!raw || !raw.trim()) return null;
  let query = parseQuery(raw);
  if (!query.has('ref_click_id') && !query.has('via') && /%3D/i.test(raw)) query = parseQuery(decode(raw));
  const clickId = query.get('ref_click_id') ?? null;
  const code = query.get('via') ?? query.get('ref') ?? null;
  if (!clickId && !code) return null;
  return { clickId, code, destination: null, programId: null, source: 'installReferrer', capturedAt: now };
}
