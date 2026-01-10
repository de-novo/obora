import { defineCommand } from "citty";
import { consola } from "consola";
import { BASES, APP_MODULES, PRESETS, CATEGORIES } from "../utils";

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
  },
  async run({ args }) {
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
