import { atom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import type { WritableAtom, SetStateAction } from "jotai";
import type { AsyncState, AtomFamilyKey } from "./types";

type StorageType = "localStorage" | "sessionStorage";

interface AtomWithStorageOptions {
  /**
   * Storage type (default: localStorage)
   */
  storage?: StorageType;
}

/**
 * Create a persisted atom with localStorage/sessionStorage
 *
 * @example
 * ```ts
 * const themeAtom = createPersistedAtom("theme", "light");
 * ```
 */
export function createPersistedAtom<T>(
  key: string,
  initialValue: T,
  options: AtomWithStorageOptions = {}
): WritableAtom<T, [SetStateAction<T>], void> {
  const { storage = "localStorage" } = options;

  const getStorage = () => {
    if (typeof window === "undefined") return undefined;
    return storage === "sessionStorage" ? sessionStorage : localStorage;
  };

  return atomWithStorage(key, initialValue, createJSONStorage(getStorage), {
    getOnInit: true,
  });
}

/**
 * Create an async atom with loading state
 *
 * @example
 * ```ts
 * const userAtom = createAsyncAtom(async () => {
 *   const response = await fetch("/api/user");
 *   return response.json();
 * });
 * ```
 */
export function createAsyncAtom<T>(fetcher: () => Promise<T>) {
  const baseAtom = atom<AsyncState<T>>({
    data: null,
    isLoading: true,
    error: null,
  });

  const asyncAtom = atom(
    (get) => get(baseAtom),
    async (get, set) => {
      set(baseAtom, { data: null, isLoading: true, error: null });
      try {
        const data = await fetcher();
        set(baseAtom, { data, isLoading: false, error: null });
        return data;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        set(baseAtom, { data: null, isLoading: false, error: message });
        throw error;
      }
    }
  );

  return asyncAtom;
}

/**
 * Create an atom family (parameterized atoms)
 *
 * @example
 * ```ts
 * const todoAtomFamily = createAtomFamily((id: string) => ({
 *   id,
 *   text: "",
 *   completed: false,
 * }));
 *
 * const todo1 = todoAtomFamily("1");
 * const todo2 = todoAtomFamily("2");
 * ```
 */
export function createAtomFamily<T, K extends AtomFamilyKey>(
  initialValueFn: (key: K) => T
) {
  const atomMap = new Map<K, WritableAtom<T, [SetStateAction<T>], void>>();

  return (key: K) => {
    if (!atomMap.has(key)) {
      atomMap.set(key, atom(initialValueFn(key)));
    }
    return atomMap.get(key)!;
  };
}

/**
 * Create a reset action atom for resettable atoms
 *
 * @example
 * ```ts
 * const countAtom = atom(0);
 * const resetCountAtom = createResetAtom(countAtom, 0);
 * ```
 */
export function createResetAtom<T>(
  targetAtom: WritableAtom<T, [SetStateAction<T>], void>,
  initialValue: T
) {
  return atom(null, (get, set) => {
    set(targetAtom, initialValue);
  });
}
