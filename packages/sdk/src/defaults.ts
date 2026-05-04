/**
 * Centralized defaults for Obora SDK runtime behavior.
 *
 * All hardcoded magic numbers should live here so they can be
 * discovered, documented, and overridden in one place.
 */

export const DEFAULTS = {
  // ── Timeouts ────────────────────────────────────────────────────────────
  /** Default per-step LLM request timeout in milliseconds. */
  STEP_TIMEOUT_MS: 30_000,

  /** Default maximum tool-call rounds per step. */
  MAX_TOOL_ROUNDS: 128,

  /** Default stale execution lock threshold (2 hours). */
  STALE_LOCK_THRESHOLD_MS: 2 * 60 * 60 * 1000,

  /** Default auto-recovery delay after failure (5 seconds). */
  AUTO_RECOVERY_DELAY_MS: 5_000,

  /** Default circuit breaker failure threshold. */
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: 5,

  /** Default circuit breaker reset timeout. */
  CIRCUIT_BREAKER_RESET_MS: 30_000,

  /** Default health check interval. */
  HEALTH_CHECK_INTERVAL_MS: 60_000,

  // ── Limits ──────────────────────────────────────────────────────────────
  /** Default output preview length in characters. */
  OUTPUT_PREVIEW_LENGTH: 200,

  /** Default max blackboard fact content length. */
  FACT_CONTENT_MAX_LENGTH: 500,

  /** Default reflector hint preview length. */
  REFLECTOR_HINT_PREVIEW_LENGTH: 120,

  /** Default knowledge query result limit. */
  KNOWLEDGE_QUERY_LIMIT: 20,

  /** Default SQLite knowledge bridge row limit. */
  KNOWLEDGE_SQLITE_LIMIT: 200,

  // ── Budget ──────────────────────────────────────────────────────────────
  /** Budget warning threshold (90%). */
  BUDGET_WARNING_THRESHOLD: 0.9,

  // ── Peer Review ─────────────────────────────────────────────────────────
  /** Minimum peer review score. */
  PEER_REVIEW_SCORE_MIN: 0,
  /** Maximum peer review score. */
  PEER_REVIEW_SCORE_MAX: 100,

  // ── Caching ─────────────────────────────────────────────────────────────
  /** Adapter cache hash length. */
  ADAPTER_CACHE_HASH_LENGTH: 16,

  // ── Alerting ────────────────────────────────────────────────────────────
  /** Maximum alert history size. */
  ALERT_MAX_HISTORY_SIZE: 100,

  // ── Environment ─────────────────────────────────────────────────────────
  /** Environment variable name for debug mode. */
  DEBUG_ENV_VAR: "OBORA_DEBUG",
} as const;
