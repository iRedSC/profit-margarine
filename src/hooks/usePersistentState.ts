import { useEffect, useState } from "react";

/**
 * useState backed by localStorage. Stored values that fail `isValid` (from an
 * older version, or hand-edited) are ignored in favor of `initial`.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
  isValid: (value: unknown) => value is T
) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === null) return initial;
      const parsed: unknown = JSON.parse(stored);
      return isValid(parsed) ? parsed : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked: the setting just won't survive a reload.
    }
  }, [key, value]);

  return [value, setValue] as const;
}

export function isOneOf<T extends string>(options: readonly T[]) {
  return (value: unknown): value is T =>
    typeof value === "string" && (options as readonly string[]).includes(value);
}

export function isSubsetOf<T extends string>(options: readonly T[]) {
  return (value: unknown): value is T[] =>
    Array.isArray(value) && value.every(isOneOf(options));
}
