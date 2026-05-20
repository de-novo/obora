# CLI Reference (`obora`)

## Table of Contents

- [Global Options](#global-options)
- [Start Here](#start-here)
- [Exit Codes](#exit-codes)
- [Command Groups by Use Case](#command-groups-by-use-case)
- [Detailed Command Reference](#detailed-command-reference)
- [`obora init`](#obora-init)
- [`obora quickstart`](#obora-quickstart)
- [`obora models`](#obora-models)
- [`obora agents`](#obora-agents)
- [`obora doctor`](#obora-doctor)
- [`obora auth`](#obora-auth)
- [`obora expand`](#obora-expand)
- [`obora judge`](#obora-judge)
- [`obora run`](#obora-run)
- [`obora chat`](#obora-chat)
- [`obora workflow`](#obora-workflow)
- [`obora status`](#obora-status)
- [`obora validate`](#obora-validate)
- [`obora test`](#obora-test)
- [`obora plugin`](#obora-plugin)
- [`obora runs`](#obora-runs)
- [`obora inspect`](#obora-inspect)
- [`obora resume`](#obora-resume)
- [`obora knowledge`](#obora-knowledge)
- [`obora dlq`](#obora-dlq)
- [`obora artifact`](#obora-artifact)
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

## Start Here

If you are starting from zero, use this order:

```bash
obora quickstart my-project
cd my-project
obora doctor
obora validate judge.yaml
# Optional: inspect the expanded one-file workflow after edits
obora expand --json -- judge.yaml
obora --json expand judge.yaml
obora judge --dry-run
obora judge
```

Why this order:

- `quickstart` / `init --quickstart` creates the smallest runnable judge-mode project
- `doctor` shows onboarding readiness and project-aware next actions
- `validate judge.yaml` catches one-file workflow shape issues before execution
- `expand --json -- judge.yaml` is the optional deeper inspection step after editing the one-file workflow
- `judge --dry-run` previews the resolved execution without starting it
- `judge` starts the real judge workflow

Need a shorter operator flow, support boundary, or capability inventory first?

- [Operator Guide](./operator-guide.md)
- [Current Capabilities](./current-capabilities.md)
- [Support Scope](./support-scope.md)

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

## Command Groups by Use Case

### 1. Start a project

Use these when you are trying to get from zero to first successful execution.

- `obora quickstart`
- `obora init`
- `obora doctor`
- `obora validate`
- `obora judge`

Typical path:

```bash
obora quickstart my-project
cd my-project
obora doctor
obora validate judge.yaml
# Optional: inspect the expanded one-file workflow after edits
obora expand --json -- judge.yaml
obora --json expand judge.yaml
obora judge --dry-run
obora judge
```

### 2. Diagnose and preview before execution

Use these when you want to confirm config, auth, workflow shape, or expanded execution state before running.

- `obora doctor`
- `obora models`
- `obora agents`
- `obora auth`
- `obora validate`
- `obora expand`
- `obora run --dry-run`

Typical path:

```bash
obora doctor
obora validate workflow.yaml
obora expand --json -- workflow.yaml
obora --json expand workflow.yaml
obora --json run workflow.yaml --dry-run --dump-expanded-workflow --show-stop-semantics
```

### 3. Execute workflows

Use these when you are ready to actually run work.

- `obora judge`
- `obora run`
- `obora chat`
- `obora test`
- `obora policy`

Typical path:

```bash
obora run workflow.yaml
obora chat workflow.yaml --dry-run
obora test workflow.yaml
```

### 4. Operate, inspect, and recover

Use these after runs exist and you need operator visibility or manual follow-up.

- `obora status`
- `obora runs`
- `obora inspect`
- `obora resume`
- `obora dlq`
- `obora artifact`
- `obora audit`
- `obora knowledge`

Typical path:

```bash
obora status
obora runs list
obora inspect <runId>
obora dlq list
obora audit replay <runId>
```

---

## Detailed Command Reference

## `obora quickstart`

Shortcut for creating a minimal judge-mode project.

### Usage

```bash
obora quickstart [name]
obora quickstart my-project
obora quickstart my-project --json
obora --json quickstart my-project
```

### Behavior

- Equivalent to `obora init [name] --quickstart`
- Supports both local `obora quickstart ... --json` and root `obora --json quickstart ...`
- Creates the same quickstart scaffold as `init --quickstart`
- Prints quickstart next steps in the order `doctor -> validate judge.yaml -> judge --dry-run -> judge`
- Intended as the shortest first-run command

### Exit Codes

- `0` scaffold created successfully
- `3` scaffold initialization failure

---

## `obora models`

List provider model refs from the installed `pi-ai` catalog.

### Usage

```bash
obora models
obora models gpt-5.4
obora models openai
obora models openai gpt-5.4
obora models openai --json
obora --json models gpt-5.4
obora --json models anthropic sonnet
```

### Behavior

- uses the installed `@earendil-works/pi-ai` runtime catalog as the source of truth
- supports both local `obora models ... --json` and root `obora --json models ...`
- without a provider, lists available providers and model counts
- with an unknown first argument, treats that value as a cross-provider global search query
- with a provider, lists the supported model refs for that provider
- if you pass an explicit provider plus query and the provider is unknown, exits with code `2`
- useful for choosing a valid `OPENAI_MODEL`, `ANTHROPIC_MODEL`, or `providers.<name>.defaultModel`

---

## `obora agents`

Inspect visible agent resolution and safely manage config-layer overrides.

### Usage

```bash
obora agents list
obora agents list --json
obora agents list --agents agents.yaml --workflow judge.yaml
obora agents show reviewer
obora agents show reviewer --json
obora agents show reviewer --agents agents.yaml --workflow judge.yaml
obora agents set reviewer --provider openai --model gpt-5.4 --dry-run
obora agents set reviewer --model gpt-5.4 --dry-run
obora agents reset reviewer --scope global --json
obora --json agents show reviewer
```

### Subcommands

- `agents list` — list visible agent names with compact resolution summaries
- `agents show <name>` — show layered config provenance plus execution-source visibility for one agent
- `agents set <name>` — set config-layer provider/model overrides for project/global scope
- `agents reset <name>` — remove config-layer overrides for project/global scope
- `--agents <path>` — include `agentsPath` YAML visibility in the read-side snapshot
- `--workflow <path>` — include workflow-local `agents` visibility from a workflow YAML
- `--dry-run` — preview `set/reset` changes without writing config

### Behavior

- supports both local `--json` and root `obora --json agents ...`
- consumes adapters/sdk helpers instead of parsing YAML directly in the CLI
- `list` returns a compact summary payload and text inventory view
- `show` returns config provenance and execution-source visibility separately
- `show` text mode also prints the current cwd plus resolved `--agents` / `--workflow` paths as a context summary
- `set/reset` only touch project/global `.obora/config.yaml` and never mutate `agentsPath`, workflow-local `agents`, or runtime registrations
- `set/reset --dry-run` return preview output without writing config
- mutation text/JSON payloads include changed keys, and `set` also includes requested vs resolved override values
- `set` accepts full `--provider` + `--model`, or a partial override when the missing field already exists in the same target config layer
- `--agents` and `--workflow` let `list/show` truthfully include execution-only sources instead of showing only config-side visibility
- mutation validation failures exit with code `2`
- visible-agent lookup failures exit with code `2`
- inventory/snapshot/mutation execution failures exit with code `3`

### Exit Codes

- `0` command completed successfully
- `2` agent not found in visible sources / invalid mutation input
- `3` failed to load agent inventory / failed to build agent snapshot / failed to write agent override

---

## `obora doctor`

Diagnose local Obora setup and onboarding readiness.

### Usage

```bash
obora doctor
obora doctor --json
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
- `Recommended next actions:` with project-aware commands
  - quickstart/judge projects use `obora validate judge.yaml`, `obora judge --dry-run`, `obora judge`
  - non-judge projects fall back to `obora run <workflow.yaml> --dry-run` / `obora run <workflow.yaml>`
  - when `.obora/config.yaml` already defines named agent overrides, doctor also points to `obora agents list` and `obora agents show <name>` for operator triage
  - if drift exists, the `agents show <name>` hint prioritizes the first drifted agent instead of the first alphabetic agent overall
- warnings now include provider mismatch/conflict plus named agent override drift when an agent diverges from the current resolved default path; drift preview covers explicit provider/model and agent-level `temperature`
- drifted agent overrides also add safe preview follow-ups like `obora agents reset <name> --dry-run`; when several agents drift, doctor prioritizes provider/model drift ahead of temperature-only drift, then surfaces up to two reset previews and leaves the rest to `obora agents list/show`
- a final `Next step: ...` hint

Supports both local `obora doctor --json` and root `obora --json doctor`.

When `judge.yaml` exists in the current project, doctor guidance prefers judge-specific commands.
Otherwise it keeps generic workflow guidance such as `obora run <workflow.yaml> --dry-run`.

### Exit Codes

- `0` doctor completed successfully
- `3` doctor config/resolution load failure

---

## `obora auth`

Manage the global provider-auth store used by Obora adapters.

### Usage

```bash
obora auth list
obora auth add openai --apiKey "$OPENAI_API_KEY"
obora auth test openai --json
obora --json auth list
obora --json auth test openai
```

### Subcommands

- `auth add <provider>` — save or update provider credentials in `~/.obora/auth.json`
- `auth list` — list masked provider auth entries
- `auth remove <provider>` — remove a saved provider entry
- `auth test <provider>` — call the provider API with the saved auth entry

### Behavior

- supports both local `--json` and root `obora --json auth ...` on every subcommand
- `auth add` accepts `--type apiKey|token|oauth` plus matching credential flags
- if `--type` is omitted, auth type is inferred from the provided fields
- `auth list` masks secret values before printing JSON or table output
- `auth test --json` returns the masked saved auth entry together with the test result
- missing provider entries, invalid auth types, and unsupported `auth test` providers exit with code `2`
- auth-store load/save/remove failures and failed provider connection tests exit with code `3`

### Exit Codes

- `0` command completed successfully
- `2` invalid auth type / missing provider auth / unsupported auth test target
- `3` auth store operation failure / failed provider auth test

---

## `obora init`

Initialize a new Obora project.

### Usage

```bash
obora init [name] [options]
obora init my-project --quickstart
obora init my-project --json
obora --json init my-project --quickstart
```

### Options

- `--template <name>` (default: `default`)
- `--quickstart` initialize a judge-mode quickstart scaffold
- `--json` output scaffold result as JSON
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
obora validate judge.yaml
obora judge --dry-run
```

### Exit Codes

- `0` scaffold created successfully
- `3` scaffold initialization failure

---

## `obora expand`

Expand a one-file YAML workflow into its internal workflow graph.

### Usage

```bash
obora expand <file>
obora expand <file> --json
obora --json expand <file>
```

### Behavior

- supports both local `obora expand <file> --json` and root `obora --json expand <file>`
- reads the source YAML and derives one-file stop semantics
- prints expanded workflow plus stop semantics in JSON mode
- missing input files or invalid YAML return exit code `2`
- workflow expansion failures return exit code `3`

### Example

```bash
obora expand workflows/project-loop.yaml
obora expand workflows/project-loop.yaml --json
obora --json expand workflows/project-loop.yaml
```

### Exit Codes

- `0` successful expansion
- `2` missing source file or invalid YAML
- `3` workflow expansion failure

---

## `obora judge`

Run the judge-mode workflow alias.

### Usage

```bash
obora judge [workflow] [options]
obora judge --json
obora --json judge
```

### Behavior

- Defaults to `judge.yaml` when no workflow path is provided.
- Shares the same execution options and exit-code contract as `obora run`.
- Supports both local `--json` and root `obora --json judge ...`.
- For one-file workflow shape checks, use `obora validate judge.yaml` before `judge --dry-run`.
- Dry-run guidance prefers `obora judge` instead of `obora run judge.yaml` when the workflow target resolves to judge mode.

### Examples

```bash
obora judge
obora judge --dry-run
obora judge workflows/judge.yaml --dry-run
obora judge --json --dry-run
obora --json judge --dry-run
```

### Exit Codes

- `0` success
- `2` validation failure or invalid input JSON
- `3` runtime execution failure
- `4` timeout/abort mapped from gate/abort conditions

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
obora run <workflow> --json
obora --json run <workflow>
obora judge [workflow] --json
obora --json judge [workflow]
```

### Options

- `--json` output structured execution results as JSON
- `-i, --input <json>` input JSON string, `@path/to/input.json`, or `@-` for stdin
- `-v, --var <key=value...>` repeatable variables
- `--policy <path>` policy YAML path
- `--dry-run` validate only (no execution) and print resolution/binding/output previews when available
- `--timeout <ms>` execution timeout in milliseconds (positive integer only)
- `--scope <project|global|all>` resolve bare workflow names from project/global workflow roots
- `--project <path>` project root for scoped workflow discovery
- `--global-workflows-dir <path>` global workflow directory override

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
obora judge --json --dry-run
obora --json judge --dry-run
```

Behavior:

- Supports both local `--json` and root `--json` for `run` and `judge`.
- Bare workflow names first attempt project/global workflow file resolution. If no file candidate exists, the name remains a runtime workflow name.
- Ambiguous project/global workflow names fail before execution; pass `--scope project`, `--scope global`, or an exact YAML path.
- `--timeout` must be a positive integer; malformed values fail with exit code `2`.

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

## `obora chat`

Start a TUI chat session that sends user messages into a selected workflow.

### Usage

```bash
obora chat [workflow] [--scope project|global|all] [--dry-run]
obora chat [workflow] --once <message> --dry-run
obora chat --workflow <workflow> --session <id>
```

### Options

- `--workflow <workflow>` workflow name or YAML path; overrides the positional workflow
- `--scope <project|global|all>` resolve workflow names from project/global workflow roots
- `--project <path>` project root for scoped workflow discovery
- `--global-workflows-dir <path>` global workflow directory override
- `--session <id>` stable chat session id
- `--once <message>` run one chat message and exit, useful for automation and smoke tests
- `--dry-run` validate the selected workflow without live execution
- `--provider <name>` LLM provider override for workflow runs
- `--model <name>` LLM model override for workflow runs
- `--config <path>` obora config YAML path
- `--agents <path>` agents YAML path
- `--policy <path>` policy YAML path
- `--timeout <ms>` execution timeout in milliseconds
- `--json` print the final chat session state after exit

### Behavior

- Renders an `@earendil-works/pi-tui` differential terminal chat console with a Codex/Claude-style session card, conversation stream, workflow inspector, run/audit state, and bottom command bar.
- A plain message runs the selected workflow with input shaped as `{ message, sessionId, workflow }`.
- `/workflow <name-or-path>` switches the selected workflow inside the same session.
- `/run <task>` runs the current workflow with an explicit task message.
- `/help` prints available chat commands.
- `/exit` or `/quit` closes the chat session.
- Non-TTY automation must use `--once <message>`.

### Examples

```bash
obora chat release-readiness --scope project
obora chat release-readiness --scope project --dry-run --once "prepare release notes"
obora chat --workflow ~/.obora/workflows/code-review.yaml --session review-session
obora chat release-readiness --model deepseek/deepseek-v4-flash:free
```

### Exit Codes

- `0` success
- `2` invalid scope, invalid timeout, ambiguous workflow, or missing scoped workflow
- `10` non-TTY interactive usage or CLI failure

---

## `obora workflow`

List, inspect, author, and open workflow files.

Scoped workflow discovery supports project workflows and global reusable workflows:

- project roots: `.obora/workflows`, then `workflows`
- global root: `~/.obora/workflows`, unless `--global-workflows-dir` is provided

### Usage

```bash
obora workflow list [workflows-dir] [--scope all|project|global] [--json]
obora workflow view [target] [--scope project|global] [--no-open] [--json]
obora workflow build [target] [--scope project|global] [--no-open] [--json]
obora workflow show <file> [--json]
obora workflow create <file> [--name <name>] [--description <desc>]
```

### Options

- `--scope <project|global|all>` select workflow scope for discovery or resolution
- `--project <path>` project root for project workflow discovery
- `--global-workflows-dir <path>` global workflow directory override
- `--no-open` start the web bridge without launching a browser
- `--host <host>` local workflow web bridge host
- `--port <port>` local workflow web bridge port
- `--json` output structured command results

### Behavior

- `workflow list --scope all` returns grouped `project` and `global` workflow arrays in JSON mode.
- `workflow view` opens a read-only local web view for the resolved workflow.
- `workflow build` opens an editable local web builder when the resolved locator is editable.
- If project and global workflows share a name, `workflow build <name>` requires `--scope` or an exact path.
- Existing explicit-file commands such as `show`, `create`, `validate`, `add-step`, `remove-step`, and `edit-step` still operate on concrete file paths.

### Examples

```bash
obora workflow list --scope all
obora workflow list --scope global --json
obora workflow view release-readiness --scope project
obora workflow build code-review --scope global
obora workflow build release-readiness --scope project --no-open --json
obora run release-readiness --scope project --dry-run
```

### Exit Codes

- `0` success
- `2` invalid scope, ambiguous workflow, or missing scoped workflow
- `10` local web bridge or CLI failure

---

## `obora status`

Show a persisted run and DLQ overview for operators.

### Usage

```bash
obora status [--workflow <name>] [--limit <n>] [--json]
obora --json status [--workflow <name>] [--limit <n>]
```

### Options

- `--workflow <name>` filter recent runs to a single workflow
- `--limit <n>` number of recent runs to include (default `5`)
- `--json` output structured status JSON

### Behavior

- Supports both local `obora status --json` and root `obora --json status`.
- Reads recent persisted runs from the current runtime persistence adapter.
- Loads DLQ counts from the configured DLQ store.
- Text output shows:
  - top-level run count summary
  - latest run details
  - linked DLQ indicator when present
  - DLQ summary counts
  - compact recent-runs table

### Examples

```bash
obora status
obora status --workflow repair-workflow
obora status --limit 10 --json
obora --json status --workflow judge
```

### Exit Codes

- `0` success
- `2` invalid limit
- `3` failed to load persisted runs or DLQ state

---

## `obora validate`

Validate workflow YAML files under `.obora/workflows` and `.obora/features`, or a specific file.

### Usage

```bash
obora validate [target] [--all] [--file <path>] [--strict] [--format <default|json>] [--json]
obora --json validate [target] [--all] [--file <path>] [--strict]
```

### Options

- `[target]` positional workflow file path to validate
- `--all` validate all workflow YAML files under `.obora/workflows` and `.obora/features`
- `-f, --file <path>` validate a specific workflow file
- `--strict` treat warnings as validation failures
- `-o, --format <default|json>` compatibility output selector; `json` is equivalent to local `--json`
- `--json` output structured validation results as JSON
- `-v, --verbose` show detailed validation output

### Behavior

- Supports both local `obora validate ... --json` and root `obora --json validate ...`.
- Accepts a positional workflow target (`obora validate judge.yaml`) as an alias for `--file`.
- Validates one-file workflows (for example `mode: judge`) through SDK expansion instead of the removed historical graph-parser path.
- One-file validation failures include an `obora expand --json -- <file>` follow-up suggestion for deeper inspection, using shell-safe quoting when needed.
- `[target]` and `--file` are mutually exclusive.
- `--all` cannot be combined with `[target]` or `--file`.
- If neither `[target]` nor `--file` is provided, the command scans `.obora/workflows` and `.obora/features`.
- If no workflow files are found, the command exits successfully and reports an empty result.
- JSON output includes `summary` plus per-file `results`.

### Examples

```bash
obora validate --all
obora validate judge.yaml
obora validate --file .obora/workflows/example.yaml
obora validate judge.yaml --json
obora --json validate --all
```

### Exit Codes

- `0` all selected files valid, or only non-strict warnings
- `2` invalid file path, missing file, validation failure, or strict-mode warnings
- `3` workflow directory scan failure

---

## `obora test`

Run fixture-based workflow tests.

### Usage

```bash
obora test [target] [options]
obora test [target] --json
obora --json test [target]
```

### Options

- `--fixture <path>` fixture file path (`.yaml`/`.yml`)
- `--filter <pattern>` filter fixtures by name
- `--json` output structured test results as JSON

### Behavior

- If target is omitted, defaults to `./tests`.
- Supports both local `obora test ... --json` and root `obora --json test ...`.
- Supports single YAML fixture or directory of fixtures.
- Uses SDK test APIs: `loadFixture(s)`, `fixtureToTestCase`, `runWorkflowTest`.

### Examples

```bash
obora test
obora test ./tests
obora test --fixture ./tests/happy-path.yaml
obora test ./tests --filter recovery
obora test ./tests --json
obora --json test ./tests
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
obora --json plugin <subcommand>
```

### Subcommands

#### `obora plugin list`

List discovered plugins from `node_modules`.
Supports both local `--json` and root `obora --json plugin list`.

```bash
obora plugin list
obora plugin list --json
obora --json plugin list
```

#### `obora plugin install <name>`

Install plugin via `npm install <name>` and validate discovery.
Supports both local `--json` and root `obora --json plugin install ...`.

```bash
obora plugin install @example/obora-plugin-foo
obora plugin install @example/obora-plugin-foo --json
obora --json plugin install @example/obora-plugin-foo
```

#### `obora plugin remove <name>`

Remove plugin via `npm uninstall <name>` and verify removal.
Supports both local `--json` and root `obora --json plugin remove ...`.

```bash
obora plugin remove @example/obora-plugin-foo
obora plugin remove @example/obora-plugin-foo --json
obora --json plugin remove @example/obora-plugin-foo
```

#### `obora plugin inspect <name>`

Load and inspect plugin metadata + exported symbols.
Supports both local `--json` and root `obora --json plugin inspect ...`.

```bash
obora plugin inspect @example/obora-plugin-foo --json
obora --json plugin inspect @example/obora-plugin-foo
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
obora --json runs <subcommand>
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
obora --json runs list \
  [--status <status>] \
  [--workflow <name>] \
  [--repair-loop <with|without|stalled|exhausted|critical|no-progress>] \
  [--sort <startedAt|validationFailed|repairStarted>] \
  [--order <asc|desc>] \
  [--limit <n>]
```

List persisted runs with optional workflow / repair-loop filtering and triage-oriented sorting.

Text output includes:

- `Loop State` column (`EXHAUSTED`, `STALLED`, `CONVERGED`, `REPAIRED`, `PASSED`, `-`)
- `Cause` column showing the latest persisted / linked stop category when available
- `DLQ` column showing the latest linked DLQ status / repair-attempt count as `<status>/<attempts>` when present
- compact repair-loop summary (`F/R/P/N/X` style counts + latest validation summary when available)

JSON output preserves persisted run fields and additionally includes `triageCause` plus `linkedDlqEntry` when a matching DLQ entry exists for the same run.
Both local `--json` and root `obora --json runs ...` are supported.

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
obora --json runs inspect <runId> [--cost]
```

Show run details including step records, artifacts, and repair-loop inspection summaries.
If persisted `run.metadata.repairLoop` is present, CLI uses it first and falls back to audit replay only when needed.
If the run is linked to a DLQ entry, CLI also shows a compact linked-DLQ summary plus a ready-to-run `obora dlq inspect <entryId>` hint.
Both local `--json` and root `obora --json runs inspect <runId>` are supported.

### Exit Codes

- `0` success
- `2` invalid runs filters/options or run not found
- `3` persisted run load/inspect errors

---

## `obora inspect`

Top-level alias for `obora runs inspect`.

### Usage

```bash
obora inspect <runId> [--json] [--no-steps] [--cost]
obora --json inspect <runId> [--no-steps] [--cost]
```

Behavior:

- delegates to the same persisted-run inspection surface as `obora runs inspect`
- supports both local `--json` and root `obora --json inspect <runId>`
- `--no-steps` hides step details while keeping the rest of the run summary intact

### Exit Codes

- `0` success
- `2` run not found
- `3` persisted run load/inspect errors

---

## `obora resume`

Resume a failed or suspended run from persistence/checkpoints.

### Usage

```bash
obora resume <runId> [--from-step <stepName>] [--drift-policy <reject|warn|ignore>] [--json]
obora --json resume <runId> [--from-step <stepName>] [--drift-policy <reject|warn|ignore>]
```

Behavior:

- loads the persisted run record first
- attempts to find and load the workflow file from the current directory or `.obora/workflows/`
- if no workflow file is found, emits a warning and still attempts resume
- supports both local `--json` and root `obora --json resume <runId>`

### Exit Codes

- `0` success
- `2` run not found
- `3` runtime initialization or resume execution failure

---

## `obora knowledge`

Knowledge retrieval and schema inspection commands.

### Usage

```bash
obora knowledge list [--limit <n>] [--json]
obora knowledge query [--tag <tag>] [--project <id>] [--min-confidence <n>] [--limit <n>] [--json]
obora knowledge search <query> [--limit <n>] [--json]
obora knowledge stats [--json]
obora knowledge schema show [--json]
obora --json knowledge stats
```

Behavior:

- reads knowledge entries from `.obora/knowledge.json` or `.obora/knowledge.jsonl`
- supports both local `--json` and root `obora --json knowledge ...`
- validates numeric options like `--limit` and `--min-confidence`
- `schema show --json` parses the schema into structured JSON; without `--json` it prints the raw YAML

### Exit Codes

- `0` success
- `2` invalid knowledge query options
- `3` knowledge file/schema read or query execution errors

---

## `obora dlq`

Dead-letter queue triage commands.

### Usage

```bash
obora dlq <subcommand>
obora --json dlq <subcommand>
```

### Subcommands

#### `obora dlq list`

```bash
obora dlq list [--status <pending|reviewed|retried|dismissed>] [--limit <n>] [--offset <n>] [--file <path>] [--json]
obora --json dlq list [--status <pending|reviewed|retried|dismissed>] [--limit <n>] [--offset <n>] [--file <path>]
```

List DLQ entries sorted by newest first. Text output includes workflow, status, repair attempt count, persisted `metadata.repairLoop.lastStopCategory`, compact related-run status, compact related run loop state, and a truncated latest validation summary when available.

JSON output preserves the existing DLQ payload shape and enriches each listed entry with `triage` plus `relatedRun` (including loop state / stop category when available) when the corresponding persisted run can be resolved.

Supports both local `--json` and root `obora --json dlq list ...`.

Examples:

```bash
# newest pending DLQ entries
obora dlq list --status pending

# inspect a custom DLQ file
obora dlq list --file ./data/.obora/dlq/dead-letters.json --json

# root/global JSON form
obora --json dlq list --limit 5
```

#### `obora dlq inspect <entryId>`

```bash
obora dlq inspect <entryId> [--file <path>] [--json]
obora --json dlq inspect <entryId> [--file <path>]
```

Show one DLQ entry including error, repair attempts, resolution fields, raw metadata, and a curated triage summary (`repairAttempts`, stop category, latest validation/repair context).
Supports both local `--json` and root `obora --json dlq inspect <entryId>`.
If a persisted run record exists for the same `executionId`, CLI also includes:

- a compact related-run summary
- a ready-to-run `obora runs inspect <runId>` hint
- up to 5 most recent related artifact previews with `obora artifact get <runId> <stepName> <name>` fetch hints

#### `obora dlq summary`

```bash
obora dlq summary [--file <path>] [--json]
obora --json dlq summary [--file <path>]
```

Show aggregate DLQ counts (`pending`, `reviewed`, `retried`, `dismissed`) plus oldest pending timestamp.
Supports both local `--json` and root `obora --json dlq summary`.

#### `obora dlq resolve <entryId>`

```bash
obora dlq resolve <entryId> --status <reviewed|retried|dismissed> [--actor <name>] [--note <text>] [--file <path>] [--json]
obora --json dlq resolve <entryId> --status <reviewed|retried|dismissed> [--actor <name>] [--note <text>] [--file <path>]
```

Resolve a DLQ entry and persist actor/note metadata.
Supports both local `--json` and root `obora --json dlq resolve <entryId> ...`.

### Exit Codes

- `0` success
- `2` invalid args or DLQ entry not found
- `3` DLQ storage/config/runtime errors

---

## `obora artifact`

Artifact retrieval commands.

### Usage

```bash
obora artifact get <runId> <stepName> <name> [--output <path>] [--json]
obora --json artifact get <runId> <stepName> <name> --output <path>
```

Download a persisted artifact by run ID, step name, and artifact name.

Behavior:

- without `--output`, the artifact bytes are written directly to stdout
- with `--output`, CLI writes the artifact to the given path and prints the saved path
- with local `--json` or root `obora --json artifact get ...`, CLI writes the artifact to `--output` and returns JSON metadata instead of mixing binary bytes into stdout
- JSON mode requires `--output`

JSON output includes the resolved artifact identity plus `outputPath` and any available persisted metadata such as `mimeType`, `sizeBytes`, and `createdAt`.

### Exit Codes

- `0` success
- `2` artifact not found or invalid JSON/output usage
- `3` artifact runtime/resolve/download/write errors

---

## `obora audit`

Audit trail commands.

### Usage

```bash
obora audit <subcommand>
obora --json audit <subcommand>
```

### Subcommands

#### `obora audit query`

```bash
obora audit query [--execution <id>] [--type <type>] [--limit <n>] [--json]
obora --json audit query [--execution <id>] [--type <type>] [--limit <n>]
```

Queries audit events from the execution log store.
Current implementation is a stub surface that reports the command is not yet connected to a backing audit store.
Supports both local `--json` and root `obora --json audit query ...`.
Invalid `--limit` values return exit code `2`.

#### `obora audit tail`

```bash
obora audit tail [--execution <id>] [--json]
obora --json audit tail [--execution <id>]
```

Streams audit events for a running or completed execution.
Current implementation is a stub surface that reports the command is not yet connected to a backing audit store.
Supports both local `--json` and root `obora --json audit tail ...`.

#### `obora audit replay <runId>`

Show structured audit replay timeline for a persisted run.

Options:

- `--step <stepName>` filter timeline by step name
- `--json` output structured replay JSON

Supports both local `--json` and root `obora --json audit replay <runId>`.

Example:

```bash
obora audit replay run-123
obora audit replay run-123 --step review
obora --json audit replay run-123 --step review
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
obora policy validate <path> --json
obora --json policy validate <path>
```

### Behavior

- Accepts `.yaml`/`.yml` files.
- Supports both local `obora policy validate ... --json` and root `obora --json policy validate ...`.
- Tries policy parsing first (`Policy.fromYaml`).
- If policy parse fails, tries workflow parsing (`Workflow.fromYaml`).
- Reports file as `policy` or `workflow` when valid.
- Unsupported file extensions return exit code `2`.

### Example

```bash
obora policy validate policies/default.yaml
obora policy validate workflows/example.yaml --json
obora --json policy validate workflows/example.yaml
```

### Exit Codes

- `0` valid policy/workflow YAML
- `2` unsupported extension or invalid YAML schema
- `3` unexpected runtime failure
