# Compat and Deprecation Inventory

This inventory defines how active source mentions of `legacy`, `deprecated`, `backward compat`, and `compatibility` are handled during the 0.x release-readiness period.

## Policy

- Deprecated public API is not removed in this release-readiness cycle.
- `_legacy` source paths must not be restored.
- Runtime deprecated accessors stay until a planned breaking cleanup.
- Compatibility behavior tied to current parser/runtime behavior stays unless a separate migration plan removes it.
- New compat/deprecation mentions in active source must be added to `scripts/release/compat-allowlist.txt` with a classification and reason.

## Classifications

- `keep`: intentional live behavior or regression coverage.
- `deprecate`: public or semi-public compatibility surface retained with replacement guidance.
- `remove-later`: known cleanup target that is not safe to remove in this release-readiness cycle.

## Current Follow-up Candidates

- Standardize runtime blackboard deprecation comments so each retained accessor names the replacement.
- Plan a future breaking cleanup for reflector compatibility entrypoints and audit re-export aliases.
- Continue SDK test type-safety cleanup by reducing `scripts/release/test-type-debt-allowlist.txt` counts rather than allowing new casts.

## Verification

```bash
pnpm verify:compat
pnpm verify:test-type-debt
```

These commands are tracking gates. They do not prove that every compatibility behavior is desirable; they prevent untracked compatibility debt from silently growing.
