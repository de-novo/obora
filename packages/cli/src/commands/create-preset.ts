import { defineCommand } from "citty";
import { consola } from "consola";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "pathe";
import {
  CATEGORIES,
  CATEGORY_CONFIGS,
  PRESETS_DIR,
  type Category,
} from "../utils/constants";

/**
 * Prompt for category selection
 */
async function promptCategory(): Promise<Category> {
  const choices = CATEGORIES.map((cat) => ({
    label: `${cat} - ${CATEGORY_CONFIGS[cat].description}`,
    value: cat,
    hint: CATEGORY_CONFIGS[cat].exclusive ? "exclusive" : undefined,
  }));

  const answer = await consola.prompt("Select category:", {
    type: "select",
    options: choices,
  });

  return answer as Category;
}

/**
 * Prompt for yes/no confirmation
 */
async function promptConfirm(message: string, defaultValue = false): Promise<boolean> {
  const answer = await consola.prompt(message, {
    type: "confirm",
    initial: defaultValue,
  });
  return answer as boolean;
}

/**
 * Generate manifest.json content
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
 * Generate README.md content
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

export const createPresetCommand = defineCommand({
  meta: {
    name: "create-preset",
    description: "Create a new preset scaffold",
  },
  args: {
    name: {
      type: "positional",
      description: "Preset name (kebab-case)",
      required: false,
    },
    category: {
      type: "string",
      alias: "c",
      description: "Preset category",
    },
    description: {
      type: "string",
      alias: "d",
      description: "Preset description",
    },
    version: {
      type: "string",
      alias: "v",
      description: "Initial version",
      default: "1.0.0",
    },
    yes: {
      type: "boolean",
      alias: "y",
      description: "Skip confirmation prompts",
      default: false,
    },
  },
  async run({ args }) {
    consola.start("Creating new preset...\n");

    // 1. Get preset name
    let name = args.name as string | undefined;
    if (!name) {
      const answer = await consola.prompt("Preset name (kebab-case):", {
        type: "text",
        placeholder: "my-preset",
      });
      name = answer as string;
    }

    // Validate name format
    if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
      consola.error("Preset name must be kebab-case (e.g., my-preset)");
      process.exit(1);
    }

    // 2. Get category
    let category: Category;
    if (args.category && CATEGORIES.includes(args.category as Category)) {
      category = args.category as Category;
    } else {
      category = await promptCategory();
    }

    // 3. Check if preset already exists
    const presetDir = join(PRESETS_DIR, category, name);
    if (existsSync(presetDir)) {
      consola.error(`Preset already exists: ${category}/${name}`);
      process.exit(1);
    }

    // 4. Get description
    let description = args.description as string | undefined;
    if (!description) {
      const answer = await consola.prompt("Description:", {
        type: "text",
        placeholder: "A brief description of your preset",
      });
      description = answer as string;
    }

    if (!description) {
      description = `${name} preset`;
    }

    // 5. Get version
    const version = (args.version as string) || "1.0.0";

    // 6. Show summary
    consola.box(
      `Preset: ${name}\n` +
      `Category: ${category}\n` +
      `Description: ${description}\n` +
      `Version: ${version}\n` +
      `Path: ${presetDir}`
    );

    // 7. Confirm
    if (!args.yes) {
      const confirmed = await promptConfirm("Create this preset?", true);
      if (!confirmed) {
        consola.info("Cancelled");
        return;
      }
    }

    // 8. Create directory structure
    try {
      // Create directories
      mkdirSync(presetDir, { recursive: true });
      mkdirSync(join(presetDir, "files", "standalone"), { recursive: true });
      mkdirSync(join(presetDir, "files", "monorepo"), { recursive: true });

      // Generate manifest.json
      const manifest = generateManifest({
        name,
        category,
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
        category,
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

      consola.success(`Created preset: ${category}/${name}`);
      consola.box(
        `Next steps:\n\n` +
        `1. Edit manifest.json to add dependencies and transforms\n` +
        `2. Add template files to files/ directory\n` +
        `3. Test: obora add ${name}\n` +
        `4. Validate: obora doctor --presets`
      );
    } catch (error) {
      if (error instanceof Error) {
        consola.error(`Failed to create preset: ${error.message}`);
      } else {
        consola.error("Failed to create preset:", error);
      }
      process.exit(1);
    }
  },
});
