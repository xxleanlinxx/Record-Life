import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useMemo,
} from "react";
import { useLocation, useSearchParams } from "react-router-dom";

type PageMemory = { search: Map<string, string>; scroll: Map<string, number> };
export const NavigationState = createContext<PageMemory>({
  search: new Map(),
  scroll: new Map(),
});
export function usePageMemory(trip?: string) {
  const memory = useMemo<PageMemory>(
    () => ({ search: new Map(), scroll: new Map() }),
    [trip],
  );
  const location = useLocation();
  useLayoutEffect(() => {
    const key = location.pathname;
    window.scrollTo({
      top: memory.scroll.get(key) ?? 0,
      behavior: "instant",
    });
    if (!document.querySelector("dialog[open]"))
      document
        .querySelector<HTMLElement>("main")
        ?.focus({ preventScroll: true });
    const save = () => memory.scroll.set(key, window.scrollY);
    window.addEventListener("scroll", save, { passive: true });
    return () => window.removeEventListener("scroll", save);
  }, [location.pathname, memory]);
  return memory;
}

/** URLs remain shareable; returning via a nav link restores this session's filters. */
export function usePageParams() {
  const memory = useContext(NavigationState);
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const restored = useRef(false);
  const effective =
    !restored.current &&
    !location.search &&
    memory.search.has(location.pathname)
      ? new URLSearchParams(memory.search.get(location.pathname))
      : params;
  useLayoutEffect(() => {
    if (!restored.current) {
      restored.current = true;
      if (!location.search && memory.search.has(location.pathname)) {
        setParams(memory.search.get(location.pathname)!, {
          replace: true,
          preventScrollReset: true,
        });
        return;
      }
    }
    memory.search.set(location.pathname, location.search);
  }, [location.pathname, location.search, memory, setParams]);
  function update(values: Record<string, string>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(values))
          value ? next.set(key, value) : next.delete(key);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }
  return [effective, update] as const;
}
