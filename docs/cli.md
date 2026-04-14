# CLI Reference (`obora`)

## Table of Contents

- [Global Options](#global-options)
- [Exit Codes](#exit-codes)
- [`obora init`](#obora-init)
- [`obora quickstart`](#obora-quickstart)
- [`obora models`](#obora-models)
- [`obora doctor`](#obora-doctor)
- [`obora run`](#obora-run)
- [`obora test`](#obora-test)
- [`obora plugin`](#obora-plugin)
- [`obora audit`](#obora-audit)
- [`obora policy`](#obora-policy)

---

## Global Options

Available on the root command (`obora`):

- `--verbose` — show detailed progress and diagnostics.
- `--no-color` — disable ANSI colors.
- `--json` — output machine-readable JSON.
- `-q, --quiet` — suppress non-essential output.

Example:

```bash
obora --verbose --no-color run workflows/example.yaml
```

---

## Quickstart First-Run Path

If you are starting from zero, use this order:

```bash
obora quickstart my-project
cd my-project
obora doctor
obora judge --dry-run
obora judge
```

Why this order:
- `init --quickstart` creates the smallest runnable project
- `doctor` tells you whether auth/config is missing
- `judge --dry-run` validates the workflow before execution
- `judge` starts the real judge workflow

---

## Exit Codes

Defined in `packages/cli/src/utils/exit-codes.ts`:

- `0` `SUCCESS`
- `2` `VALIDATION_ERROR`
- `3` `EXECUTION_FAILED`
- `4` `GATE_TIMEOUT`
- `10` `CLI_ERROR`

Error-to-exit mapping uses SDK error code prefixes (`POLICY_*`, `CELL_*`, `ORCH_*`, etc.).

---

## `obora quickstart`

Shortcut for creating a minimal judge-mode project.

### Usage

```bash
obora quickstart [name]
obora quickstart my-project
```

### Behavior

- Equivalent to `obora init [name] --quickstart`
- Creates the same quickstart scaffold as `init --quickstart`
- Intended as the shortest first-run command

---

## `obora models`

List provider model refs from the installed `pi-ai` catalog.

### Usage

```bash
obora models
obora models openai
obora models openai gpt-5.4
obora --json models anthropic sonnet
```

### Behavior

- uses the installed `@mariozechner/pi-ai` runtime catalog as the source of truth
- without a provider, lists available providers and model counts
- with a provider, lists the supported model refs for that provider
- useful for choosing a valid `OPENAI_MODEL`, `ANTHROPIC_MODEL`, or `providers.<name>.defaultModel`

---

## `obora doctor`

Diagnose local Obora setup and show the shortest next action.

### Usage

```bash
obora doctor
obora --json doctor
```

### What it checks

- Node.js availability
- project config presence (`.obora/config.yaml`)
- global config presence (`~/.obora/config.yaml`)
- current provider/model resolution
- auth source / config source
- fallback/stub state
- recommended next actions
- next place to edit

### Example

```bash
obora init demo --quickstart
cd demo
obora doctor
```

Expected output includes:

- top-level status like `Ready: openai/gpt-4o-mini` or `Needs auth: ...`
- whether project/global config exists
- auth/config/stub summary lines
- `Execution Resolution`
- warnings like stub/fallback activation
- `Recommended next actions:` with concrete commands
- a final `Next step: ...` hint

---

## `obora init`

Initialize a new Obora project.

### Usage

```bash
obora init [name] [options]
obora init my-project --quickstart
```

### Options

- `--template <name>` (default: `default`)
- `--quickstart` initialize a judge-mode quickstart scaffold
- `-y, --yes` skip prompts and use defaults

### Behavior

- If `name` is provided, creates that directory and initializes files there.
- If `name` is omitted, initializes files in the current directory.

Default template creates:

- `workflow.yaml`
- `policy.yaml`
- `agents.yaml`
- `obora.config.yaml`
- `.gitignore`

Quickstart template creates:

- `judge.yaml`
- `.obora/config.yaml`
- `artifacts/submission.json`
- `artifacts/submission.schema.json`
- `artifacts/result.schema.json`
- `.gitignore`

### Example

```bash
mkdir my-obora && cd my-obora
obora init --yes
obora init demo --quickstart
cd demo
obora doctor
obora judge --dry-run
```

---

## `obora run`

Execute a workflow by name or YAML path.

For quickstart judge-mode projects, prefer the shorter alias:

```bash
obora judge
obora judge --dry-run
obora judge workflows/judge.yaml --dry-run
```

### Usage

```bash
obora run <workflow> [options]
```

### Options

- `-i, --input <json>` input JSON string, `@path/to/input.json`, or `@-` for stdin
- `-v, --var <key=value...>` repeatable variables
- `--policy <path>` policy YAML path
- `--dry-run` validate only (no execution) and print resolution/binding/output previews when available
- `--timeout <ms>` execution timeout in milliseconds

### Examples

```bash
obora run workflow.yaml
obora run workflow.yaml --input '{"topic":"safety"}'
obora run workflow.yaml --input @artifacts/input.json
printf '{"topic":"safety"}' | obora run workflow.yaml --input @-
obora run my-workflow --var env=prod --var region=ap-northeast-2
obora run workflow.yaml --dry-run
obora judge --input @artifacts/submission.json --dry-run
cat artifacts/submission.json | obora judge --input @- --dry-run
obora judge --dry-run
obora --json judge --dry-run
```

Dry-run output includes:
- `Execution Resolution`
- `Binding Preview` / `Output Preview` in text mode when previewable paths exist
- `resolution`, `bindingPreview`, and `outputPreview` in JSON mode
- for quickstart one-file judge workflows, preview entries are derived from the expanded `config.judge` input/output paths

### Exit Codes

- `0` success
- `2` invalid input JSON or validation failure
- `3` runtime execution failure
- `4` timeout/abort mapped from gate/abort conditions

---

## `obora test`

Run fixture-based workflow tests.

### Usage

```bash
obora test [target] [options]
```

### Options

- `--fixture <path>` fixture file path (`.yaml`/`.yml`)
- `--filter <pattern>` filter fixtures by name

### Behavior

- If target is omitted, defaults to `./tests`.
- Supports single YAML fixture or directory of fixtures.
- Uses SDK test APIs: `loadFixture(s)`, `fixtureToTestCase`, `runWorkflowTest`.

### Examples

```bash
obora test
obora test ./tests
obora test --fixture ./tests/happy-path.yaml
obora test ./tests --filter recovery
```

### Exit Codes

- `0` all selected tests passed
- `2` invalid path/format
- `3` one or more tests failed

---

## `obora plugin`

Manage plugins.

### Usage

```bash
obora plugin <subcommand>
```

### Subcommands

#### `obora plugin list`

List discovered plugins from `node_modules`.

```bash
obora plugin list
obora plugin list --json
```

#### `obora plugin install <name>`

Install plugin via `npm install <name>` and validate discovery.

```bash
obora plugin install @example/obora-plugin-foo
```

#### `obora plugin remove <name>`

Remove plugin via `npm uninstall <name>` and verify removal.

```bash
obora plugin remove @example/obora-plugin-foo
```

#### `obora plugin inspect <name>`

Load and inspect plugin metadata + exported symbols.

```bash
obora plugin inspect @example/obora-plugin-foo --json
```

### Exit Codes

- `0` success
- `2` validation errors (plugin not found, invalid args)
- `3` npm/install/remove/inspect execution failures

---

## `obora runs`

Query persisted run records (requires persistence enabled).

### Usage

```bash
obora runs <subcommand>
```

### Subcommands

#### `obora runs list`

```bash
obora runs list \
  [--status <status>] \
  [--workflow <name>] \
  [--repair-loop <with|without|stalled|exhausted|critical|no-progress>] \
  [--sort <startedAt|validationFailed|repairStarted>] \
  [--order <asc|desc>] \
  [--limit <n>] \
  [--json]
```

List persisted runs with optional workflow / repair-loop filtering and triage-oriented sorting.

Text output includes:
- `Loop State` column (`EXHAUSTED`, `STALLED`, `CONVERGED`, `REPAIRED`, `PASSED`, `-`)
- compact repair-loop summary (`F/R/P/N/X` style counts + latest validation summary when available)

Loop state precedence:
1. `EXHAUSTED` — `backEdgeExhausted > 0`
2. `STALLED` — `repairNoProgress > 0`
3. `CONVERGED` — both validation failures and passes recorded
4. `REPAIRED` — repair activity recorded without a convergence signal yet
5. `PASSED` — persisted repair-loop metadata exists but no repair/failure signal is present
6. `-` — no persisted repair-loop metadata

Examples:

```bash
# most recent exhausted runs
obora runs list --repair-loop exhausted --sort startedAt --order desc

# runs that stopped on repeated critical issue ceiling
obora runs list --repair-loop critical --sort startedAt --order desc

# runs that stopped on explicit no-progress detection
obora runs list --repair-loop no-progress --sort startedAt --order desc

# runs with the most validation failures first
obora runs list --repair-loop with --sort validationFailed --order desc

# runs with the fewest repair attempts first
obora runs list --repair-loop with --sort repairStarted --order asc
```

#### `obora runs inspect <runId>`

```bash
obora runs inspect <runId> [--json] [--cost]
```

Show run details including step records, artifacts, and repair-loop inspection summaries.
If persisted `run.metadata.repairLoop` is present, CLI uses it first and falls back to audit replay only when needed.

---

## `obora dlq`

Dead-letter queue triage commands.

### Usage

```bash
obora dlq <subcommand>
```

### Subcommands

#### `obora dlq list`

```bash
obora dlq list [--status <pending|reviewed|retried|dismissed>] [--limit <n>] [--offset <n>] [--file <path>] [--json]
```

List DLQ entries sorted by newest first. Text output includes workflow, status, repair attempt count, and persisted `metadata.repairLoop.lastStopCategory` when present.

Examples:

```bash
# newest pending DLQ entries
obora dlq list --status pending

# inspect a custom DLQ file
obora dlq list --file ./data/.obora/dlq/dead-letters.json --json
```

#### `obora dlq inspect <entryId>`

```bash
obora dlq inspect <entryId> [--file <path>] [--json]
```

Show one DLQ entry including error, repair attempts, resolution fields, and raw metadata.
If a persisted run record exists for the same `executionId`, CLI also includes a compact related-run summary and a ready-to-run `obora runs inspect <runId>` hint.

#### `obora dlq summary`

```bash
obora dlq summary [--file <path>] [--json]
```

Show aggregate DLQ counts (`pending`, `reviewed`, `retried`, `dismissed`) plus oldest pending timestamp.

#### `obora dlq resolve <entryId>`

```bash
obora dlq resolve <entryId> --status <reviewed|retried|dismissed> [--actor <name>] [--note <text>] [--file <path>] [--json]
```

Resolve a DLQ entry and persist actor/note metadata.

### Exit Codes

- `0` success
- `2` invalid args or DLQ entry not found
- `3` DLQ storage/config/runtime errors

---

## `obora audit`

Audit trail commands.

### Usage

```bash
obora audit <subcommand>
```

### Subcommands

#### `obora audit query`

```bash
obora audit query [--execution <id>] [--type <type>] [--limit <n>]
```

Queries audit events from the execution log store.

#### `obora audit tail`

```bash
obora audit tail [--execution <id>]
```

Streams audit events for a running or completed execution.

#### `obora audit replay <runId>`

Show structured audit replay timeline for a persisted run.

Options:

- `--step <stepName>` filter timeline by step name

Example:

```bash
obora audit replay run-123
obora audit replay run-123 --step review
```

### Exit Codes

- `0` success
- `2` invalid args
- `3` replay/lookup errors

---

## `obora policy`

Policy validation commands.

### Usage

```bash
obora policy validate <path>
```

### Behavior

- Accepts `.yaml`/`.yml` files.
- Tries policy parsing first (`Policy.fromYaml`).
- If policy parse fails, tries workflow parsing (`Workflow.fromYaml`).
- Reports file as `policy` or `workflow` when valid.

### Example

```bash
obora policy validate policies/default.yaml
obora policy validate workflows/example.yaml --json
```

### Exit Codes

- `0` valid policy/workflow YAML
- `2` unsupported extension or invalid YAML schema
- `3` unexpected runtime failure
