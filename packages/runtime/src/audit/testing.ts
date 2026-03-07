/**
 * Testing helpers for @obora/runtime
 *
 * @internal This module is intended for tests only and is not part of the public API surface.
 * @deprecated DuckDB-based testing helpers are deprecated. Use InMemoryAuditStore instead.
 */

/**
 * @deprecated DuckDB support has been removed. Use InMemoryAuditStore for tests.
 * @throws Always throws an error explaining the deprecation.
 */
export function getDatabase(_dbPath?: string): never {
  throw new Error(
    "DuckDB support has been removed. Use InMemoryAuditStore from './InMemoryAuditStore.js' for testing instead."
  );
}

/**
 * @deprecated DuckDB support has been removed.
 */
export function resetDatabase(): void {
  // No-op for backwards compatibility
}
