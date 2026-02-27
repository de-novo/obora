/**
 * JudgmentPolicy — schema/policy resolve + snapshot hash.
 * TASK-M1-26
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolveInput {
  policyRef: string;
  schemaRef: string;
  runId: string;
  engineVersion: string;
}

export type ResolveSource = 'memory' | 'local';

export interface ResolveOutput {
  policy: object;
  schema: object;
  snapshotHash: string;
  source: ResolveSource;
}

export interface ResolveError {
  errorCode: 'RESOLVE_ERROR';
  message: string;
}

export type ResolveResult =
  | { ok: true; value: ResolveOutput }
  | { ok: false; error: ResolveError };

/**
 * Store abstraction — implemented by callers.
 */
export interface PolicyStore {
  get(ref: string): object | undefined;
}

/**
 * Structured log entry for resolve operations (observability).
 */
export interface ResolveLogEntry {
  event: 'resolve_success' | 'resolve_fallback' | 'resolve_error';
  source?: ResolveSource;
  policyRef: string;
  schemaRef: string;
  snapshotHash?: string;
  errorCode?: string;
  message?: string;
}

/**
 * Logger interface — callers can provide a structured logger.
 * Defaults to console.log JSON if not provided.
 */
export interface StructuredLogger {
  log(entry: ResolveLogEntry): void;
}

const defaultLogger: StructuredLogger = {
  log(entry: ResolveLogEntry) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry));
  },
};

// ---------------------------------------------------------------------------
// Canonicalization
// ---------------------------------------------------------------------------

/**
 * Recursively sort object keys (ascending) while preserving array order.
 */
function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.normalize('NFC');
  }
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(value as Record<string, unknown>).sort();
  for (const k of keys) {
    sorted[k] = canonicalize((value as Record<string, unknown>)[k]);
  }
  return sorted;
}

/**
 * Canonical JSON string (no whitespace, sorted keys, NFC strings).
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

// ---------------------------------------------------------------------------
// Snapshot hash
// ---------------------------------------------------------------------------

export function computeSnapshotHash(
  policyRef: string,
  schemaRef: string,
  policy: object,
  schema: object,
  engineVersion: string,
): string {
  const parts = [
    policyRef,
    schemaRef,
    canonicalJson(policy),
    canonicalJson(schema),
    engineVersion,
  ];
  const payload = parts.join('\n');
  return createHash('sha256').update(payload, 'utf-8').digest('hex');
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

export class JudgmentPolicyResolver {
  private readonly memoryStore: PolicyStore;
  private readonly localStore: PolicyStore;
  private readonly logger: StructuredLogger;

  constructor(memoryStore: PolicyStore, localStore: PolicyStore, logger?: StructuredLogger) {
    this.memoryStore = memoryStore;
    this.localStore = localStore;
    this.logger = logger ?? defaultLogger;
  }

  /**
   * Resolve policy+schema with memory->local fallback.
   *
   * Cross-store semantics: memory store is checked first for BOTH policyRef
   * and schemaRef. If either is missing from memory, the resolver falls back
   * to local store for BOTH (no cross-store mixing). If local also fails,
   * RESOLVE_ERROR is returned.
   */
  resolve(input: ResolveInput): ResolveResult {
    const memPolicy = this.memoryStore.get(input.policyRef);
    const memSchema = this.memoryStore.get(input.schemaRef);
    if (memPolicy !== undefined && memSchema !== undefined) {
      const result = this.buildSuccess(input, memPolicy, memSchema, 'memory');
      if (result.ok) {
        this.logger.log({
          event: 'resolve_success',
          source: 'memory',
          policyRef: input.policyRef,
          schemaRef: input.schemaRef,
          snapshotHash: result.value.snapshotHash,
        });
      }
      return result;
    }

    const localPolicy = this.localStore.get(input.policyRef);
    const localSchema = this.localStore.get(input.schemaRef);
    if (localPolicy !== undefined && localSchema !== undefined) {
      const result = this.buildSuccess(input, localPolicy, localSchema, 'local');
      if (result.ok) {
        this.logger.log({
          event: 'resolve_fallback',
          source: 'local',
          policyRef: input.policyRef,
          schemaRef: input.schemaRef,
          snapshotHash: result.value.snapshotHash,
        });
      }
      return result;
    }

    const errorMsg = `Failed to resolve policyRef="${input.policyRef}" and/or schemaRef="${input.schemaRef}" from memory or local stores`;
    this.logger.log({
      event: 'resolve_error',
      policyRef: input.policyRef,
      schemaRef: input.schemaRef,
      errorCode: 'RESOLVE_ERROR',
      message: errorMsg,
    });

    return {
      ok: false,
      error: {
        errorCode: 'RESOLVE_ERROR',
        message: errorMsg,
      },
    };
  }

  private buildSuccess(
    input: ResolveInput,
    policy: object,
    schema: object,
    source: ResolveSource,
  ): ResolveResult {
    const snapshotHash = computeSnapshotHash(
      input.policyRef,
      input.schemaRef,
      policy,
      schema,
      input.engineVersion,
    );
    return { ok: true, value: { policy, schema, snapshotHash, source } };
  }
}
