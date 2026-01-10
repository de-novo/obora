# Obora Kit - Composable Template Architecture

## Overview

Obora Kit uses a **Composable Template Architecture** where templates are assembled from a base + user-selected presets. This gives users full control over their tech stack while avoiding combinatorial explosion of template variants.

**Core Principle**: Let users choose their preferred tools instead of making opinionated decisions for them.

## Templates

### turbo-nextjs-full (Full-Stack Monorepo)

The primary template for building modern full-stack applications.

```
turbo-nextjs-full/
├── apps/
│   ├── web/              # Next.js 15 (Frontend)
│   └── api/              # NestJS 11 (Backend) - optional
├── packages/
│   ├── ui/               # Shared UI components (shadcn/ui)
│   ├── db/               # Shared database client
│   ├── config/           # Shared configs (tsconfig, etc.)
│   └── types/            # Shared TypeScript types
├── biome.json            # or .eslintrc + .prettierrc
└── turbo.json
```

**Slots:**

| Slot | Required | Options | Default |
|------|----------|---------|---------|
| linting | Yes | biome, eslint-prettier | biome |
| backend | No | nestjs, none | none |
| database | Yes | prisma, drizzle | prisma |
| auth | No | clerk, better-auth | - |
| payment | No | polar, paddle | - |

### nestjs-api (Standalone API)

For standalone backend services without frontend.

**Slots:**

| Slot | Required | Options | Default |
|------|----------|---------|---------|
| database | Yes | prisma, drizzle | prisma |
| auth | No | clerk, better-auth | - |
| payment | No | polar, paddle | - |

## Preset Categories

### Core Categories

```typescript
const CATEGORIES = {
  // Code Quality (NEW)
  linting: {
    name: 'linting',
    description: 'Linting & Formatting',
    exclusive: true,
    presets: ['biome', 'eslint-prettier']
  },

  // Architecture (NEW)
  backend: {
    name: 'backend',
    description: 'Backend API',
    exclusive: true,
    presets: ['nestjs', 'none']
  },

  // Data Layer
  database: {
    name: 'database',
    description: 'Database & ORM',
    exclusive: true,
    presets: ['prisma', 'drizzle']
  },

  // Authentication
  auth: {
    name: 'auth',
    description: 'Authentication',
    exclusive: true,
    presets: ['clerk', 'better-auth']
  },

  // Monetization
  payment: {
    name: 'payment',
    description: 'Payment Processing',
    exclusive: true,
    presets: ['polar', 'paddle']
  },

  // Observability
  analytics: {
    name: 'analytics',
    description: 'Analytics & Tracking',
    exclusive: false,  // Can have multiple
    presets: ['posthog', 'umami']
  }
};
```

## Presets

### Linting & Formatting

#### biome (Recommended)

Fast, all-in-one linter and formatter.

```json
{
  "name": "biome",
  "category": "linting",
  "description": "Biome - Fast linter & formatter",
  "operations": {
    "add": ["biome.json"],
    "merge": ["package.json"],
    "inject": [
      {
        "file": "package.json",
        "marker": "@obora:scripts",
        "content": {
          "lint": "biome check .",
          "lint:fix": "biome check --write .",
          "format": "biome format --write ."
        }
      }
    ]
  }
}
```

**Dependencies:**
- `@biomejs/biome: ^1.9.0`

#### eslint-prettier

Traditional ESLint + Prettier setup with full plugin ecosystem.

```json
{
  "name": "eslint-prettier",
  "category": "linting",
  "description": "ESLint + Prettier",
  "operations": {
    "add": [
      "eslint.config.js",
      ".prettierrc",
      ".prettierignore"
    ],
    "merge": ["package.json"]
  }
}
```

**Dependencies:**
- `eslint: ^9.0.0`
- `prettier: ^3.4.0`
- `@typescript-eslint/parser: ^8.0.0`
- `@typescript-eslint/eslint-plugin: ^8.0.0`
- `eslint-config-prettier: ^9.0.0`
- `eslint-plugin-prettier: ^5.0.0`

### Backend

#### nestjs

Adds NestJS API to the monorepo at `apps/api/`.

```json
{
  "name": "nestjs",
  "category": "backend",
  "description": "NestJS 11 API server",
  "operations": {
    "add": ["apps/api"],
    "merge": ["package.json", "turbo.json"],
    "inject": [
      {
        "file": "turbo.json",
        "marker": "@obora:pipeline",
        "content": "api build/dev tasks"
      }
    ]
  },
  "requires": ["database"]
}
```

#### none

Frontend-only monorepo (no backend).

### Database

#### prisma (Recommended)

Full-featured ORM with Prisma Studio.

```json
{
  "name": "prisma",
  "category": "database",
  "description": "Prisma ORM ^7.0.0",
  "operations": {
    "add": ["packages/db", "prisma/schema.prisma"],
    "merge": ["package.json"]
  }
}
```

**Dependencies:**
- `@prisma/client: ^7.0.0`
- `prisma: ^7.0.0`

**Note:** Prisma 7 requires `provider = "prisma-client"` with explicit `output` path.

#### drizzle

Type-safe SQL with excellent DX, optimized for serverless.

```json
{
  "name": "drizzle",
  "category": "database",
  "description": "Drizzle ORM ^0.45.0",
  "operations": {
    "add": ["packages/db", "drizzle.config.ts"],
    "merge": ["package.json"]
  }
}
```

**Dependencies:**
- `drizzle-orm: ^0.45.0`
- `drizzle-kit: ^0.31.0`
- `postgres: ^3.4.5`

### Authentication

#### clerk (Recommended)

Managed authentication with excellent DX.

```json
{
  "name": "clerk",
  "category": "auth",
  "description": "Clerk Authentication",
  "operations": {
    "add": ["apps/web/middleware.ts", "packages/auth"],
    "merge": ["package.json"]
  },
  "env": [
    { "key": "CLERK_SECRET_KEY", "required": true, "secret": true },
    { "key": "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "required": true }
  ]
}
```

**Dependencies:**
- `@clerk/nextjs: ^6.0.0` (frontend)
- `@clerk/backend: ^1.25.0` (backend)

#### better-auth

Self-hosted authentication library.

```json
{
  "name": "better-auth",
  "category": "auth",
  "description": "Better Auth ^1.4.0",
  "requires": ["database"],
  "env": [
    { "key": "BETTER_AUTH_SECRET", "required": true, "secret": true }
  ]
}
```

**Dependencies:**
- `better-auth: ^1.4.0`

### Payment

#### polar

Merchant of Record for open source / SaaS.

#### paddle

Merchant of Record for global SaaS.

## Directory Structure

```
obora-kit/
├── docs/
│   ├── ORGANIZATION.md
│   └── ARCHITECTURE.md
├── packages/
│   └── cli/
│       └── src/
│           ├── commands/
│           │   └── create.ts
│           └── utils/
│               ├── assembler.ts
│               └── constants.ts
├── templates/
│   ├── turbo-nextjs-full/
│   │   ├── manifest.json
│   │   └── base/
│   │       ├── apps/
│   │       │   └── web/          # Next.js base
│   │       ├── packages/
│   │       │   ├── ui/           # shadcn/ui components
│   │       │   ├── config/       # Shared TypeScript configs
│   │       │   └── types/        # Shared types
│   │       ├── turbo.json
│   │       └── package.json
│   └── nestjs-api/
│       ├── manifest.json
│       └── base/
└── presets/
    ├── biome/
    │   ├── manifest.json
    │   ├── package.json
    │   └── files/
    │       └── biome.json
    ├── eslint-prettier/
    │   ├── manifest.json
    │   ├── package.json
    │   └── files/
    │       ├── eslint.config.js
    │       ├── .prettierrc
    │       └── .prettierignore
    ├── nestjs/
    │   ├── manifest.json
    │   └── files/
    │       └── apps/api/         # NestJS app
    ├── drizzle/
    ├── prisma/
    ├── clerk/
    ├── better-auth/
    ├── polar/
    └── paddle/
```

## CLI Usage

### Interactive Mode

```bash
$ obora create my-app -t turbo-nextjs-full

? Select linting (required):
  ❯ biome (Recommended)
    eslint-prettier

? Include backend API? (optional):
    nestjs
  ❯ Skip (frontend only)

? Select database (required):
  ❯ prisma (Recommended)
    drizzle

? Select authentication (optional):
    clerk
    better-auth
  ❯ Skip

? Select payment (optional):
    polar
    paddle
  ❯ Skip

Creating project with: biome + prisma
✓ Project created successfully!
```

### Flags Mode

```bash
# Full-stack with all options
obora create my-app -t turbo-nextjs-full \
  --linting biome \
  --backend nestjs \
  --database prisma \
  --auth clerk \
  --payment polar

# Frontend only (minimal)
obora create my-app -t turbo-nextjs-full \
  --linting eslint-prettier \
  --database drizzle

# Use all defaults
obora create my-app -t turbo-nextjs-full -y
# → biome + no backend + prisma + no auth + no payment
```

## Template Manifest

### turbo-nextjs-full/manifest.json

```json
{
  "name": "turbo-nextjs-full",
  "type": "composable",
  "description": "Full-stack monorepo with Next.js 15 + optional NestJS",
  "features": [
    "Next.js 15",
    "Turborepo",
    "Tailwind CSS v4",
    "shadcn/ui (Base UI)"
  ],
  "slots": {
    "linting": {
      "required": true,
      "description": "Linting & formatting tool",
      "default": "biome",
      "presets": ["biome", "eslint-prettier"]
    },
    "backend": {
      "required": false,
      "description": "Backend API (optional)",
      "presets": ["nestjs"]
    },
    "database": {
      "required": true,
      "description": "Database & ORM",
      "default": "prisma",
      "presets": ["prisma", "drizzle"]
    },
    "auth": {
      "required": false,
      "description": "Authentication provider (optional)",
      "presets": ["clerk", "better-auth"]
    },
    "payment": {
      "required": false,
      "description": "Payment provider (optional)",
      "presets": ["polar", "paddle"]
    }
  },
  "base": "./base",
  "postCreate": [
    "Install dependencies: {{pm}} install",
    "Copy environment: cp .env.example .env",
    "Start development: {{pm}} dev"
  ]
}
```

## Assembly Process

1. **Copy Base Template**
   ```
   templates/turbo-nextjs-full/base/ → target/
   ```

2. **Apply Linting Preset**
   - Add biome.json OR eslint.config.js + .prettierrc
   - Merge package.json with lint scripts

3. **Apply Backend Preset** (if selected)
   - Add apps/api/ with NestJS structure
   - Update turbo.json with API tasks

4. **Apply Database Preset**
   - Add packages/db/ with ORM setup
   - If backend: inject DatabaseModule into NestJS

5. **Apply Auth Preset**
   - Add packages/auth/ with auth utilities
   - Add apps/web/middleware.ts
   - If backend: inject AuthModule into NestJS

6. **Apply Payment Preset** (if selected)
   - Add payment integration

7. **Finalize**
   - Merge all package.json files
   - Generate .env.example from all presets
   - Process @obora:* markers
   - Format code with selected linter

## Version Requirements

| Package | Version | Notes |
|---------|---------|-------|
| Node.js | ≥20.0.0 | Required for modern features |
| pnpm | ≥9.0.0 | Recommended package manager |
| NestJS | ^11.1.0 | Latest with improved logging |
| Next.js | ^15.0.0 | App Router, Server Actions |
| Drizzle | ^0.45.0 | Type-safe SQL |
| Prisma | ^7.0.0 | prisma-client provider |
| Effect | ^3.19.0 | Schema integrated |
| Biome | ^1.9.0 | Fast linter/formatter |
| TypeScript | ^5.8.0 | Latest features |

## Design Principles

1. **User Choice**: Let users pick their preferred tools
2. **Sensible Defaults**: Provide recommended options for quick start
3. **No Lock-in**: All presets can be replaced or removed later
4. **Type Safety**: Full TypeScript support throughout
5. **Modern Stack**: Use latest stable versions of all tools
