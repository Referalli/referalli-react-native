/** Minimal stand-in for `react` in unit tests: hook slots, effects and createElement; drive it with `renderHook`. */
export type ReactElement = { type: unknown; props: Record<string, unknown> };
let slots: unknown[] = [];
let cursor = 0;
let rerender: () => void = () => {};
let effects: Array<() => void> = [];

export function createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): ReactElement {
  return { type, props: { ...props, children } };
}
export function useRef<T>(init: T): { current: T } {
  const i = cursor++;
  return (slots[i] ??= { current: init }) as { current: T };
}
export function useState<T>(init: T): [T, (v: T | ((p: T) => T)) => void] {
  const i = cursor++;
  if (!(i in slots)) slots[i] = init;
  return [
    slots[i] as T,
    (v) => {
      slots[i] = typeof v === 'function' ? (v as (p: T) => T)(slots[i] as T) : v;
      rerender();
    },
  ];
}
export function useCallback<T>(fn: T, _deps?: unknown[]): T {
  const i = cursor++;
  return (slots[i] ??= fn) as T;
}
export function useEffect(fn: () => void, deps: unknown[]): void {
  const i = cursor++;
  const prev = slots[i] as unknown[] | undefined;
  if (!prev || prev.some((d, k) => d !== deps[k])) {
    slots[i] = deps;
    effects.push(fn);
  }
}

/** Renders `fn(props)` once, runs its effects, and re-renders on state changes; `out.current` is the latest result. */
export function renderHook<T>(fn: () => T): { current: T } {
  slots = [];
  const out = { current: undefined as T };
  const run = () => {
    cursor = 0;
    effects = [];
    out.current = fn();
    for (const e of effects) e();
  };
  rerender = run;
  run();
  return out;
}
export type { ReactElement as ReactNode };
