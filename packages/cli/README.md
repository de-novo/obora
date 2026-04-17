# @obora/cli

Command-line interface for Obora AI Control Runtime.

## Installation

```bash
npm install -g @obora/cli
```

## Fastest first-success path

```bash
obora init my-project --quickstart
cd my-project
obora doctor
obora validate judge.yaml
obora judge --dry-run
obora judge
```

What this gives you:

- `obora init --quickstart` creates a minimal judge-mode project
- `obora doctor` shows onboarding readiness and project-aware next actions
- `obora validate judge.yaml` checks the bundled one-file workflow before execution
- `obora judge --dry-run` previews bindings/output without starting execution
- `obora judge` writes `artifacts/result.json`

## Useful commands

### Doctor

```bash
obora doctor
obora doctor --json
obora --json doctor
```

- `doctor` reports onboarding readiness, not just a single next step
- judge-mode projects prefer `obora validate judge.yaml`, `obora judge --dry-run`, and `obora judge`
- non-judge projects fall back to generic guidance like `obora run <workflow.yaml> --dry-run`

### Models

```bash
obora models
obora models openai
obora models openai gpt-5.4
obora --json models anthropic sonnet
```

### Auth

```bash
obora auth add openai --apiKey "$OPENAI_API_KEY"
obora auth list
obora auth test openai
obora auth remove openai
```

### Run / Judge

```bash
obora run workflow.yaml
obora run workflow.yaml --input @artifacts/input.json
printf '{"task":"Build API"}' | obora run workflow.yaml --input @-
obora run workflow.yaml --dry-run

obora judge --dry-run
obora judge --input @artifacts/submission.json
cat artifacts/submission.json | obora judge --input @-
```

### Validate

```bash
obora validate workflow.yaml
obora validate workflow.yaml --json
obora validate --all
obora expand workflow.yaml --json
```

For one-file workflow authoring, start with `obora validate workflow.yaml`.
If validation fails on a one-file mode such as `judge`, follow the suggestion with `obora expand --json -- <file>` to inspect the expanded workflow. The CLI uses shell-safe quoting when filenames contain spaces or shell metacharacters.

## JSON mode

Most live command surfaces support both local and root JSON flags:

```bash
obora doctor --json
obora auth list --json
obora judge --json
obora --json runs list
```

## Full command reference

- CLI reference: https://github.com/de-novo/obora/blob/main/docs/cli.md
- getting started: https://github.com/de-novo/obora/blob/main/docs/getting-started.md
- tutorial index: https://github.com/de-novo/obora/blob/main/docs/tutorials/README.md

## Local development

```bash
pnpm install
pnpm --filter @obora/cli build
node packages/cli/bin/obora.js --help
```

## License

MIT
