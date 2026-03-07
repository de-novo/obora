# @obora/cli

Command-line interface for Obora AI Control Runtime.

## Installation

```bash
npm install -g @obora/cli
```

## Commands

### `obora init [project-name]`

Initialize a new Obora project.

```bash
obora init my-project
obora init .                    # Current directory
obora init my-project --template standard
```

Options:
- `--template <name>` - Project template (default, standard)
- `--yes` - Skip prompts, use defaults

### `obora run <workflow>`

Execute a workflow.

```bash
obora run workflow.yaml
obora run workflow.yaml --input '{"task": "Build API"}'
obora run workflow.yaml --dry-run
```

Options:
- `--input <json>` - Input variables
- `--var <key=value>` - Set variable (repeatable)
- `--dry-run` - Show execution plan without running
- `--json` - Output results as JSON
- `--quiet` - Suppress non-essential output
- `--verbose` - Show detailed execution info
- `--output-dir <dir>` - Output directory for artifacts

### `obora validate <workflow>`

Validate a workflow definition.

```bash
obora validate workflow.yaml
```

### `obora config`

Manage configuration.

```bash
obora config list
obora config get providers.zai.model
obora config set providers.zai.model glm-4.7
```

### `obora auth`

Manage authentication for LLM providers.

```bash
obora auth login zai
obora auth logout zai
obora auth status
```

## Configuration

### Project Config (`.obora/config.yaml`)

```yaml
project:
  name: my-project

providers:
  zai:
    api_key_env: ZAI_API_KEY
    model: glm-4.7

defaults:
  provider: zai
  model: glm-4.7
```

### Global Config (`~/.obora/config.yaml`)

```yaml
providers:
  zai:
    api_key_env: ZAI_API_KEY
  openai:
    api_key_env: OPENAI_API_KEY
  anthropic:
    api_key_env: ANTHROPIC_API_KEY
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ZAI_API_KEY` | ZAI provider API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OBORA_LLM_PROVIDER` | Default provider |
| `OBORA_LLM_MODEL` | Default model |

## Project Structure

```
my-project/
├── .obora/
│   ├── config.yaml       # Project configuration
│   ├── workflows/        # Workflow definitions
│   ├── agents.yaml       # Agent definitions
│   └── policies/         # Policy definitions
├── features/             # Feature workspaces
├── archive/              # Completed features
└── output/               # Generated outputs
```

## Examples

### Simple Pipeline

```bash
# Create project
obora init pipeline-demo
cd pipeline-demo

# Run example workflow
obora run .obora/workflows/simple.yaml
```

### With Custom Input

```bash
obora run workflow.yaml \
  --input '{"task": "Create REST API for users"}' \
  --output-dir ./output
```

### Dry Run

```bash
obora run workflow.yaml --dry-run
# Shows: Execution plan with step order and dependencies
```

## License

MIT
