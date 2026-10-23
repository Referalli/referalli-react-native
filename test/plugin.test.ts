import { describe, expect, it } from 'vitest';
import { addAppLinkIntentFilters, addAssociatedDomains, normalizeDomains } from '../plugin/src/mutations.js';

const launcher = () => ({
  manifest: {
    application: [
      {
        $: { 'android:name': '.MainApplication' },
        activity: [
          {
            $: { 'android:name': '.MainActivity' },
            'intent-filter': [
              {
                action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
                category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
              },
            ],
          },
        ],
      },
    ],
  },
});

describe('expo plugin mutations', () => {
  it('normalizes and validates domains', () => {
    expect(normalizeDomains({ domains: ['https://App.Example.com/', 'app.example.com', 'links.example.io'] })).toEqual([
      'app.example.com',
      'links.example.io',
    ]);
    expect(normalizeDomains(undefined)).toEqual([]);
    expect(() => normalizeDomains({ domains: ['not a domain'] })).toThrow(/not a domain/);
  });

  it('adds applinks entitlements once, keeping existing ones', () => {
    const once = addAssociatedDomains({ 'com.apple.developer.associated-domains': ['webcredentials:x.com'] }, ['app.example.com']);
    const twice = addAssociatedDomains(once, ['app.example.com']);
    expect(twice['com.apple.developer.associated-domains']).toEqual(['webcredentials:x.com', 'applinks:app.example.com']);
  });

  it('adds one verified App Links filter to the launcher activity, idempotently', () => {
    const m = addAppLinkIntentFilters(launcher(), ['app.example.com'], ['go']);
    addAppLinkIntentFilters(m, ['app.example.com']);
    const filters = m.manifest.application[0]!.activity[0]!['intent-filter'] as Array<Record<string, any>>;
    expect(filters).toHaveLength(2);
    expect(filters[1]!.$).toEqual({ 'android:autoVerify': 'true' });
    expect(filters[1]!.data).toEqual([
      { $: { 'android:scheme': 'https' } },
      { $: { 'android:host': 'app.example.com' } },
      { $: { 'android:pathPrefix': '/go' } },
    ]);
  });

  it('fails clearly without an activity', () => {
    expect(() => addAppLinkIntentFilters({ manifest: { application: [{}] } }, ['a.example.com'])).toThrow(/launcher activity/);
  });
});
