# Workflow Scope And Web Entry Design

## Status

- Date: 2026-05-20
- Repository: `/Users/novo/Desktop/denovo/obora`
- Scope: design plus first implementation slice. The implemented slice covers SDK resolver, CLI scoped list/view/build, a local workflow web bridge, and scoped `run` name resolution.
- Goal: support workflows that may live at project scope or global scope, then let CLI/TUI/web surfaces resolve, view, build, run, and reuse them consistently.

## Verified Facts

- `packages/sdk/src/project/workflow-manager.ts` currently manages workflows by explicit directory or file path. `listWorkflows(workflowsDir)` recursively scans one directory for `.yaml` files, while `readWorkflow`, `createWorkflow`, `addStep`, `removeStep`, `updateStep`, and `validateWorkflow` operate on a concrete path.
- `packages/cli/src/commands/workflow.ts` exposes explicit-file commands plus scoped `workflow list`, `workflow view`, and `workflow build`.
- `workflow list [workflows-dir]` still supports the legacy positional directory scan when a directory is provided; scoped listing is used when no directory or a scope option is provided.
- `docs/cli.md` documents `validate --all` scanning `.obora/workflows` and `.obora/features`, while `resume` attempts current directory or `.obora/workflows/`.
- `packages/sdk/src/config-loader.ts` already uses global config at `~/.obora/config.yaml` and nearest project config at `.obora/config.yaml`.
- `packages/ops` is the active operator-facing web surface. It currently runs as a Vite app and has hash routes such as `#/workflows`, `#/workflows/<id>/builder`, `#/workflows/<id>/instructions`, `#/workflows/<id>/runs`, and `#/workflows/<id>/settings`.
- `packages/ops` currently uses seeded client-side state for workflows and runs. The first implemented local YAML bridge lives in `packages/cli/src/workflow-web/`; it has not yet been folded into the Vite ops package.

## Implemented First Slice

- Added `packages/sdk/src/workflow-scope/` with typed locators, root resolution, directory scanning, shadowing metadata, and EffectTS-backed resolver APIs.
- Exported `discoverWorkflowLocators`, `resolveWorkflowTarget`, and workflow-scope types from `@obora/sdk`.
- Added scoped `workflow list`, `workflow view`, and `workflow build` CLI behavior.
- Added `packages/cli/src/workflow-web/` as a structured local bridge with separated types, HTML rendering, browser opening, and HTTP server modules.
- Added scoped `run <workflow>` name resolution while preserving direct YAML paths and unresolved runtime workflow names.
- Added targeted SDK and CLI tests, plus direct built-CLI smoke verification against temporary project/global workflow roots.

## Problem

The same workflow name can be reusable globally or owned by a project. A user may run a chat session inside one project, switch from workflow A to workflow B, open a workflow builder, or inspect a workflow graph. Those surfaces must answer the same questions:

- Which workflow is this name referring to?
- Is it project-local, global, or an explicit external file?
- Is it editable from this context?
- If a project workflow and global workflow share the same name, what happens?
- When the web UI opens, which file can it read and write?

Without a shared resolver, CLI commands, TUI chat sessions, and the web builder will drift into different lookup behavior.

## Scope Model

Workflow scope should be represented explicitly.

```typescript
type WorkflowScope = "project" | "global" | "external";

interface WorkflowLocator {
  readonly id: string;
  readonly scope: WorkflowScope;
  readonly name: string;
  readonly path: string;
  readonly displayPath: string;
  readonly editable: boolean;
  readonly projectRoot?: string;
  readonly sourceDir: string;
  readonly shadowedBy?: string;
  readonly shadows?: string;
}
```

### Project Workflow

A project workflow is owned by the current project or workspace. Planned discovery paths:

1. `.obora/workflows`
2. `workflows`

`.obora/workflows` should be preferred because other Obora project state already lives under `.obora`. The existing `workflows` default should remain supported as a compatibility discovery path.

### Global Workflow

A global workflow is reusable across projects. Planned default path:

```text
~/.obora/workflows
```

This follows the existing global config convention of `~/.obora/config.yaml`.

### External Workflow

An external workflow is an explicit file path outside the project and global workflow roots. It can be viewed and run, but should be read-only in the web builder unless a later command explicitly opts into external writes.

## Resolver Contract

Add a shared resolver in SDK or a CLI-owned module that can later move to SDK. The important part is that CLI, TUI, web bridge, and execution use the same rules.

```typescript
interface WorkflowResolveRequest {
  readonly target?: string;
  readonly scope?: "project" | "global" | "all";
  readonly cwd: string;
  readonly projectRoot?: string;
  readonly projectWorkflowDirs?: ReadonlyArray<string>;
  readonly globalWorkflowDir?: string;
}

interface WorkflowResolveResult {
  readonly status: "resolved" | "not-found" | "ambiguous";
  readonly locator?: WorkflowLocator;
  readonly candidates: ReadonlyArray<WorkflowLocator>;
  readonly diagnostics: ReadonlyArray<string>;
}
```

### Resolution Rules

1. If `target` is an existing `.yaml` or `.yml` file path, resolve that exact path.
2. If `--scope project` is provided, search only project workflow roots.
3. If `--scope global` is provided, search only the global workflow root.
4. If `target` is a name and no scope is provided, search project roots and global roots.
5. If exactly one candidate matches, use it.
6. If both project and global candidates match:
   - `workflow view <name>` may resolve to the project workflow and emit a shadowing diagnostic.
   - `workflow build <name>` should return `ambiguous` and require `--scope project`, `--scope global`, or an exact path before writing.
   - `run <name>` should also require disambiguation once name-based file resolution is added, because a run can mutate artifacts and session history.
7. If no `target` is provided, resolve to a list view context rather than a workflow file.

This keeps viewing convenient while preventing accidental edits or runs against the wrong workflow.

## CLI Design

Planned commands:

```bash
obora workflow list [--scope all|project|global] [--json]
obora workflow view [target] [--scope project|global] [--project <path>] [--no-open] [--json]
obora workflow build [target] [--scope project|global] [--project <path>] [--no-open] [--json]
```

`workflow list` should show grouped results:

```text
Project workflows
  release-readiness    .obora/workflows/release-readiness.yaml
  intake-to-decision   workflows/intake-to-decision.yaml

Global workflows
  code-review          ~/.obora/workflows/code-review.yaml
  release-readiness    ~/.obora/workflows/release-readiness.yaml  shadowed by project
```

`workflow view` opens the web graph in read-only mode:

```text
http://127.0.0.1:<port>/#/workflows/<locator-id>/view
```

`workflow build` opens the web builder in editable mode when the locator is editable:

```text
http://127.0.0.1:<port>/#/workflows/<locator-id>/builder
```

Both commands should support `--json` so TUI and automation can reuse the same resolver output without scraping text:

```json
{
  "status": "resolved",
  "locator": {
    "id": "project:release-readiness",
    "scope": "project",
    "name": "release-readiness",
    "path": "/repo/.obora/workflows/release-readiness.yaml",
    "editable": true
  },
  "url": "http://127.0.0.1:5174/#/workflows/project%3Arelease-readiness/builder",
  "diagnostics": []
}
```

## Web Bridge Design

The Vite-only ops app is not enough for local YAML authoring. `workflow build/view` should start a local bridge process that:

- serves the ops web bundle on `127.0.0.1`
- exposes a minimal workflow API
- restricts reads and writes to resolved workflow roots
- carries a per-process capability token so unrelated browser pages cannot mutate local files

Planned API:

```text
GET  /api/workflows?scope=all|project|global
POST /api/workflows/resolve
GET  /api/workflows/:locatorId
PUT  /api/workflows/:locatorId
```

`PUT` must reject non-editable locators, external paths, stale revisions, and paths outside allowed roots.

## Ops UI Design

The list page should make scope visible but not noisy.

```text
+--------------------------------------------------------------------+
| Workflows                                      [New] [Import]       |
+--------------------------------------------------------------------+
| Search...                         Scope: [All v]  Sort: [Recent v] |
+--------------------------+-----------------------------------------+
| Project                  | release-readiness        Project        |
| - Current project        | 7 steps  ready                          |
| - Global library         | [Build] [View] [Run]                    |
| - Tags                   +-----------------------------------------+
|                          | intake-to-decision       Project        |
|                          | 4 steps  draft                          |
|                          | [Build] [View] [Run]                    |
|                          +-----------------------------------------+
|                          | code-review              Global         |
|                          | 5 steps  reusable                       |
|                          | [Build] [View] [Use in session]         |
+--------------------------+-----------------------------------------+
```

Builder and viewer should show a compact scope strip:

```text
[Project workflow] .obora/workflows/release-readiness.yaml
```

or:

```text
[Global workflow] ~/.obora/workflows/code-review.yaml
Changes affect every project that uses this workflow.
```

External workflows should open as:

```text
[External workflow] /tmp/demo/workflow.yaml
Read-only
```

## Chat And Session Design Impact

Chat sessions should store workflow references by locator, not only by workflow name.

```typescript
interface SessionWorkflowBinding {
  readonly locatorId: string;
  readonly scope: WorkflowScope;
  readonly name: string;
  readonly path: string;
  readonly selectedAt: string;
}
```

This lets one chat session switch between workflows safely:

```text
Session: vendor-release
Project: /repo

Message 1 uses project:release-readiness
Message 2 uses global:code-review
Message 3 uses project:intake-to-decision
```

The chat UI can still show a simple workflow picker, but execution history should preserve the exact locator used for each message.

## Run Design Impact

`run <workflow>` currently loads a YAML file only when the argument ends with `.yaml` or `.yml`; otherwise it treats the argument as a runtime workflow name. The planned resolver should extend run behavior carefully:

1. Keep exact file path behavior backward-compatible.
2. Add name-based file resolution only when a matching project/global workflow exists.
3. Preserve runtime-registered workflow names when no file candidate exists.
4. Return an ambiguity error if project and global file candidates both match.
5. Record the resolved locator in run metadata and chat history.

## Implementation Lanes

1. Add a pure workflow locator/resolver with unit tests for project, global, external, missing, and ambiguous cases.
2. Update `workflow list` to show project/global groups while preserving the positional directory form for compatibility.
3. Add a local ops bridge server for read-only workflow listing and `workflow view`.
4. Add `view` route/mode in `@obora/ops` so graph inspection does not imply edit permission.
5. Add `workflow build` with write support, revision checks, scope labels, and global workflow warning.
6. Extend chat session metadata to store workflow locators per message.
7. Extend `run` to use the resolver for name-based file workflows after the resolver behavior is covered by tests.

## Verification Plan

Required targeted checks for implementation:

- resolver unit tests for exact path, project name, global name, shadowed name, external file, no target, and missing target
- CLI contract tests for `workflow list --scope`, `workflow view --json`, `workflow build --json`, and ambiguity failures
- ops model tests for `view` route parsing and hash generation
- ops component tests for Project/Global/External badges, read-only view mode, and global edit warning
- bridge API tests for path allow-listing, stale revision rejection, and read-only external files
- smoke test with a temp project workflow and a temp global workflow sharing the same name

For broad implementation handoff, run the repository gates listed in `AGENTS.md`.
