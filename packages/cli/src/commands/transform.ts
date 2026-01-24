import { defineCommand } from "citty";
import { consola } from "consola";
import { resolve } from "pathe";
import {
  addImport,
  addExport,
  addDependency,
  addNestJsModule,
  addProviderWrap,
  updateJsonProperty,
  type TransformOptions,
} from "../utils/transform";
import { Errors, showError } from "../utils/errors";

export const transformCommand = defineCommand({
  meta: {
    name: "transform",
    description: "Apply AST-based code transformations",
  },
  args: {
    type: {
      type: "string",
      alias: "t",
      description: "Transform type: import, export, dependency, nestjs-module, provider-wrap, json-property",
      required: true,
    },
    file: {
      type: "string",
      alias: "f",
      description: "Target file path",
      required: true,
    },
    // Import options
    from: {
      type: "string",
      description: "Module specifier for import (e.g., '@nestjs/common')",
    },
    named: {
      type: "string",
      description: "Comma-separated named imports (e.g., 'Module,Injectable')",
    },
    default: {
      type: "string",
      description: "Default import name",
    },
    // Dependency options
    name: {
      type: "string",
      description: "Package name for dependency",
    },
    version: {
      type: "string",
      description: "Package version for dependency (e.g., '^1.0.0')",
    },
    dev: {
      type: "boolean",
      description: "Add as devDependency",
      default: false,
    },
    // NestJS module options
    module: {
      type: "string",
      description: "Module name to add for nestjs-module (e.g., 'PrismaModule')",
    },
    // Provider wrap options
    provider: {
      type: "string",
      description: "Provider component name for provider-wrap",
    },
    props: {
      type: "string",
      description: "Props for provider (e.g., 'attribute=\"class\",defaultTheme=\"system\"')",
    },
    // Export options
    exported: {
      type: "string",
      description: "What to export (e.g., 'UserService', '{ User, UserRole }', '*')",
    },
    exportDefault: {
      type: "boolean",
      description: "Export as default",
      default: false,
    },
    // JSON property options
    path: {
      type: "string",
      description: "Dot-notation path for json-property (e.g., 'compilerOptions.strict')",
    },
    value: {
      type: "string",
      description: "Value to set for json-property (JSON string)",
    },
    merge: {
      type: "boolean",
      description: "Merge with existing value instead of replacing",
      default: false,
    },
    // Common options
    dryRun: {
      type: "boolean",
      alias: "d",
      description: "Preview changes without modifying files",
      default: false,
    },
  },
  async run({ args }) {
    const filePath = resolve(args.file);
    const options: TransformOptions = { dryRun: args.dryRun };

    switch (args.type) {
      case "import": {
        if (!args.from) {
          showError(Errors.invalidArgument("--from is required for import transform"));
          process.exit(1);
        }

        const named = args.named?.split(",").map((s) => s.trim()).filter(Boolean);
        const result = await addImport(
          filePath,
          {
            from: args.from,
            named,
            default: args.default,
          },
          options
        );

        showTransformResult(result, args.dryRun);
        break;
      }

      case "dependency": {
        if (!args.name || !args.version) {
          showError(Errors.invalidArgument("--name and --version are required for dependency transform"));
          process.exit(1);
        }

        const result = await addDependency(
          filePath,
          {
            name: args.name,
            version: args.version,
            dev: args.dev,
          },
          options
        );

        showTransformResult(result, args.dryRun);
        break;
      }

      case "nestjs-module": {
        if (!args.module) {
          showError(Errors.invalidArgument("--module is required for nestjs-module transform"));
          process.exit(1);
        }

        const result = await addNestJsModule(
          filePath,
          { module: args.module },
          options
        );

        showTransformResult(result, args.dryRun);
        break;
      }

      case "provider-wrap": {
        if (!args.provider) {
          showError(Errors.invalidArgument("--provider is required for provider-wrap transform"));
          process.exit(1);
        }

        // Parse props: 'key1="value1",key2="value2"' -> { key1: '"value1"', key2: '"value2"' }
        let props: Record<string, string> | undefined;
        if (args.props) {
          props = {};
          const pairs = args.props.split(",");
          for (const pair of pairs) {
            const [key, ...valueParts] = pair.split("=");
            if (key && valueParts.length > 0) {
              props[key.trim()] = valueParts.join("=").trim();
            }
          }
        }

        const result = await addProviderWrap(
          filePath,
          { provider: args.provider, props },
          options
        );

        showTransformResult(result, args.dryRun);
        break;
      }

      case "export": {
        if (!args.exported) {
          showError(Errors.invalidArgument("--exported is required for export transform"));
          process.exit(1);
        }

        const result = await addExport(
          filePath,
          {
            exported: args.exported,
            from: args.from,
            default: args.exportDefault,
          },
          options
        );

        showTransformResult(result, args.dryRun);
        break;
      }

      case "json-property": {
        if (!args.path || args.value === undefined) {
          showError(Errors.invalidArgument("--path and --value are required for json-property transform"));
          process.exit(1);
        }

        // Parse JSON value
        let parsedValue: unknown;
        try {
          parsedValue = JSON.parse(args.value);
        } catch {
          // If it's not valid JSON, treat it as a string
          parsedValue = args.value;
        }

        const result = await updateJsonProperty(
          filePath,
          {
            path: args.path,
            value: parsedValue,
            merge: args.merge,
          },
          options
        );

        showTransformResult(result, args.dryRun);
        break;
      }

      default:
        showError(Errors.invalidArgument(`Unknown transform type: ${args.type}`));
        consola.info("Available types: import, export, dependency, nestjs-module, provider-wrap, json-property");
        process.exit(1);
    }
  },
});

function showTransformResult(
  result: { success: boolean; changed?: boolean; error?: string; preview?: string },
  isDryRun: boolean
) {
  if (!result.success) {
    consola.error(`Transform failed: ${result.error}`);
    process.exit(1);
  }

  if (isDryRun) {
    if (result.changed) {
      consola.info("Preview (dry-run mode):");
      if (result.preview) {
        console.log("\n" + result.preview + "\n");
      }
      consola.success("Would apply this transformation");
    } else {
      consola.info("No changes needed (already exists or no-op)");
    }
  } else {
    if (result.changed) {
      consola.success("Transform applied successfully");
    } else {
      consola.info("No changes needed (already exists)");
    }
  }
}
