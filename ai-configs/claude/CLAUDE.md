# Project Context

## Overview
- **Organization**: obora-labs
- **Project Type**: {{PROJECT_TYPE}}
- **Tech Stack**: Next.js 15, TypeScript, Tailwind CSS v4, shadcn/ui (Base UI)

## Repository Structure

This is a Turborepo monorepo:

```
apps/
├── web/              # Main Next.js app
packages/
├── ui/               # Shared UI components
├── database/         # Drizzle schema & client
└── shared/           # Shared utilities & types
```

## Tech Stack

| Area | Technology |
|------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| UI | shadcn/ui (Base UI) |
| ORM | Drizzle |
| Auth | Clerk / Better Auth |
| Payment | Polar / Paddle |
| Analytics | Umami / PostHog |

## Conventions

- TypeScript strict mode
- ESLint + Prettier
- Conventional Commits
- pnpm workspace

## Common Commands

```bash
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm lint         # Run linting
pnpm db:push      # Push DB schema
pnpm db:studio    # Open Drizzle Studio
```

## File Structure Conventions

```
app/
├── (auth)/           # Auth routes
├── (dashboard)/      # Protected routes
├── (marketing)/      # Public pages
└── api/              # API routes

components/
├── ui/               # shadcn/ui components
├── forms/            # Form components
└── layouts/          # Layout components

lib/
├── db.ts             # Database client
├── auth.ts           # Auth utilities
└── utils.ts          # General utilities
```

## Important Notes

- Environment variables: `.env.local` (not committed)
- Use `@/` alias for imports
- Server Components by default, `"use client"` when needed
