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

      let artifact;
      try {
        artifact = await runtime.getArtifact(runId, stepName, name);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes("SDK_ARTIFACT_NOT_FOUND") || msg.includes("Artifact not found")) {
          console.error(`Artifact not found: ${runId}/${stepName}/${name}`);
        } else {
          console.error(`Failed to resolve artifact: ${msg}`);
        }
        process.exit(1);
      }

      let data: Buffer;
      try {
        ({ data } = await artifact.download());
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Artifact download failed: ${msg}`);
        process.exit(1);
      }
      if (opts.output) {
        await writeFile(opts.output, data);
        console.log(opts.output);
      } else {
        process.stdout.write(data);
      }
    });

  return cmd;
}
