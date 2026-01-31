# Obora Kit

Preset-based project scaffolding CLI tool.

## Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Package Manager**: pnpm (monorepo)
- **Build**: tsup
- **Test**: Vitest

## Project Structure

```
packages/
├── cli/              # Main CLI package
├── project-config/   # Project configuration types
└── dashboard/        # Dashboard UI (Next.js)
```

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Test
pnpm test

# Run CLI locally
pnpm --filter @anthropic/cli dev
```
