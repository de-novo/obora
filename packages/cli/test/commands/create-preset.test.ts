import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "pathe";
import { tmpdir } from "node:os";

// Define CATEGORY_CONFIGS for testing
const CATEGORY_CONFIGS: Record<
  string,
  { name: string; description: string; exclusive: boolean }
> = {
  linting: { name: "linting", description: "Linting & Formatting", exclusive: true },
  database: { name: "database", description: "Database & ORM", exclusive: true },
  auth: { name: "auth", description: "Authentication", exclusive: true },
  api: { name: "api", description: "API Framework", exclusive: false },
  payment: { name: "payment", description: "Payment Processing", exclusive: true },
  analytics: { name: "analytics", description: "Analytics & Tracking", exclusive: false },
  "data-fetching": { name: "data-fetching", description: "Data Fetching", exclusive: false },
  state: { name: "state", description: "State Management", exclusive: false },
  i18n: { name: "i18n", description: "Internationalization", exclusive: false },
  theming: { name: "theming", description: "Themes & Color Modes", exclusive: false },
  ui: { name: "ui", description: "UI Components", exclusive: false },
  email: { name: "email", description: "Email Service", exclusive: true },
  ai: { name: "ai", description: "AI Integration", exclusive: false },
  storage: { name: "storage", description: "File Storage", exclusive: true },
  validation: { name: "validation", description: "Schema Validation", exclusive: true },
  testing: { name: "testing", description: "Testing Framework", exclusive: true },
  form: { name: "form", description: "Form Handling", exclusive: false },
};

const CATEGORIES = Object.keys(CATEGORY_CONFIGS);

type Category = keyof typeof CATEGORY_CONFIGS;

/**
 * Generate manifest.json content (copied from create-preset.ts for testing)
 */
function generateManifest(options: {
  name: string;
  category: Category;
  description: string;
  version: string;
}): object {
  return {
    $schema: "../../preset.schema.json",
    name: options.name,
    category: options.category,
    description: options.description,
    version: options.version,
    common: {
      dependencies: {},
      devDependencies: {},
      scripts: {},
      files: [],
      transform: [],
    },
    targets: {
      standalone: {
        description: "For standalone Next.js projects",
        files: ["standalone"],
        transform: [],
        env: [],
      },
      monorepo: {
        description: "For monorepo setups",
        files: ["monorepo"],
        transform: [],
        env: [],
      },
    },
    conflicts: [],
    postInstall: [],
  };
}

/**
 * Generate README.md content (copied from create-preset.ts for testing)
 */
function generateReadme(options: {
  name: string;
  category: Category;
  description: string;
}): string {
  const categoryConfig = CATEGORY_CONFIGS[options.category];

  return `# ${options.name}

${options.description}

## Category

${categoryConfig.description}${categoryConfig.exclusive ? " (exclusive - only one preset from this category can be installed)" : ""}

## Installation

\`\`\`bash
obora add ${options.name}
\`\`\`

## Configuration

### Dependencies

Add your preset's dependencies to \`manifest.json\`:

\`\`\`json
{
  "common": {
    "dependencies": {
      "your-package": "^1.0.0"
    }
  }
}
\`\`\`

### Files

1. Create template files in the \`files/\` directory
2. Reference them in \`manifest.json\`:

\`\`\`json
{
  "common": {
    "files": ["config.ts"]
  }
}
\`\`\`

### Transforms

Add code transformations in \`manifest.json\`:

\`\`\`json
{
  "common": {
    "transform": [
      {
        "target": "app/providers.tsx",
        "type": "provider-wrap",
        "provider": "YourProvider",
        "content": "import { YourProvider } from './your-provider'"
      }
    ]
  }
}
\`\`\`

## Development

1. Edit \`manifest.json\` to configure your preset
2. Add template files to \`files/\` directory
3. Test with \`obora add ${options.name}\`
4. Validate with \`obora doctor --presets\`

## Transform Types

- \`import\`: Add import statements
- \`dependency\`: Add npm dependencies
- \`provider-wrap\`: Wrap app with a provider component
- \`layout-component\`: Add components to layout
- \`nestjs-module\`: Add NestJS module imports

See [preset.schema.json](../../preset.schema.json) for full schema documentation.
`;
}

/**
 * Create a preset in the specified directory (test helper)
 */
async function createPreset(
  presetsDir: string,
  options: {
    name: string;
    category: string;
    description: string;
    version?: string;
  }
): Promise<{ success: boolean; presetDir: string }> {
  const { name, category, description, version = "1.0.0" } = options;

  // Validate name format
  if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
    return { success: false, presetDir: "" };
  }

  const presetDir = join(presetsDir, category, name);

  // Check if preset already exists
  if (existsSync(presetDir)) {
    return { success: false, presetDir };
  }

  // Create directory structure
  mkdirSync(presetDir, { recursive: true });
  mkdirSync(join(presetDir, "files", "standalone"), { recursive: true });
  mkdirSync(join(presetDir, "files", "monorepo"), { recursive: true });

  // Generate manifest.json
  const manifest = generateManifest({
    name,
    category: category as Category,
    description,
    version,
  });
  writeFileSync(
    join(presetDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n"
  );

  // Generate README.md
  const readme = generateReadme({
    name,
    category: category as Category,
    description,
  });
  writeFileSync(join(presetDir, "README.md"), readme);

  // Create placeholder files
  writeFileSync(
    join(presetDir, "files", "standalone", ".gitkeep"),
    "# Add your standalone target files here\n"
  );
  writeFileSync(
    join(presetDir, "files", "monorepo", ".gitkeep"),
    "# Add your monorepo target files here\n"
  );

  return { success: true, presetDir };
}

describe("create-preset command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `obora-test-create-preset-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("with all arguments provided", () => {
    it("should create preset with valid arguments", async () => {
      const result = await createPreset(tempDir, {
        name: "my-test-preset",
        category: "database",
        description: "Test database preset",
        version: "1.0.0",
      });

      expect(result.success).toBe(true);

      // Verify directory structure
      const presetDir = join(tempDir, "database", "my-test-preset");
      expect(existsSync(presetDir)).toBe(true);
      expect(existsSync(join(presetDir, "manifest.json"))).toBe(true);
      expect(existsSync(join(presetDir, "README.md"))).toBe(true);
      expect(existsSync(join(presetDir, "files", "standalone"))).toBe(true);
      expect(existsSync(join(presetDir, "files", "monorepo"))).toBe(true);

      // Verify manifest content
      const manifest = JSON.parse(
        await fs.readFile(join(presetDir, "manifest.json"), "utf-8")
      );
      expect(manifest.name).toBe("my-test-preset");
      expect(manifest.category).toBe("database");
      expect(manifest.description).toBe("Test database preset");
      expect(manifest.version).toBe("1.0.0");
      expect(manifest.common).toBeDefined();
      expect(manifest.targets).toBeDefined();
    });

    it("should create preset in different categories", async () => {
      const categories = ["auth", "payment", "email", "storage", "ai", "analytics"];

      for (const category of categories) {
        const result = await createPreset(tempDir, {
          name: `test-${category}`,
          category,
          description: `Test ${category} preset`,
          version: "1.0.0",
        });

        expect(result.success).toBe(true);
        const presetDir = join(tempDir, category, `test-${category}`);
        expect(existsSync(presetDir)).toBe(true);
      }
    });

    it("should use default version when not provided", async () => {
      const result = await createPreset(tempDir, {
        name: "default-version-preset",
        category: "linting",
        description: "Test preset",
      });

      expect(result.success).toBe(true);

      const manifest = JSON.parse(
        await fs.readFile(
          join(tempDir, "linting", "default-version-preset", "manifest.json"),
          "utf-8"
        )
      );
      expect(manifest.version).toBe("1.0.0");
    });
  });

  describe("name validation", () => {
    it("should reject invalid preset name (uppercase)", async () => {
      const result = await createPreset(tempDir, {
        name: "MyPreset",
        category: "database",
        description: "Test",
      });

      expect(result.success).toBe(false);
    });

    it("should reject invalid preset name (spaces)", async () => {
      const result = await createPreset(tempDir, {
        name: "my preset",
        category: "database",
        description: "Test",
      });

      expect(result.success).toBe(false);
    });

    it("should reject invalid preset name (starts with number)", async () => {
      const result = await createPreset(tempDir, {
        name: "123-preset",
        category: "database",
        description: "Test",
      });

      expect(result.success).toBe(false);
    });

    it("should accept valid kebab-case names", async () => {
      const validNames = [
        "my-preset",
        "preset",
        "my-long-preset-name",
        "preset123",
        "my-preset-2",
      ];

      for (const name of validNames) {
        const result = await createPreset(tempDir, {
          name,
          category: "database",
          description: "Test",
          version: "1.0.0",
        });

        expect(result.success).toBe(true);
        expect(existsSync(join(tempDir, "database", name))).toBe(true);
      }
    });
  });

  describe("existing preset detection", () => {
    it("should reject if preset already exists", async () => {
      // Create preset first
      const presetDir = join(tempDir, "database", "existing-preset");
      await fs.mkdir(presetDir, { recursive: true });

      const result = await createPreset(tempDir, {
        name: "existing-preset",
        category: "database",
        description: "Test",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("manifest.json generation", () => {
    it("should generate valid manifest structure", async () => {
      const result = await createPreset(tempDir, {
        name: "manifest-test",
        category: "state",
        description: "State management preset",
        version: "2.0.0",
      });

      expect(result.success).toBe(true);

      const manifest = JSON.parse(
        await fs.readFile(
          join(tempDir, "state", "manifest-test", "manifest.json"),
          "utf-8"
        )
      );

      // Verify structure
      expect(manifest.$schema).toBe("../../preset.schema.json");
      expect(manifest.name).toBe("manifest-test");
      expect(manifest.category).toBe("state");
      expect(manifest.description).toBe("State management preset");
      expect(manifest.version).toBe("2.0.0");

      // Verify common section
      expect(manifest.common).toEqual({
        dependencies: {},
        devDependencies: {},
        scripts: {},
        files: [],
        transform: [],
      });

      // Verify targets section
      expect(manifest.targets.standalone).toBeDefined();
      expect(manifest.targets.monorepo).toBeDefined();
      expect(manifest.targets.standalone.files).toEqual(["standalone"]);
      expect(manifest.targets.monorepo.files).toEqual(["monorepo"]);

      // Verify other fields
      expect(manifest.conflicts).toEqual([]);
      expect(manifest.postInstall).toEqual([]);
    });
  });

  describe("README.md generation", () => {
    it("should generate README with correct content", async () => {
      const result = await createPreset(tempDir, {
        name: "readme-test",
        category: "ui",
        description: "A UI component preset",
        version: "1.0.0",
      });

      expect(result.success).toBe(true);

      const readme = await fs.readFile(
        join(tempDir, "ui", "readme-test", "README.md"),
        "utf-8"
      );

      // Verify content
      expect(readme).toContain("# readme-test");
      expect(readme).toContain("A UI component preset");
      expect(readme).toContain("obora add readme-test");
      expect(readme).toContain("obora doctor --presets");
    });
  });

  describe("placeholder files", () => {
    it("should create .gitkeep files in target directories", async () => {
      const result = await createPreset(tempDir, {
        name: "gitkeep-test",
        category: "database",
        description: "Test",
      });

      expect(result.success).toBe(true);

      const standaloneGitkeep = await fs.readFile(
        join(tempDir, "database", "gitkeep-test", "files", "standalone", ".gitkeep"),
        "utf-8"
      );
      const monorepoGitkeep = await fs.readFile(
        join(tempDir, "database", "gitkeep-test", "files", "monorepo", ".gitkeep"),
        "utf-8"
      );

      expect(standaloneGitkeep).toContain("standalone");
      expect(monorepoGitkeep).toContain("monorepo");
    });
  });
});
