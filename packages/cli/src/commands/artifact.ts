import { writeFile } from "node:fs/promises";

import { Command } from "commander";

import { CLIError } from "../utils/cli-error.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { ExitCode } from "../utils/exit-codes.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts, type GlobalOptions } from "../utils/global-opts.js";

interface ArtifactRecordLike {
  runId?: string;
  stepName?: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt?: string;
  download(): Promise<{ data: Buffer }>;
}

function runtimeFromConfig(config: {
  persistence?: {
    enabled?: boolean;
    adapter?: string;
    sqlite?: { path?: string };
    custom?: unknown;
  };
  artifacts?: {
    enabled?: boolean;
    store?: string;
    local?: { basePath?: string };
    custom?: { instance?: unknown };
  };
}) {
  const persistence = config.persistence;
  const artifacts = config.artifacts;

  return {
    persistence: {
      enabled: persistence?.enabled ?? true,
      adapter: (persistence?.adapter as "sqlite" | "custom") ?? "sqlite",
      sqlite: { path: persistence?.sqlite?.path ?? "./data/obora.db" },
      ...(persistence?.custom
        ? { custom: persistence.custom as { instance: import("@obora/runtime").StorageAdapter } }
        : {}),
    },
    artifacts: {
      enabled: artifacts?.enabled ?? true,
      store: (artifacts?.store as "local" | "custom") ?? "local",
      local: { basePath: artifacts?.local?.basePath ?? "./data/artifacts" },
      ...(artifacts?.custom?.instance
        ? {
            custom: {
              instance: artifacts.custom.instance as import("@obora/runtime").ArtifactStore,
            },
          }
        : {}),
    },
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shouldOutputJson(localJson: boolean | undefined, globalOpts: GlobalOptions): boolean {
  return Boolean(localJson || globalOpts.json);
}

async function createArtifactRuntime() {
  try {
    const { OboraRuntime, loadConfig } = await import("@obora/sdk");
    const config = await loadConfig();
    return new OboraRuntime(runtimeFromConfig(config ?? {}));
  } catch (error) {
    throw new CLIError(
      `Failed to initialize artifact runtime: ${getErrorMessage(error)}`,
      ExitCode.EXECUTION_FAILED
    );
  }
}

async function loadArtifact(
  runId: string,
  stepName: string,
  name: string
): Promise<{ artifact: ArtifactRecordLike; data: Buffer }> {
  const runtime = await createArtifactRuntime();

  let artifact: ArtifactRecordLike;
  try {
    artifact = (await runtime.getArtifact(runId, stepName, name)) as ArtifactRecordLike;
  } catch (error) {
    const message = getErrorMessage(error);
    if (message.includes("SDK_ARTIFACT_NOT_FOUND") || message.includes("Artifact not found")) {
      throw new CLIError(
        `Artifact not found: ${runId}/${stepName}/${name}`,
        ExitCode.VALIDATION_ERROR
      );
    }
    throw new CLIError(`Failed to resolve artifact: ${message}`, ExitCode.EXECUTION_FAILED);
  }

  try {
    const { data } = await artifact.download();
    return { artifact, data };
  } catch (error) {
    throw new CLIError(
      `Artifact download failed: ${getErrorMessage(error)}`,
      ExitCode.EXECUTION_FAILED
    );
  }
}

async function runGetArtifact(
  runId: string,
  stepName: string,
  name: string,
  opts: { output?: string; json?: boolean },
  globalOpts: GlobalOptions
): Promise<void> {
  const jsonOutput = shouldOutputJson(opts.json, globalOpts);
  if (jsonOutput && !opts.output) {
    throw new CLIError(
      "Artifact JSON output requires --output so binary payload is not mixed with JSON stdout",
      ExitCode.VALIDATION_ERROR
    );
  }

  const { artifact, data } = await loadArtifact(runId, stepName, name);

  if (opts.output) {
    try {
      await writeFile(opts.output, data);
    } catch (error) {
      throw new CLIError(
        `Failed to write artifact output: ${getErrorMessage(error)}`,
        ExitCode.EXECUTION_FAILED
      );
    }

    if (jsonOutput) {
      formatter.json({
        runId: artifact.runId ?? runId,
        stepName: artifact.stepName ?? stepName,
        name: artifact.name ?? name,
        ...(artifact.mimeType ? { mimeType: artifact.mimeType } : {}),
        ...(typeof artifact.sizeBytes === "number" ? { sizeBytes: artifact.sizeBytes } : {}),
        ...(artifact.createdAt ? { createdAt: artifact.createdAt } : {}),
        outputPath: opts.output,
      });
      return;
    }

    console.log(opts.output);
    return;
  }

  process.stdout.write(data);
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
    .option("--json", "Output artifact metadata as JSON (requires --output)")
    .action(async function (
      this: Command,
      runId: string,
      stepName: string,
      name: string,
      opts: { output?: string; json?: boolean }
    ) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runGetArtifact(runId, stepName, name, opts, globalOpts), {
        verbose: Boolean(globalOpts.verbose),
      });
    });

  return cmd;
}
