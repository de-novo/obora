import { writeFile } from "node:fs/promises";

import { Command } from "commander";

function runtimeFromConfig(config: {
  persistence?: { enabled?: boolean; adapter?: string; sqlite?: { path?: string }; custom?: unknown };
  artifacts?: { enabled?: boolean; store?: string; local?: { basePath?: string }; custom?: { instance?: unknown } };
}) {
  const persistence = config.persistence;
  const artifacts = config.artifacts;

  return {
    persistence: {
      enabled: persistence?.enabled ?? true,
      adapter: (persistence?.adapter as "sqlite" | "custom") ?? "sqlite",
      sqlite: { path: persistence?.sqlite?.path ?? "./data/obora.db" },
      ...(persistence?.custom ? { custom: persistence.custom as { instance: import("@obora/runtime").StorageAdapter } } : {}),
    },
    artifacts: {
      enabled: artifacts?.enabled ?? true,
      store: (artifacts?.store as "local" | "custom") ?? "local",
      local: { basePath: artifacts?.local?.basePath ?? "./data/artifacts" },
      ...(artifacts?.custom?.instance
        ? { custom: { instance: artifacts.custom.instance as import("@obora/runtime").ArtifactStore } }
        : {}),
    },
  };
}

export function createArtifactCommand(): Command {
  const cmd = new Command("artifact").description("Manage run artifacts");

  cmd
    .command("get")
    .description("Download artifact by runId/stepName/name")
    .argument("<runId>")
    .argument("<stepName>")
    .argument("<name>")
    .option("-o, --output <path>", "Output file path")
    .action(async (runId: string, stepName: string, name: string, opts: { output?: string }) => {
      const { OboraRuntime, loadConfig } = await import("@obora/sdk");
      const config = await loadConfig();
      const runtime = new OboraRuntime(runtimeFromConfig(config ?? {}));

      const artifact = await runtime.getArtifact(runId, stepName, name);
      if (!artifact) {
        console.error(`Artifact not found: ${runId}/${stepName}/${name}`);
        process.exit(1);
      }

      const { data } = await artifact.download();
      if (opts.output) {
        await writeFile(opts.output, data);
        console.log(opts.output);
      } else {
        process.stdout.write(data);
      }
    });

  return cmd;
}
