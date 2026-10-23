/** Minimal stand-in for `react-native` in unit tests; tests drive it through `rn`. */
type UrlHandler = (event: { url: string }) => void;

export const rn = {
  initialUrl: null as string | null,
  handlers: new Set<UrlHandler>(),
  emitUrl(url: string) {
    for (const h of rn.handlers) h({ url });
  },
};

export const Linking = {
  getInitialURL: async () => rn.initialUrl,
  addEventListener: (_type: 'url', handler: UrlHandler) => {
    rn.handlers.add(handler);
    return { remove: () => rn.handlers.delete(handler) };
  },
};

export const NativeModules: Record<string, unknown> = {};

export const Platform = { OS: 'ios' as 'ios' | 'android' };
