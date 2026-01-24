import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import type { StateCreator } from "zustand";

type StorageType = "localStorage" | "sessionStorage";

interface CreateStoreOptions<T> {
  /**
   * Store name for devtools and persistence
   */
  name: string;
  /**
   * Enable persistence middleware
   */
  persist?: boolean;
  /**
   * Storage type for persistence (default: localStorage)
   */
  storage?: StorageType;
  /**
   * Enable devtools in development
   */
  devtools?: boolean;
  /**
   * Partial state to persist (default: all)
   */
  partialize?: (state: T) => Partial<T>;
}

/**
 * Create a zustand store with common middleware
 *
 * @example
 * ```ts
 * interface CounterState {
 *   count: number;
 *   increment: () => void;
 * }
 *
 * export const useCounterStore = createStore<CounterState>(
 *   (set) => ({
 *     count: 0,
 *     increment: () => set((state) => ({ count: state.count + 1 })),
 *   }),
 *   { name: "counter", devtools: true }
 * );
 * ```
 */
export function createStore<T>(
  initializer: StateCreator<T, [], []>,
  options: CreateStoreOptions<T>
) {
  const { name, persist: enablePersist, storage = "localStorage", devtools: enableDevtools = true, partialize } = options;

  let storeCreator = initializer;

  // Apply persist middleware if enabled
  if (enablePersist) {
    const getStorage = () => {
      if (typeof window === "undefined") return undefined;
      return storage === "sessionStorage" ? sessionStorage : localStorage;
    };

    storeCreator = persist(storeCreator as StateCreator<T, [], []>, {
      name,
      storage: createJSONStorage(getStorage),
      partialize: partialize as (state: T) => Partial<T>,
    }) as StateCreator<T, [], []>;
  }

  // Apply devtools middleware in development
  if (enableDevtools && process.env.NODE_ENV === "development") {
    storeCreator = devtools(storeCreator as StateCreator<T, [], []>, {
      name,
      enabled: true,
    }) as StateCreator<T, [], []>;
  }

  return create<T>()(storeCreator);
}

/**
 * Create a simple store without middleware
 */
export function createSimpleStore<T>(initializer: StateCreator<T, [], []>) {
  return create<T>()(initializer);
}
