import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AgentConfigResolver } from "@obora-kit/adapters";
import { Command } from "commander";
import YAML from "yaml";

type AgentYamlConfig = {
  defaults?: Record<string, unknown>;
  providers?: Record<string, Record<string, unknown>>;
  agents?: Record<string, Record<string, unknown>>;
};

function getProjectConfigPath(cwd: string = process.cwd()): string {
  return path.join(cwd, ".obora", "config.yaml");
}

function getGlobalConfigPath(): string {
  return path.join(os.homedir(), ".obora", "config.yaml");
}

async function readYaml(pathname: string): Promise<AgentYamlConfig> {
  if (!existsSync(pathname)) return {};
  const raw = await readFile(pathname, "utf-8");
  if (!raw.trim()) return {};
  return (YAML.parse(raw) as AgentYamlConfig) ?? {};
}

async function writeYaml(pathname: string, config: AgentYamlConfig): Promise<void> {
  await mkdir(path.dirname(pathname), { recursive: true });
  await writeFile(pathname, YAML.stringify(config), "utf-8");
}

function printScope(scope: "project" | "global"): void {
  console.log(`scope: ${scope}`);
}

export function createAgentsCommand(): Command {
  const agents = new Command("agents").description("Manage agent configuration");

  agents
    .command("list")
    .description("List configured agents with resolved provider/model")
    .action(async () => {
      const resolver = await AgentConfigResolver.create(process.cwd());
      const items = resolver.listAgents();
      for (const item of items) {
        console.log(`${item.name}\t${item.config.provider}\t${item.config.model}`);
      }
    });

  agents
    .command("show <name>")
    .description("Show resolved agent configuration")
    .action(async (name: string) => {
      const resolver = await AgentConfigResolver.create(process.cwd());
      console.log(JSON.stringify(resolver.resolve(name), null, 2));
    });

  agents
    .command("set <name>")
    .description("Set provider/model for an agent")
    .requiredOption("--provider <provider>", "Provider name")
    .requiredOption("--model <model>", "Model name")
    .option("--scope <scope>", "project|global", "project")
    .action(
      async (
        name: string,
        options: { provider: string; model: string; scope?: "project" | "global" }
      ) => {
        const scope = options.scope === "global" ? "global" : "project";
        const configPath = scope === "global" ? getGlobalConfigPath() : getProjectConfigPath();
        const config = await readYaml(configPath);

        config.agents = config.agents ?? {};
        config.agents[name] = {
          ...(config.agents[name] ?? {}),
          provider: options.provider,
          model: options.model,
        };

        await writeYaml(configPath, config);
        printScope(scope);
        console.log(`updated agent '${name}' -> ${options.provider}/${options.model}`);
      }
    );

  agents
    .command("reset <name>")
    .description("Reset agent override to defaults")
    .option("--scope <scope>", "project|global", "project")
    .action(async (name: string, options: { scope?: "project" | "global" }) => {
      const scope = options.scope === "global" ? "global" : "project";
      const configPath = scope === "global" ? getGlobalConfigPath() : getProjectConfigPath();
      const config = await readYaml(configPath);

      if (!config.agents?.[name]) {
        printScope(scope);
        console.log(`agent '${name}' is already reset`);
        return;
      }

      delete config.agents[name];
      if (Object.keys(config.agents).length === 0) {
        delete config.agents;
      }

      await writeYaml(configPath, config);
      printScope(scope);
      console.log(`reset agent '${name}'`);
    });

  return agents;
}
