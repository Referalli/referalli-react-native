import { describe, expect, it } from 'vitest';
import { parseInstallReferrer, parseLink } from '../src/attribution.js';

describe('parseLink', () => {
  it('reads via and ref_click_id from a universal link', () => {
    expect(parseLink('https://app.example/welcome?via=dana&ref_click_id=clk_9#x', 5)).toEqual({
      clickId: 'clk_9',
      code: 'dana',
      destination: null,
      programId: null,
      source: 'link',
      capturedAt: 5,
    });
  });

  it('reads the code of a /go short link and custom schemes', () => {
    expect(parseLink('https://referalli.com/go/tk_1/dana')?.code).toBe('dana');
    expect(parseLink('myapp://open?ref=x%20y')?.code).toBe('x y');
  });

  it('ignores links without a referral', () => {
    expect(parseLink('https://app.example/settings?tab=1')).toBeNull();
    expect(parseLink('not a url')).toBeNull();
    expect(parseLink('https://app.example/go/only-two')).toBeNull();
  });
});

describe('parseInstallReferrer', () => {
  it('reads plain and once-more-encoded referrers', () => {
    expect(parseInstallReferrer('ref_click_id=clk_1&via=dana')?.clickId).toBe('clk_1');
    expect(parseInstallReferrer('via%3Ddana%26utm_source%3Dx')?.code).toBe('dana');
    expect(parseInstallReferrer('via%3Ddana')?.source).toBe('installReferrer');
  });

  it('returns null for organic installs', () => {
    expect(parseInstallReferrer('utm_source=google-play&utm_medium=organic')).toBeNull();
    expect(parseInstallReferrer(null)).toBeNull();
    expect(parseInstallReferrer('')).toBeNull();
  });
});
