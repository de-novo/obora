import prompts from "prompts";
import { consola } from "consola";
import {
  BASES,
  APP_MODULES,
  PRESETS,
  CATEGORIES,
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
