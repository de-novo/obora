# obora-kit

> CLI tool for scaffolding TypeScript SaaS projects with modular presets

## Quick Reference

```bash
# Create new project (interactive)
obora create my-project

# Create with specific options
obora create my-project --base monorepo --apps nestjs-api,nextjs-web --presets linting:biome,database:drizzle

# Preview without creating
obora create my-project --dry-run

# List available templates and presets
obora list

# Check project status
obora status

# Initialize obora in existing project
obora init

# LLM-friendly documentation
obora llm-help
```

## Architecture

obora-kit uses a composable architecture:

```
Base (monorepo | single)
  └── App Modules (nestjs-api, nextjs-web, shared-database, shared-ui)
        └── Presets (auth, database, payment, etc.)
```

## Bases

| Base | Description |
|------|-------------|
| `monorepo` | Turborepo monorepo with apps/ and packages/ |
| `single` | Single project without workspace |

## App Modules

| Module | Target Dir | Supported Slots |
|--------|------------|-----------------|
| `nestjs-api` | apps/api | linting, database, auth, payment, email, storage, ai, validation |
| `nextjs-web` | apps/web | linting, auth, analytics |
| `shared-database` | packages/database | database |
| `shared-ui` | packages/ui | - |

## Presets by Category

### linting (exclusive, root-level)
| Preset | Description |
|--------|-------------|
| `biome` | Fast Rust-based linter & formatter |
| `eslint-prettier` | Traditional ESLint + Prettier |

### database (exclusive, nestjs-api)
| Preset | Description |
|--------|-------------|
| `drizzle` | SQL-first ORM, lightweight |
| `prisma` | Full-featured ORM with studio |

### auth (exclusive)
| Preset | Target | Description |
|--------|--------|-------------|
| `clerk` | nestjs-api | Clerk Guard-based auth |
| `clerk-nextjs` | nextjs-web | Clerk Middleware auth |
| `better-auth` | nestjs-api | Self-hosted with Drizzle (requires database:drizzle) |
| `better-auth-nextjs` | nextjs-web | Better Auth client for Next.js |

> For monorepos, pair API + Web presets: clerk + clerk-nextjs, or better-auth + better-auth-nextjs

### payment (exclusive, nestjs-api)
| Preset | Description |
|--------|-------------|
| `polar` | Merchant of Record |
| `paddle` | Global MoR |

### email (exclusive, nestjs-api)
| Preset | Description |
|--------|-------------|
| `resend` | React Email integration |

### storage (exclusive, nestjs-api)
| Preset | Description |
|--------|-------------|
| `uploadthing` | Type-safe file uploads |
| `cloudflare-r2` | S3-compatible storage |

### analytics (non-exclusive, nextjs-web)
| Preset | Description |
|--------|-------------|
| `umami` | Privacy-focused analytics |
| `posthog` | Product analytics |

### ai (non-exclusive, nestjs-api)
| Preset | Description |
|--------|-------------|
| `vercel-ai` | Streaming AI SDK |

### validation (exclusive, nestjs-api)
| Preset | Description |
|--------|-------------|
| `zod` | TypeScript-first schema |
| `effect-schema` | Functional validation |

## Common Workflows

### Full-Stack SaaS (Monorepo)
```bash
obora create my-saas --base monorepo --apps nestjs-api,nextjs-web
# Select presets:
# - linting: biome
# - database: drizzle
# - auth: clerk (for API) + clerk-nextjs (for web)
# - payment: polar
# - email: resend
# - analytics: umami
```

### API Only
```bash
obora create my-api --base single --apps nestjs-api
# Presets: drizzle, clerk, polar, resend
```

### Frontend Only
```bash
obora create my-web --base single --apps nextjs-web
# Presets: clerk-nextjs, umami
```

## Project Structure (Monorepo)

```
my-project/
├── apps/
│   ├── api/                 # NestJS API
│   │   ├── src/
│   │   │   ├── modules/     # Feature modules (auth, payment, etc.)
│   │   │   ├── db/          # Database (drizzle/prisma)
│   │   │   └── main.ts
│   │   └── package.json
│   └── web/                 # Next.js Web
│       ├── app/             # App router
│       ├── src/lib/         # Utilities (auth, analytics)
│       └── package.json
├── packages/
│   ├── database/            # Shared database (if selected)
│   └── ui/                  # Shared UI components
├── .obora/
│   ├── config.json          # Project configuration
│   └── history.json         # Change history
├── .env.example             # Environment variables template
├── biome.json               # Linting config (at root)
├── turbo.json               # Turborepo config
└── package.json
```

## Slot System

Presets are applied to apps based on their **slots**:

1. Check if app module supports the preset's category (slot)
2. If preset has `targetApps`, filter to those apps only
3. Apply preset files to matching apps

Example: `clerk` preset has `targetApps: ["nestjs-api"]`, so it only applies to the API even though both apps have the `auth` slot.

## Environment Variables

Each preset adds required env vars to `.env.example`:

```bash
# Database (drizzle/prisma)
DATABASE_URL=postgresql://...

# Auth (clerk)
CLERK_SECRET_KEY=sk_...
CLERK_PUBLISHABLE_KEY=pk_...

# Payment (polar)
POLAR_ACCESS_TOKEN=...

# Analytics (umami)
NEXT_PUBLIC_UMAMI_WEBSITE_ID=...
```

## CLI Commands

### obora create <name>
Create a new project with interactive prompts or flags.

Flags:
- `--base, -b`: Base structure (monorepo, single)
- `--apps, -a`: App modules (comma-separated)
- `--presets, -p`: Preset selections (category:preset,...)
- `--pm`: Package manager (pnpm, npm, yarn, bun)
- `--dir, -d`: Output directory
- `--yes, -y`: Skip prompts, use defaults
- `--dry-run`: Preview without creating

### obora list
List available bases, app modules, and presets.

### obora status
Show current project configuration from .obora/config.json.

Flags:
- `--history`: Include change history
- `--json`: Output as JSON

### obora init
Initialize obora in an existing project. Detects presets from package.json.

Flags:
- `--dir, -d`: Project directory (default: current)
- `--force, -f`: Overwrite existing config
- `--yes, -y`: Skip confirmation

### obora add <preset>
Add a preset to an existing project.

### obora remove <preset>
Remove a preset from an existing project.

### obora llm-help
Output LLM-friendly documentation.

Flags:
- `--full`: Output full LLMS.md
- `--raw`: Output without formatting

## Preset Manifest Format

Each preset has a `manifest.json`:

```json
{
  "name": "drizzle",
  "category": "database",
  "description": "Drizzle ORM",
  "targetApps": ["nestjs-api"],
  "operations": {
    "add": ["src/db"],
    "merge": ["package.json"],
    "replace": [],
    "remove": [],
    "inject": [
      {
        "file": "src/app.module.ts",
        "marker": "@obora:imports",
        "content": "import { DatabaseModule } from './db/database.module.js';"
      }
    ]
  },
  "conflicts": ["prisma"],
  "requires": [],
  "env": [
    {
      "key": "DATABASE_URL",
      "description": "PostgreSQL connection string",
      "required": true,
      "secret": true
    }
  ]
}
```

## After Project Creation

```bash
cd my-project
pnpm install
cp .env.example .env
# Edit .env with your values

# If using database preset:
pnpm db:generate
pnpm db:migrate

# Start development
pnpm dev
```

## Tech Stack

- **Runtime**: Node.js 18+
- **Frontend**: Next.js 15, Tailwind CSS v4, shadcn/ui
- **Backend**: NestJS 11, Fastify
- **Database**: PostgreSQL with Drizzle/Prisma
- **Monorepo**: Turborepo, pnpm workspaces
