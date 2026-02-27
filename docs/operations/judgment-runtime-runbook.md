# Judgment Runtime Runbook

> TASK-M1-28 · Last updated: 2026-02-28

## Overview

This runbook covers the 4 primary error codes emitted by the Judgment Runtime.
Each section includes: symptoms, reproduction steps, log locations, and resolution procedure.

---

## Error Codes

### 1. RESOLVE_ERROR

**When:** Policy or schema resolution fails from both memory and local stores.

**Symptoms:**
- Log event: `resolve_error` with `errorCode: "RESOLVE_ERROR"`
- Engine cannot proceed; run terminates as `failed`

**Log location:**
```bash
# Search for resolve errors in structured logs
grep '"event":"resolve_error"' /var/log/obora/judgment.log | jq .
```

**Reproduce:**
```bash
# Run with a non-existent policy ref
pnpm --filter @obora/runtime exec vitest run src/judgment/__tests__/JudgmentPolicy.test.ts
```

**Resolution procedure:**
1. Check `policyRef` and `schemaRef` in the log entry
2. Verify the referenced files exist in the local store path
3. If using memory store, confirm the store was populated before the run
4. Check for typos in ref strings (case-sensitive)
5. Restart the runtime after fixing refs

**Escalation:** If refs are correct but still failing → check store initialization order; file a bug with the `snapshotHash` from the last successful run.

---

### 2. VALIDATION_ERROR

**When:** Raw model output has correct JSON structure but invalid field values (e.g., missing `judgmentStatus`).

**Symptoms:**
- Normalizer returns `errorCode: "VALIDATION_ERROR"`
- `judgmentStatus` forced to `fail`, score to 0
- P1 issue appended with validation message

**Log location:**
```bash
grep '"errorCode":"VALIDATION_ERROR"' /var/log/obora/judgment.log | jq .
```

**Reproduce:**
```bash
# Normalizer test with invalid status
pnpm --filter @obora/runtime exec vitest run src/judgment/__tests__/JudgmentNormalizer.test.ts
```

**Resolution procedure:**
1. Identify the model producing invalid output from `meta.model` in logs
2. Check the raw output — is `judgmentStatus` present and one of `"pass"` | `"fail"`?
3. If model prompt changed recently, revert and re-test
4. If model API version changed, update the normalizer's expected schema

**Escalation:** If multiple models fail validation simultaneously → likely a schema version mismatch; check `engineVersion` field.

---

### 3. MALFORMED_JSON

**When:** Raw model output cannot be parsed as JSON or is not a plain object.

**Symptoms:**
- Normalizer returns `errorCode: "MALFORMED_JSON"`
- `judgmentStatus` forced to `fail`, score to 0
- Common with model hallucination, truncated responses, or rate-limit error pages

**Log location:**
```bash
grep '"errorCode":"MALFORMED_JSON"' /var/log/obora/judgment.log | jq .
```

**Reproduce:**
```bash
pnpm --filter @obora/runtime exec vitest run src/judgment/__tests__/JudgmentNormalizer.test.ts -t "MALFORMED"
```

**Resolution procedure:**
1. Retrieve the raw model response from the ingestion layer
2. Check if response is truncated (token limit hit) or contains HTML (rate limit page)
3. If truncated: increase `max_tokens` in model config
4. If rate-limited: check API quota and backoff settings
5. If model returning markdown-wrapped JSON: add a stripping preprocessor

**Escalation:** If >10% of responses are malformed → alert the model ops team; consider switching to a backup model.

---

### 4. TIMEOUT

**When:** Step execution exceeds `timeoutMs` or the overall batch exceeds `batchDeadlineMs`.

**Symptoms:**
- Engine log: `state_transition` to `timeout`
- `errorCode: "TIMEOUT"` in final result
- May trigger after retries are exhausted

**Log location:**
```bash
grep '"errorCode":"TIMEOUT"' /var/log/obora/judgment.log | jq .
# Check durationMs to see actual elapsed time
```

**Reproduce:**
```bash
pnpm --filter @obora/runtime exec vitest run src/judgment/__tests__/JudgmentEngine.test.ts -t "timeout"
```

**Resolution procedure:**
1. Check `durationMs` in the log — is it close to `timeoutMs` or `batchDeadlineMs`?
2. If step timeout: the model/judge function is slow → check model latency metrics
3. If batch deadline: too many retries + backoff accumulated → reduce `maxRetries` or `backoffMs`
4. Check network connectivity to model API endpoints
5. Temporarily increase `timeoutMs` if the model is known to be slow during peak hours

**Escalation:** If timeouts persist >15min → check model API status page; switch to fallback model if available.

---

## General Troubleshooting

### Quick diagnosis command
```bash
# Last 20 judgment errors
grep -E '"event":"(resolve_error|state_transition)"' /var/log/obora/judgment.log | tail -20 | jq '{event, runId, errorCode, durationMs, workflow}'
```

### Running the judgment gate locally
```bash
./scripts/ci/judgment-gate.sh
```

### Key log fields for triage
| Field | Purpose |
|-------|---------|
| `runId` | Correlate all events for a single run |
| `workflow` | Which workflow (review/qa/release) |
| `runState` | Final state of the run |
| `errorCode` | Primary error classification |
| `snapshotHash` | Policy+schema version at time of run |
| `durationMs` | Performance / timeout diagnosis |

### Contact
- On-call: #obora-oncall Slack channel
- Escalation: file issue with label `judgment-runtime`
