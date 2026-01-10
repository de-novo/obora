import { defineCommand } from "citty";
import { consola } from "consola";
import { promises as fs } from "node:fs";
import { join, dirname } from "pathe";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find LLMS.md relative to package location
function getLlmsPath(): string {
  // Try production path (from dist/)
  const prodPath = join(__dirname, "../../../../LLMS.md");
  if (existsSync(prodPath)) return prodPath;

  // Try development path (from src/commands/)
  const devPath = join(__dirname, "../../../../../LLMS.md");
  if (existsSync(devPath)) return devPath;

  // Try relative to cli package root
  const cliRootPath = join(__dirname, "../../../LLMS.md");
  if (existsSync(cliRootPath)) return cliRootPath;

  return prodPath;
}

const COMPACT_REFERENCE = `# obora-kit - LLM Quick Reference

## Commands
\`\`\`bash
obora create <name>              # Create project (interactive)
obora create <name> --dry-run    # Preview without creating
obora create <name> -y           # Use defaults
obora list                       # List templates/presets
obora status                     # Show project config
obora add <preset>               # Add preset
obora remove <preset>            # Remove preset
\`\`\`

## Create Options
\`\`\`bash
--base, -b      monorepo | single
--apps, -a      nestjs-api,nextjs-web,shared-database,shared-ui
--presets, -p   category:preset (e.g., database:drizzle,auth:clerk)
--pm            pnpm | npm | yarn | bun
--dir, -d       Output directory
--yes, -y       Skip prompts
--dry-run       Preview only
\`\`\`

## Presets
| Category   | Options                      | Target Apps    |
|------------|------------------------------|----------------|
| linting    | biome, eslint-prettier       | root           |
| database   | drizzle, prisma              | nestjs-api     |
| auth       | clerk, clerk-nextjs, better-auth | see below  |
| payment    | polar, paddle                | nestjs-api     |
| email      | resend                       | nestjs-api     |
| storage    | uploadthing, cloudflare-r2   | nestjs-api     |
| analytics  | umami, posthog               | nextjs-web     |
| ai         | vercel-ai                    | nestjs-api     |
| validation | zod, effect-schema           | nestjs-api     |

Auth targets: clerk→nestjs-api, clerk-nextjs→nextjs-web, better-auth→nestjs-api

## Common Patterns

### Full-Stack Monorepo
\`\`\`bash
obora create my-saas -b monorepo -a nestjs-api,nextjs-web \\
  -p linting:biome,database:drizzle,auth:clerk,payment:polar
\`\`\`

### API Only
\`\`\`bash
obora create my-api -b single -a nestjs-api \\
  -p database:drizzle,auth:clerk,email:resend
\`\`\`

### Frontend Only
\`\`\`bash
obora create my-web -b single -a nextjs-web \\
  -p auth:clerk-nextjs,analytics:umami
\`\`\`

## After Creation
\`\`\`bash
cd <project>
pnpm install
cp .env.example .env
pnpm db:generate  # if database preset
pnpm db:migrate   # if database preset
pnpm dev
\`\`\`

## Project Structure (Monorepo)
\`\`\`
my-project/
├── apps/api/          # NestJS (src/modules/*, src/db/*)
├── apps/web/          # Next.js (app/*, src/lib/*)
├── packages/          # Shared packages
├── .obora/config.json # Project config
└── .env.example       # Required env vars
\`\`\`

## Key Files
- \`.obora/config.json\`: Project configuration (base, apps, slots)
- \`.env.example\`: Environment variables template
- \`turbo.json\`: Build pipeline (db:generate → build)
- \`biome.json\` or \`eslint.config.js\`: Linting config

## Full docs: https://github.com/obora-labs/obora-kit/blob/main/LLMS.md
`;

export const llmHelpCommand = defineCommand({
  meta: {
    name: "llm-help",
    description: "Output LLM-friendly documentation for AI assistants",
  },
  args: {
    full: {
      type: "boolean",
      description: "Output full llms.txt content",
      default: false,
    },
    raw: {
      type: "boolean",
      description: "Output without formatting (for piping)",
      default: false,
    },
  },
  async run({ args }) {
    if (args.full) {
      // Output full llms.txt
      try {
        const llmsPath = getLlmsPath();
        const content = await fs.readFile(llmsPath, "utf-8");

        if (args.raw) {
          console.log(content);
        } else {
          consola.log("\n" + content);
        }
      } catch (error) {
        consola.error("Could not read LLMS.md");
        consola.info("Falling back to compact reference...\n");
        console.log(COMPACT_REFERENCE);
      }
    } else {
      // Output compact reference
      if (args.raw) {
        console.log(COMPACT_REFERENCE);
      } else {
        consola.box("obora-kit LLM Reference");
        console.log(COMPACT_REFERENCE);
        consola.info("\nTip: Use --full for complete documentation");
      }
    }
  },
});
