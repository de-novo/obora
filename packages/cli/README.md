# obora CLI

CLI for obora-labs project scaffolding.

## Installation

```bash
# Global install
npm install -g obora

# Or use npx
npx obora create my-app
```

## Commands

### `obora create`

Create a new project from a template.

```bash
# Interactive mode
obora create my-app

# With template
obora create my-app -t nestjs-api

# With presets
obora create my-app -p clerk,drizzle,polar

# With package manager
obora create my-app --pm npm
obora create my-app --pm bun

# Skip prompts (use defaults: pnpm)
obora create my-app -y
```

**Options:**

| Flag | Alias | Description |
|------|-------|-------------|
| `--template` | `-t` | Template to use |
| `--presets` | `-p` | Comma-separated presets |
| `--dir` | `-d` | Output directory |
| `--pm` | - | Package manager (pnpm, npm, yarn, bun) |
| `--yes` | `-y` | Skip confirmation prompts |

### `obora add`

Add a preset to an existing project.

```bash
# Interactive mode
obora add

# Specific preset
obora add clerk

# In different directory
obora add drizzle -d ./my-project
```

**Options:**

| Flag | Alias | Description |
|------|-------|-------------|
| `--dir` | `-d` | Project directory |

### `obora list`

List available templates and presets.

```bash
# List all
obora list

# Templates only
obora list -t templates

# Presets only
obora list -t presets

# Presets by category
obora list -t presets -c auth
```

**Options:**

| Flag | Alias | Description |
|------|-------|-------------|
| `--type` | `-t` | Filter: templates, presets |
| `--category` | `-c` | Filter presets by category |

## Templates

| Template | Description |
|----------|-------------|
| `turbo-nextjs-full` | Full-stack Next.js 15 + Turborepo |
| `nestjs-api` | NestJS 10 API with Fastify |

## Presets

### Auth
- `clerk` - Clerk authentication
- `better-auth` - Self-hosted authentication

### Database
- `drizzle` - Drizzle ORM
- `prisma` - Prisma ORM

### Payment
- `polar` - Polar payments (MoR)
- `paddle` - Paddle payments (MoR)

### Analytics
- `umami` - Umami analytics
- `posthog` - PostHog analytics

### Email
- `resend` - Resend email

### AI
- `vercel-ai` - Vercel AI SDK

### Storage
- `uploadthing` - UploadThing file uploads

### Validation
- `effect-schema` - @effect/schema validation

## Development

```bash
# Install dependencies
pnpm install

# Development mode (with stub)
pnpm dev

# Build
pnpm build

# Test locally
node bin/obora.mjs create test-app
```

## License

MIT
