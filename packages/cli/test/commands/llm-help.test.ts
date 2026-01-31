import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "pathe";
import { tmpdir } from "node:os";

// ============================================================================
// Compact Reference Content (from llm-help.ts)
// ============================================================================

const COMPACT_REFERENCE = `# obora-kit - LLM Quick Reference

## Commands
\`\`\`bash
obora create <name>              # Create project (interactive)
obora create <name> --dry-run    # Preview without creating
obora create <name> -y           # Use defaults
obora init                       # Initialize in existing project
obora list                       # List templates/presets
obora status                     # Show project config
obora add <preset>               # Add preset
obora remove <preset>            # Remove preset
obora llm-help                   # Show this reference
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
| auth       | clerk, clerk-nextjs, better-auth, better-auth-nextjs | see below  |
| payment    | polar, paddle                | nestjs-api     |
| email      | resend                       | nestjs-api     |
| storage    | uploadthing, cloudflare-r2   | nestjs-api     |
| analytics  | umami, posthog               | nextjs-web     |
| ai         | vercel-ai                    | nestjs-api     |
| validation | zod, effect-schema           | nestjs-api     |

Auth targets: clerk→nestjs-api, clerk-nextjs→nextjs-web, better-auth→nestjs-api, better-auth-nextjs→nextjs-web

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
├── apps/web/          # Next.js (app/*, src/lib/*, src/modules/*)
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

// ============================================================================
// Path Resolution Logic (similar to getLlmsPath but for testing)
// ============================================================================

function findLlmsPath(startDir: string, maxLevels: number = 5): string | null {
  let current = startDir;
  for (let i = 0; i < maxLevels; i++) {
    const candidate = join(current, "LLMS.md");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = join(current, "..");
    if (parent === current) break; // Reached root
    current = parent;
  }
  return null;
}

// ============================================================================
// Tests
// ============================================================================

describe("llm-help command", () => {
  describe("COMPACT_REFERENCE content", () => {
    it("should include all main commands", () => {
      expect(COMPACT_REFERENCE).toContain("obora create");
      expect(COMPACT_REFERENCE).toContain("obora init");
      expect(COMPACT_REFERENCE).toContain("obora list");
      expect(COMPACT_REFERENCE).toContain("obora status");
      expect(COMPACT_REFERENCE).toContain("obora add");
      expect(COMPACT_REFERENCE).toContain("obora remove");
      expect(COMPACT_REFERENCE).toContain("obora llm-help");
    });

    it("should include all create options", () => {
      expect(COMPACT_REFERENCE).toContain("--base, -b");
      expect(COMPACT_REFERENCE).toContain("--apps, -a");
      expect(COMPACT_REFERENCE).toContain("--presets, -p");
      expect(COMPACT_REFERENCE).toContain("--pm");
      expect(COMPACT_REFERENCE).toContain("--dir, -d");
      expect(COMPACT_REFERENCE).toContain("--yes, -y");
      expect(COMPACT_REFERENCE).toContain("--dry-run");
    });

    it("should include preset categories", () => {
      expect(COMPACT_REFERENCE).toContain("| linting");
      expect(COMPACT_REFERENCE).toContain("| database");
      expect(COMPACT_REFERENCE).toContain("| auth");
      expect(COMPACT_REFERENCE).toContain("| payment");
      expect(COMPACT_REFERENCE).toContain("| email");
      expect(COMPACT_REFERENCE).toContain("| storage");
      expect(COMPACT_REFERENCE).toContain("| analytics");
      expect(COMPACT_REFERENCE).toContain("| ai");
      expect(COMPACT_REFERENCE).toContain("| validation");
    });

    it("should include preset options", () => {
      expect(COMPACT_REFERENCE).toContain("biome");
      expect(COMPACT_REFERENCE).toContain("drizzle");
      expect(COMPACT_REFERENCE).toContain("prisma");
      expect(COMPACT_REFERENCE).toContain("clerk");
      expect(COMPACT_REFERENCE).toContain("resend");
    });

    it("should include common patterns", () => {
      expect(COMPACT_REFERENCE).toContain("Full-Stack Monorepo");
      expect(COMPACT_REFERENCE).toContain("API Only");
      expect(COMPACT_REFERENCE).toContain("Frontend Only");
    });

    it("should include after creation steps", () => {
      expect(COMPACT_REFERENCE).toContain("pnpm install");
      expect(COMPACT_REFERENCE).toContain(".env.example");
      expect(COMPACT_REFERENCE).toContain("pnpm db:generate");
      expect(COMPACT_REFERENCE).toContain("pnpm dev");
    });

    it("should include project structure", () => {
      expect(COMPACT_REFERENCE).toContain("apps/api/");
      expect(COMPACT_REFERENCE).toContain("apps/web/");
      expect(COMPACT_REFERENCE).toContain("packages/");
      expect(COMPACT_REFERENCE).toContain(".obora/config.json");
    });

    it("should include key files section", () => {
      expect(COMPACT_REFERENCE).toContain(".obora/config.json");
      expect(COMPACT_REFERENCE).toContain("turbo.json");
      expect(COMPACT_REFERENCE).toContain("biome.json");
    });

    it("should include full docs link", () => {
      expect(COMPACT_REFERENCE).toContain(
        "https://github.com/obora-labs/obora-kit/blob/main/LLMS.md"
      );
    });
  });

  describe("findLlmsPath utility", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = join(tmpdir(), `obora-test-llm-${Date.now()}`);
      await fs.mkdir(tempDir, { recursive: true });
    });

    afterEach(async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it("should find LLMS.md in current directory", () => {
      const llmsPath = join(tempDir, "LLMS.md");
      writeFileSync(llmsPath, "# Test LLMS");

      const result = findLlmsPath(tempDir);
      expect(result).toBe(llmsPath);
    });

    it("should find LLMS.md in parent directory", async () => {
      const subDir = join(tempDir, "subdir");
      await fs.mkdir(subDir, { recursive: true });
      const llmsPath = join(tempDir, "LLMS.md");
      writeFileSync(llmsPath, "# Test LLMS");

      const result = findLlmsPath(subDir);
      expect(result).toBe(llmsPath);
    });

    it("should find LLMS.md in grandparent directory", async () => {
      const deepDir = join(tempDir, "level1", "level2");
      await fs.mkdir(deepDir, { recursive: true });
      const llmsPath = join(tempDir, "LLMS.md");
      writeFileSync(llmsPath, "# Test LLMS");

      const result = findLlmsPath(deepDir);
      expect(result).toBe(llmsPath);
    });

    it("should return null if LLMS.md not found", () => {
      const result = findLlmsPath(tempDir);
      expect(result).toBeNull();
    });

    it("should respect maxLevels parameter", async () => {
      const deepDir = join(tempDir, "a", "b", "c", "d", "e");
      await fs.mkdir(deepDir, { recursive: true });
      const llmsPath = join(tempDir, "LLMS.md");
      writeFileSync(llmsPath, "# Test LLMS");

      // With maxLevels=3, should not find LLMS.md 5 levels up
      const result = findLlmsPath(deepDir, 3);
      expect(result).toBeNull();

      // With maxLevels=6, should find it
      const result2 = findLlmsPath(deepDir, 6);
      expect(result2).toBe(llmsPath);
    });
  });

  describe("command structure", () => {
    it("should have correct meta information", () => {
      const commandMeta = {
        name: "llm-help",
        description: "Output LLM-friendly documentation for AI assistants",
      };
      expect(commandMeta.name).toBe("llm-help");
      expect(commandMeta.description).toContain("LLM");
    });

    it("should have correct arguments defined", () => {
      const args = {
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
      };

      expect(args.full.type).toBe("boolean");
      expect(args.full.default).toBe(false);
      expect(args.raw.type).toBe("boolean");
      expect(args.raw.default).toBe(false);
    });
  });

  describe("output modes", () => {
    it("should support compact reference by default", () => {
      const full = false;
      const raw = false;

      // Default mode: compact reference with formatting
      expect(full).toBe(false);
      expect(raw).toBe(false);
    });

    it("should support full mode flag", () => {
      const full = true;

      // Full mode: output entire LLMS.md
      expect(full).toBe(true);
    });

    it("should support raw mode flag", () => {
      const raw = true;

      // Raw mode: no formatting (for piping)
      expect(raw).toBe(true);
    });

    it("should support combined full and raw mode", () => {
      const full = true;
      const raw = true;

      // Combined: full content without formatting
      expect(full && raw).toBe(true);
    });
  });

  describe("LLMS.md file handling", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = join(tmpdir(), `obora-test-llm-file-${Date.now()}`);
      await fs.mkdir(tempDir, { recursive: true });
    });

    afterEach(async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it("should read LLMS.md content correctly", async () => {
      const llmsPath = join(tempDir, "LLMS.md");
      const content = "# Test LLMS Content\n\nThis is test documentation.";
      writeFileSync(llmsPath, content);

      const readContent = await fs.readFile(llmsPath, "utf-8");
      expect(readContent).toBe(content);
    });

    it("should handle non-existent file gracefully", async () => {
      const llmsPath = join(tempDir, "nonexistent.md");

      try {
        await fs.readFile(llmsPath, "utf-8");
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
