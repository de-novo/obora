# CLI Reference (`obora`)

## Table of Contents

- [Global Options](#global-options)
- [Exit Codes](#exit-codes)
- [`obora init`](#obora-init)
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

## Exit Codes

Defined in `packages/cli/src/utils/exit-codes.ts`:

- `0` `SUCCESS`
- `2` `VALIDATION_ERROR`
- `3` `EXECUTION_FAILED`
- `4` `GATE_TIMEOUT`
- `10` `CLI_ERROR`

Error-to-exit mapping uses SDK error code prefixes (`POLICY_*`, `CELL_*`, `ORCH_*`, etc.).

---

## `obora init`

Initialize a new Obora project.

### Usage

```bash
obora init [name] [options]
```

### Options

- `--template <name>` (default: `default`)
- `-y, --yes` skip prompts and use defaults

### Behavior

- If `name` is provided, creates that directory and initializes files there.
- If `name` is omitted, initializes files in the current directory.

Creates:

- `workflow.yaml`
- `policy.yaml`
- `agents.yaml`
- `obora.config.yaml`
- `.gitignore`

### Example

```bash
mkdir my-obora && cd my-obora
obora init --yes
```

---

## `obora run`

Execute a workflow by name or YAML path.

### Usage

```bash
obora run <workflow> [options]
```

### Options

- `-i, --input <json>` input JSON string
- `-v, --var <key=value...>` repeatable variables
- `--policy <path>` policy YAML path
- `--dry-run` validate only (no execution)
- `--timeout <ms>` execution timeout in milliseconds

### Examples

```bash
obora run workflow.yaml
obora run workflow.yaml --input '{"topic":"safety"}'
obora run my-workflow --var env=prod --var region=ap-northeast-2
obora run workflow.yaml --dry-run
```

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
obora runs list [--status <status>] [--limit <n>] [--db <path>] [--json]
```

List persisted runs, optionally filtered by status.

#### `obora runs inspect <runId>`

```bash
obora runs inspect <runId> [--db <path>] [--json]
```

Show run details including step records and artifacts.

### Exit Codes

- `0` success
- `2` invalid args or run not found
- `3` storage/runtime errors

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

#### `obora audit replay <executionId>`

Replay an execution using SDK `runtime.replay(...)`.

Options:

- `--mode <mode>` `full` or `from_checkpoint` (default: `full`)
- `--checkpoint <step>` checkpoint step name
- `--dry-run` simulate without applying changes

Example:

```bash
obora audit replay exec-123 --mode from_checkpoint --checkpoint review --dry-run
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
