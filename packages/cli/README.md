# obora CLI

CLI for obora-labs project scaffolding and AI-powered workflow orchestration.

## Installation

```bash
# Global install (npm)
npm install -g obora

# Or use npx
npx obora create my-app

# Development mode
git clone https://github.com/obora-labs/obora-kit.git
cd obora-kit/packages/cli
pnpm install && pnpm dev:stub
npm link
```

## Commands

### Project Scaffolding

#### `obora create`

Create a new project from a template.

```bash
# Interactive mode
obora create my-app

# With template
obora create my-app -t nestjs-api

# With presets
obora create my-app -p clerk,drizzle,polar

# With package manager
obora create my-app --pm pnpm
```

| Flag | Alias | Description |
|------|-------|-------------|
| `--template` | `-t` | Template to use |
| `--presets` | `-p` | Comma-separated presets |
| `--dir` | `-d` | Output directory |
| `--pm` | - | Package manager (pnpm, npm, yarn, bun) |
| `--yes` | `-y` | Skip confirmation prompts |

#### `obora add`

Add a preset to an existing project.

```bash
obora add clerk
obora add drizzle -d ./my-project
```

#### `obora remove`

Remove a preset from the project.

```bash
obora remove clerk
```

#### `obora list`

List available templates and presets.

```bash
obora list                    # List all
obora list -t templates       # Templates only
obora list -t presets -c auth # Presets by category
```

### AI Asset Management

#### `obora init`

Initialize obora AI assets (Claude Code integration) in an existing project.

```bash
# Initialize in current directory
obora init

# Initialize in specific directory
obora init -d ./my-project

# Force overwrite existing config
obora init -f
```

This command:
- Creates `.claude/` directory structure
- Copies agents, skills, rules, scripts, and hooks
- Sets up Claude Code workflow integration
- Creates `.obora/` config if not exists

| Flag | Alias | Description |
|------|-------|-------------|
| `--dir` | `-d` | Project directory |
| `--force` | `-f` | Overwrite existing .obora config |
| `--yes` | `-y` | Skip confirmation prompts |

#### `obora sync`

Sync obora assets (skills, agents, rules, commands, scripts, hooks) to a project.

```bash
# Sync all assets
obora sync

# Sync specific asset type
obora sync -t skills
obora sync -t settings

# Sync to different directory
obora sync -d ./my-project

# Force overwrite
obora sync -f

# List available assets
obora sync -l
```

| Flag | Alias | Description |
|------|-------|-------------|
| `--dir` | `-d` | Project directory |
| `--force` | `-f` | Overwrite existing files |
| `--type` | `-t` | Sync type: skills, agents, rules, commands, scripts, settings, all |
| `--list` | `-l` | List available assets |

### Project Management

#### `obora status`

Show current project configuration status.

```bash
obora status
```

#### `obora doctor`

Diagnose project health and configuration issues.

```bash
obora doctor
```

#### `obora upgrade`

Upgrade presets to latest versions.

```bash
obora upgrade
```

#### `obora eject`

Eject preset configuration files for customization.

```bash
obora eject
```

### AI Workflow (Experimental)

#### `obora run`

Execute a single task with workflow enforcement.

```bash
obora run "Implement user authentication"
obora run --agent implementer "Add login form"
```

#### `obora chat`

Interactive workflow orchestrator (enforces agent workflows).

```bash
obora chat
```

### Utilities

#### `obora llm-help`

Output LLM-friendly documentation for AI assistants.

```bash
obora llm-help
```

#### `obora config`

Manage global obora preferences.

```bash
obora config
```

## Templates

| Template | Description |
|----------|-------------|
| `monorepo` | Full-stack monorepo (NestJS + Next.js) |
| `single` | Single app project |
| `nestjs-api` | NestJS 11 API with Fastify |
| `nextjs-web` | Next.js 15 Web App |

## Presets

| Category | Presets |
|----------|---------|
| Auth | `clerk`, `clerk-nextjs`, `better-auth` |
| Database | `drizzle`, `prisma` |
| Payment | `polar`, `paddle` |
| Analytics | `umami`, `posthog` |
| Email | `resend` |
| AI | `vercel-ai` |
| Storage | `uploadthing`, `cloudflare-r2` |
| Validation | `zod`, `effect-schema` |
| Linting | `biome`, `eslint-prettier` |

## Development

```bash
# Install dependencies
pnpm install

# Development mode (with stub - changes apply instantly)
pnpm dev:stub

# Build
pnpm build

# Link globally
npm link

# Test locally
obora --version
```

## License

MIT
