import type { StateCreator, StoreApi, UseBoundStore } from "zustand";

/**
 * Base state slice type for composable stores
 */
export type StateSlice<T> = StateCreator<T, [], [], T>;

/**
 * Bound store type with selectors
 */
export type BoundStore<T> = UseBoundStore<StoreApi<T>>;

/**
 * Generic action type for stores
 */
export type StoreAction<T = void> = T extends void ? () => void : (payload: T) => void;

/**
 * Async action type for stores
 */
export type AsyncStoreAction<T = void, R = void> = T extends void
  ? () => Promise<R>
  : (payload: T) => Promise<R>;

/**
 * Common loading state pattern
 */
export interface LoadingState {
  isLoading: boolean;
  error: string | null;
}

/**
 * Common async state pattern
 */
export interface AsyncState<T> extends LoadingState {
  data: T | null;
}
