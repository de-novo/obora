import { defineCommand } from "citty";
import { consola } from "consola";
import { join } from "pathe";
import {
  BASES,
  APP_MODULES,
  PRESETS,
  CATEGORIES,
  PRESETS_DIR,
  CATEGORY_CONFIGS,
  readJson,
  fileExists,
} from "../utils";

interface PresetTarget {
  description: string;
  dialect?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface PresetManifest {
  name: string;
  category: string;
  description: string;
  version?: string;
  targets?: Record<string, PresetTarget>;
  variants?: Record<string, PresetTarget>;
}

/**
 * Show detailed preset browser with targets and variants
 */
async function showPresetBrowser(categoryFilter?: string): Promise<void> {
  consola.box("🧩 Preset Browser");
  console.log("");

  for (const category of CATEGORIES) {
    if (categoryFilter && category !== categoryFilter) {
      continue;
    }

    const categoryConfig = CATEGORY_CONFIGS[category];
    const categoryPresets = Object.values(PRESETS).filter(
      (p) => p.category === category
    );

    if (categoryPresets.length === 0) continue;

    // Category header
    const exclusiveTag = categoryConfig.exclusive ? " (exclusive)" : "";
    console.log(`  ┌─ ${category.toUpperCase()}${exclusiveTag}`);
    console.log(`  │  ${categoryConfig.description}`);
    console.log(`  │`);

    for (const preset of categoryPresets) {
      // Read manifest for detailed info
      const manifestPath = join(PRESETS_DIR, preset.category, preset.name, "manifest.json");
      let targets: string[] = [];
      let targetDetails: Record<string, PresetTarget> = {};

      if (await fileExists(manifestPath)) {
        const manifest = await readJson<PresetManifest>(manifestPath);
        targetDetails = manifest.targets || manifest.variants || {};
        targets = Object.keys(targetDetails);
      }

      // Preset name and description
      console.log(`  ├── ${preset.name} (v${preset.version})`);
      console.log(`  │   ${preset.description}`);

      // Show targets if available
      if (targets.length > 0) {
        console.log(`  │   Targets:`);
        for (const targetName of targets) {
          const target = targetDetails[targetName];
          const dialectInfo = target.dialect ? ` [${target.dialect}]` : "";
          console.log(`  │     • ${targetName}${dialectInfo}: ${target.description}`);
        }
      }

      console.log(`  │`);
    }

    console.log(`  └─`);
    console.log("");
  }

  // Usage hint
  consola.info("Usage:");
  console.log("  obora add <preset>              # Interactive target selection");
  console.log("  obora add <preset> --target <t> # Specify target directly");
  console.log("  obora add                       # Interactive category → preset → target");
}

export const listCommand = defineCommand({
  meta: {
    name: "list",
    description: "List available bases, app modules, and presets",
  },
  args: {
    type: {
      type: "string",
      alias: "t",
      description: "Filter by type (bases, apps, presets)",
    },
    category: {
      type: "string",
      alias: "c",
      description: "Filter presets by category",
    },
    available: {
      type: "boolean",
      alias: "a",
      description: "Show detailed preset browser with targets and variants",
      default: false,
    },
  },
  async run({ args }) {
    // Preset browser mode: show detailed preset information
    if (args.available) {
      await showPresetBrowser(args.category as string | undefined);
      return;
    }

    const showBases = !args.type || args.type === "bases";
    const showApps = !args.type || args.type === "apps";
    const showPresets = !args.type || args.type === "presets";

    if (showBases) {
      consola.box("📦 Bases");
      console.log("");

      for (const base of Object.values(BASES)) {
        console.log(`  ${base.name}`);
        console.log(`    ${base.description}`);
        console.log(`    Features: ${base.features.join(", ")}`);
        console.log("");
      }
    }

    if (showApps) {
      consola.box("🔧 App Modules");
      console.log("");

      for (const app of Object.values(APP_MODULES)) {
        console.log(`  ${app.name}`);
        console.log(`    ${app.description}`);
        console.log(`    Features: ${app.features.join(", ")}`);
        console.log(`    Slots: ${app.slots.join(", ")}`);
        console.log("");
      }
    }

    if (showPresets) {
      consola.box("🧩 Presets");
      console.log("");

      const categoryFilter = args.category as string | undefined;

      for (const category of CATEGORIES) {
        if (categoryFilter && category !== categoryFilter) {
          continue;
        }

        const categoryPresets = Object.values(PRESETS).filter(
          (p) => p.category === category
        );

        if (categoryPresets.length === 0) continue;

        console.log(`  [${category.toUpperCase()}]`);

        for (const preset of categoryPresets) {
          console.log(`    ${preset.name}`);
          console.log(`      ${preset.description}`);
        }
        console.log("");
      }
    }

    // Usage examples
    consola.box(
      "Usage Examples:\n\n" +
        "  # Create new project\n" +
        "  obora create my-app\n\n" +
        "  # Create with specific base and apps\n" +
        "  obora create my-app -b monorepo -a nextjs-web,nestjs-api\n\n" +
        "  # Add preset to existing project\n" +
        "  obora add clerk\n\n" +
        "  # List only presets by category\n" +
        "  obora list -t presets -c auth"
    );
  },
});
