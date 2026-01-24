import prompts from "prompts";
import { consola } from "consola";
import {
  BASES,
  APP_MODULES,
  PRESETS,
  CATEGORIES,
  CATEGORY_CONFIGS,
  getPresetsByCategory,
  getSlotDefault,
  type BaseName,
  type AppModuleName,
  type PresetName,
  type Category,
} from "./constants";

/**
 * Prompt for project name
 */
export async function promptProjectName(initial?: string): Promise<string> {
  const { name } = await prompts({
    type: "text",
    name: "name",
    message: "Project name:",
    initial: initial || "my-app",
    validate: (value: string) => {
      if (!value) return "Project name is required";
      if (!/^[a-z0-9-]+$/.test(value)) {
        return "Project name must be lowercase alphanumeric with dashes";
      }
      return true;
    },
  });

  if (!name) {
    consola.error("Project name is required");
    process.exit(1);
  }

  return name;
}

/**
 * Prompt for base selection
 */
export async function promptBase(): Promise<BaseName> {
  const choices = Object.values(BASES).map((b) => ({
    title: b.name,
    description: b.description,
    value: b.name,
  }));

  const { base } = await prompts({
    type: "select",
    name: "base",
    message: "Select project structure:",
    choices,
  });

  if (!base) {
    consola.error("Base selection is required");
    process.exit(1);
  }

  return base as BaseName;
}

/**
 * Prompt for app modules selection
 */
export async function promptAppModules(): Promise<AppModuleName[]> {
  const choices = Object.values(APP_MODULES).map((m) => ({
    title: m.name,
    description: m.description,
    value: m.name,
    selected: m.name === "nextjs-web", // Default select nextjs-web
  }));

  const { apps } = await prompts({
    type: "multiselect",
    name: "apps",
    message: "Select app modules (space to toggle):",
    choices,
    hint: "- Space to select. Return to submit",
    min: 1,
  });

  if (!apps || apps.length === 0) {
    consola.error("At least one app module is required");
    process.exit(1);
  }

  return apps as AppModuleName[];
}

/**
 * Prompt for preset selection in a specific category
 */
export async function promptPresetForCategory(
  category: Category,
  isOptional = false
): Promise<PresetName | null> {
  const presets = getPresetsByCategory(category);

  if (presets.length === 0) {
    return null;
  }

  const choices = presets.map((name) => {
    const preset = PRESETS[name];
    return {
      title: preset.name,
      description: preset.description,
      value: preset.name,
    };
  });

  if (isOptional) {
    choices.push({
      title: "Skip",
      description: "Don't add this preset",
      value: "__skip__",
    });
  }

  const categoryConfig = CATEGORIES.find((c) => c === category);
  const { preset } = await prompts({
    type: "select",
    name: "preset",
    message: `Select ${category}${isOptional ? " (optional)" : ""}:`,
    choices,
  });

  if (!preset && !isOptional) {
    consola.error(`${category} selection is required`);
    process.exit(1);
  }

  return preset === "__skip__" ? null : (preset as PresetName);
}

/**
 * Prompt for presets based on selected app modules
 */
export async function promptPresetsForModules(
  moduleNames: AppModuleName[],
  useDefaults = false
): Promise<Record<string, { preset: string; version: string } | null>> {
  // Collect all unique slots from selected modules
  const requiredSlots = new Set<Category>();

  for (const moduleName of moduleNames) {
    const module = APP_MODULES[moduleName];
    if (module?.slots) {
      for (const slot of module.slots) {
        requiredSlots.add(slot as Category);
      }
    }
  }

  const selections: Record<string, { preset: string; version: string } | null> = {};

  for (const slot of requiredSlots) {
    if (useDefaults) {
      // Use default preset for the first module that has this slot
      const moduleWithSlot = moduleNames.find((m) =>
        APP_MODULES[m]?.slots.includes(slot)
      );
      const defaultPreset = moduleWithSlot
        ? getSlotDefault(moduleWithSlot, slot)
        : null;

      if (defaultPreset) {
        const presetInfo = PRESETS[defaultPreset];
        selections[slot] = {
          preset: defaultPreset,
          version: presetInfo?.version || "1.0.0",
        };
        consola.info(`Using default ${slot}: ${defaultPreset}`);
      } else {
        selections[slot] = null;
      }
    } else {
      // Prompt for selection
      const isOptional = slot === "auth" || slot === "payment" || slot === "analytics" || slot === "ai";
      const preset = await promptPresetForCategory(slot, isOptional);

      if (preset) {
        const presetInfo = PRESETS[preset];
        selections[slot] = {
          preset,
          version: presetInfo?.version || "1.0.0",
        };
      } else {
        selections[slot] = null;
      }
    }
  }

  return selections;
}

/**
 * Prompt for confirmation
 */
export async function promptConfirm(message: string): Promise<boolean> {
  const { confirmed } = await prompts({
    type: "confirm",
    name: "confirmed",
    message,
    initial: true,
  });

  return confirmed ?? false;
}

/**
 * Prompt for package manager
 */
export async function promptPackageManager(): Promise<"pnpm" | "npm" | "yarn" | "bun"> {
  const { pm } = await prompts({
    type: "select",
    name: "pm",
    message: "Package manager:",
    choices: [
      { title: "pnpm (recommended)", value: "pnpm" },
      { title: "npm", value: "npm" },
      { title: "yarn", value: "yarn" },
      { title: "bun", value: "bun" },
    ],
  });

  return pm || "pnpm";
}

/**
 * Generic select prompt
 */
export async function promptSelect(
  message: string,
  choices: Array<{ label: string; value: string }>
): Promise<string> {
  const { selected } = await prompts({
    type: "select",
    name: "selected",
    message,
    choices: choices.map((c) => ({
      title: c.label,
      value: c.value,
    })),
  });

  if (selected === undefined) {
    consola.error("Selection is required");
    process.exit(1);
  }

  return selected;
}

// Category icons for better visual distinction
const CATEGORY_ICONS: Record<string, string> = {
  database: "🗄️",
  auth: "🔐",
  validation: "✅",
  linting: "🔍",
  payment: "💳",
  email: "📧",
  analytics: "📊",
  storage: "☁️",
  ai: "🤖",
};

/**
 * Prompt for category selection (for interactive mode)
 */
export async function promptCategory(): Promise<Category> {
  const choices = CATEGORIES.map((cat) => {
    const config = CATEGORY_CONFIGS[cat];
    const presetCount = getPresetsByCategory(cat).length;
    const icon = CATEGORY_ICONS[cat] || "📦";
    return {
      title: `${icon}  ${config.description}`,
      description: `${presetCount} preset${presetCount !== 1 ? "s" : ""} available${config.exclusive ? " • exclusive" : ""}`,
      value: cat,
    };
  }).filter((c) => {
    // Only show categories with presets
    const presets = getPresetsByCategory(c.value as Category);
    return presets.length > 0;
  });

  const { category } = await prompts({
    type: "select",
    name: "category",
    message: "Select a category:",
    choices,
  });

  if (!category) {
    consola.error("Category selection is required");
    process.exit(1);
  }

  return category as Category;
}

/**
 * Prompt for preset selection from a category (for interactive mode)
 */
export async function promptPreset(category: Category): Promise<PresetName> {
  const presets = getPresetsByCategory(category);

  if (presets.length === 0) {
    consola.error(`No presets available in category: ${category}`);
    process.exit(1);
  }

  // Sort presets: popular ones first (drizzle, biome, zod, clerk)
  const popularPresets = ["drizzle", "biome", "zod", "clerk", "resend"];
  const sortedPresets = [...presets].sort((a, b) => {
    const aPopular = popularPresets.includes(a);
    const bPopular = popularPresets.includes(b);
    if (aPopular && !bPopular) return -1;
    if (!aPopular && bPopular) return 1;
    return 0;
  });

  const choices = sortedPresets.map((name, index) => {
    const preset = PRESETS[name];
    const isPopular = popularPresets.includes(name);
    const versionBadge = preset.version ? ` v${preset.version}` : "";
    return {
      title: `${preset.name}${versionBadge}${isPopular ? " ★" : ""}`,
      description: preset.description,
      value: preset.name,
    };
  });

  const categoryConfig = CATEGORY_CONFIGS[category];
  const { preset } = await prompts({
    type: "select",
    name: "preset",
    message: `Select ${categoryConfig?.description || category}:`,
    choices,
  });

  if (!preset) {
    consola.error("Preset selection is required");
    process.exit(1);
  }

  return preset as PresetName;
}

// Target type icons
const TARGET_ICONS: Record<string, string> = {
  postgres: "🐘",
  postgresql: "🐘",
  mysql: "🐬",
  sqlite: "📁",
  turso: "🚀",
  neon: "⚡",
  supabase: "⚡",
  planetscale: "🌍",
  nextjs: "▲",
  nestjs: "🐱",
  standalone: "📦",
  monorepo: "📂",
};

/**
 * Prompt for target selection (for ORM preset dialect selection)
 */
export async function promptTarget(
  targets: Array<{ name: string; description?: string; dialect?: string }>,
  contextMessage?: string
): Promise<string> {
  // Determine what kind of targets we're selecting
  const hasDialect = targets.some((t) => t.dialect);
  const isFrameworkTarget = targets.some((t) =>
    t.name.includes("nextjs") || t.name.includes("nestjs")
  );
  const isProjectTarget = targets.some((t) =>
    t.name.includes("standalone") || t.name.includes("monorepo")
  );

  const choices = targets.map((t) => {
    // Find appropriate icon
    const iconKey = t.dialect?.toLowerCase() || t.name.toLowerCase();
    let icon = "";
    for (const [key, emoji] of Object.entries(TARGET_ICONS)) {
      if (iconKey.includes(key)) {
        icon = emoji + " ";
        break;
      }
    }

    let title = icon + t.name;
    if (t.dialect) {
      title = `${icon}${t.dialect}`;
      if (t.name !== t.dialect.toLowerCase()) {
        title += ` (${t.name})`;
      }
    }
    return {
      title,
      description: t.description || "",
      value: t.name,
    };
  });

  // Determine message based on context
  let message = contextMessage || "Select target/variant:";
  if (!contextMessage) {
    if (hasDialect) {
      message = "Select database:";
    } else if (isFrameworkTarget) {
      message = "Select framework target:";
    } else if (isProjectTarget) {
      message = "Select project type:";
    }
  }

  const { target } = await prompts({
    type: "select",
    name: "target",
    message,
    choices,
  });

  if (!target) {
    consola.error("Target selection is required");
    process.exit(1);
  }

  return target;
}

/**
 * Conflict resolution action
 */
export type ConflictAction = "replace" | "keep" | "both";

/**
 * Prompt for conflict resolution when installing a preset that conflicts with an existing one
 */
export async function promptConflictResolution(
  newPreset: string,
  existingPreset: string,
  category: string,
  isExclusive: boolean
): Promise<ConflictAction> {
  // Display conflict information in a clear format
  consola.box(
    `⚠️  Conflict Detected\n\n` +
    `Current: ${existingPreset}\n` +
    `New:     ${newPreset}\n` +
    `Slot:    ${category}${isExclusive ? " (exclusive)" : ""}`
  );

  const choices: Array<{ title: string; description: string; value: ConflictAction }> = [
    {
      title: `🔄 Replace with ${newPreset}`,
      description: `Remove ${existingPreset}, install ${newPreset}`,
      value: "replace",
    },
    {
      title: `✋ Keep ${existingPreset}`,
      description: "Cancel this installation",
      value: "keep",
    },
  ];

  // Only show "both" option for non-exclusive categories (with warning)
  if (!isExclusive) {
    choices.push({
      title: `⚡ Install both`,
      description: "Not recommended - may cause runtime conflicts",
      value: "both",
    });
  }

  const { action } = await prompts({
    type: "select",
    name: "action",
    message: "Choose an action:",
    choices,
    initial: 0,
  });

  if (!action) {
    consola.info("Installation cancelled");
    process.exit(0);
  }

  return action;
}

/**
 * Prompt for installing required preset dependencies
 */
export async function promptInstallDependency(
  targetPreset: string,
  requiredPreset: string,
  category: string
): Promise<boolean> {
  consola.info(`\n${targetPreset} requires ${requiredPreset} (${category})`);

  const { install } = await prompts({
    type: "confirm",
    name: "install",
    message: `Install ${requiredPreset} as well?`,
    initial: true,
  });

  return install ?? false;
}
