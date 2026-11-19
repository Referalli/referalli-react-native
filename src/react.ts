import { createElement, useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { fetchReferrerSummary, type ReferrerSummary, type ReferrerSummaryOptions } from './summary.js';

export interface UseReferrerSummary {
  summary: ReferrerSummary | null;
  loading: boolean;
  /** Set for any failure, including signed out (`status` 0) and not enrolled (403). */
  error: Error | null;
  refresh: () => Promise<void>;
}

/** The signed-in customer's referral summary (link, code, progress, earnings), like the web widget. Reloads when `programId` changes. */
export function useReferrerSummary(options: ReferrerSummaryOptions): UseReferrerSummary {
  const latest = useRef(options);
  latest.current = options;
  const [state, setState] = useState<{ summary: ReferrerSummary | null; loading: boolean; error: Error | null }>({ summary: null, loading: true, error: null });
  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      setState({ summary: await fetchReferrerSummary(latest.current), loading: false, error: null });
    } catch (e) {
      setState({ summary: null, loading: false, error: e as Error });
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [options.programId, refresh]);
  return { ...state, refresh };
}

export interface ReferralPanelTheme {
  background?: string;
  text?: string;
  muted?: string;
  accent?: string;
  radius?: number;
}

export interface ReferralPanelProps extends ReferrerSummaryOptions {
  theme?: ReferralPanelTheme;
  /** Overrides the English labels. */
  labels?: Partial<Record<'title' | 'share' | 'yourCode' | 'clicks' | 'signups' | 'paying' | 'earned', string>>;
}

const money = (minor: number, currency: string) => `${(minor / 100).toFixed(2)} ${currency.toUpperCase()}`;

/** A minimal themable panel: the share link (native share sheet), code and progress. Renders nothing while signed out or not enrolled. */
export function ReferralPanel(props: ReferralPanelProps): ReactElement | null {
  const { summary } = useReferrerSummary(props);
  if (!summary) return null;
  const t = { background: '#fff', text: '#111', muted: '#666', accent: '#4f46e5', radius: 12, ...props.theme };
  const l = { title: `Refer friends to ${summary.program.name}`, share: 'Share your link', yourCode: 'Your code', clicks: 'Clicks', signups: 'Signups', paying: 'Paying', earned: 'Earned', ...props.labels };
  const earned = summary.earnings.map((e) => money(e.pending + e.approved + e.paid, e.currency)).join(' · ') || money(0, 'usd');
  const stat = (label: string, value: string | number) =>
    createElement(View, { key: label }, createElement(Text, { style: { color: t.text, fontWeight: '600' } }, String(value)), createElement(Text, { style: { color: t.muted } }, label));
  return createElement(
    View,
    { style: { backgroundColor: t.background, borderRadius: t.radius, padding: 16, gap: 8 } },
    createElement(Text, { style: { color: t.text, fontWeight: '700' } }, l.title),
    summary.link
      ? createElement(Pressable, { accessibilityRole: 'button', onPress: () => void Share.share({ message: summary.link! }), style: { backgroundColor: t.accent, borderRadius: t.radius, padding: 12 } }, createElement(Text, { style: { color: '#fff' } }, l.share))
      : null,
    summary.code ? createElement(Text, { style: { color: t.muted } }, `${l.yourCode}: ${summary.code}`) : null,
    createElement(
      View,
      { style: { flexDirection: 'row', justifyContent: 'space-between' } },
      stat(l.clicks, summary.progress.clicks),
      stat(l.signups, summary.progress.signups),
      stat(l.paying, summary.progress.payingCustomers),
      stat(l.earned, earned),
    ),
  );
}
