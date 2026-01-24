import type { Atom, WritableAtom, PrimitiveAtom } from "jotai";

/**
 * Read-only atom type
 */
export type ReadOnlyAtom<T> = Atom<T>;

/**
 * Writable atom with setter
 */
export type WritableStateAtom<T> = WritableAtom<T, [T], void>;

/**
 * Primitive atom (simplest writable atom)
 */
export type StateAtom<T> = PrimitiveAtom<T>;

/**
 * Async atom that returns a promise
 */
export type AsyncAtom<T> = Atom<Promise<T>>;

/**
 * Action atom (write-only, no read value)
 */
export type ActionAtom<Args extends unknown[] = []> = WritableAtom<null, Args, void>;

/**
 * Async action atom
 */
export type AsyncActionAtom<Args extends unknown[] = [], R = void> = WritableAtom<
  null,
  Args,
  Promise<R>
>;

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

/**
 * Atom family key type
 */
export type AtomFamilyKey = string | number;
