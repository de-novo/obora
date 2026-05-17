import {
  createAgent,
  getAgent,
  readAgents,
  removeAgent,
  updateAgent,
} from "@obora/sdk";
import { Command } from "commander";
import { readFile } from "node:fs/promises";

import { CLIError } from "../utils/cli-error.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { ExitCode } from "../utils/exit-codes.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts, type GlobalOptions } from "../utils/global-opts.js";

interface AgentOptions {
  json?: boolean;
  projectDir?: string;
}

interface AgentCreateOptions extends AgentOptions {
  role?: string;
  description?: string;
  provider?: string;
  model?: string;
  temperature?: string;
  prompt?: string;
  perFile?: boolean;
}

interface AgentEditOptions extends AgentOptions {
  role?: string;
  description?: string;
  provider?: string;
  model?: string;
  temperature?: string;
  prompt?: string;
}

function shouldOutputJson(localJson: boolean | undefined, globalOpts: GlobalOptions): boolean {
  return Boolean(localJson || globalOpts.json);
}

function getProjectDir(options: AgentOptions): string {
  return options.projectDir ?? process.cwd();
}

async function readPromptFromFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch (error) {
    throw new CLIError(
      `Failed to read prompt file: ${path} - ${error instanceof Error ? error.message : String(error)}`,
      ExitCode.CLI_ERROR
    );
  }
}

export function createAgentCommand(): Command {
  const agent = new Command("agent").description("Manage Obora agents");

  agent
    .command("list")
    .description("List agents")
    .option("--json", "Output as JSON")
    .option("--project-dir <dir>", "Project directory")
    .action(async function (this: Command, options: AgentOptions) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          const projectDir = getProjectDir(options);
          const agents = await readAgents(projectDir);

          if (shouldOutputJson(options.json, globalOpts)) {
            formatter.json(agents);
            return;
          }

          if (agents.length === 0) {
            formatter.info("No agents found");
            return;
          }

          console.log("Agents");
          agents.forEach((a) => {
            const model = a.provider && a.model ? ` [${a.provider}/${a.model}]` : "";
            const role = a.role ? ` - ${a.role}` : "";
            console.log(`- ${a.name}${model}${role}`);
          });
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  agent
    .command("show <name>")
    .description("Show agent details")
    .option("--json", "Output as JSON")
    .option("--project-dir <dir>", "Project directory")
    .action(async function (this: Command, name: string, options: AgentOptions) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          const projectDir = getProjectDir(options);
          const a = await getAgent(projectDir, name);

          if (!a) {
            throw new CLIError(`Agent not found: ${name}`, ExitCode.CLI_ERROR);
          }

          if (shouldOutputJson(options.json, globalOpts)) {
            formatter.json(a);
            return;
          }

          console.log(`Agent: ${a.name}`);
          if (a.role) console.log(`Role: ${a.role}`);
          if (a.description) console.log(`Description: ${a.description}`);
          if (a.provider) console.log(`Provider: ${a.provider}`);
          if (a.model) console.log(`Model: ${a.model}`);
          if (a.temperature !== undefined) console.log(`Temperature: ${a.temperature}`);
          if (a.prompt) {
            console.log(`Prompt:`);
            console.log(a.prompt.split("\n").map((line) => `  ${line}`).join("\n"));
          }
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  agent
    .command("create <name>")
    .description("Create a new agent")
    .option("--role <role>", "Agent role")
    .option("--description <desc>", "Agent description")
    .option("--provider <provider>", "LLM provider")
    .option("--model <model>", "Model name")
    .option("--temperature <temp>", "Temperature (0-1)")
    .option("--prompt <prompt>", "Agent prompt text or @file path")
    .option("--per-file", "Save as individual agents/{name}.yaml file")
    .option("--json", "Output as JSON")
    .option("--project-dir <dir>", "Project directory")
    .action(async function (this: Command, name: string, options: AgentCreateOptions) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          const projectDir = getProjectDir(options);
          const prompt = options.prompt?.startsWith("@")
            ? await readPromptFromFile(options.prompt.slice(1))
            : options.prompt;

          await createAgent(
            projectDir,
            {
              name,
              role: options.role,
              description: options.description,
              provider: options.provider,
              model: options.model,
              temperature: options.temperature ? parseFloat(options.temperature) : undefined,
              prompt,
            },
            { perFile: options.perFile }
          );

          const location = options.perFile ? `agents/${name}.yaml` : "agents.yaml";
          formatter.success(`Created agent: ${name} (${location})`);
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  agent
    .command("edit <name>")
    .description("Edit an agent")
    .option("--role <role>", "Agent role")
    .option("--description <desc>", "Agent description")
    .option("--provider <provider>", "LLM provider")
    .option("--model <model>", "Model name")
    .option("--temperature <temp>", "Temperature (0-1)")
    .option("--prompt <prompt>", "Agent prompt text or @file path")
    .option("--json", "Output as JSON")
    .option("--project-dir <dir>", "Project directory")
    .action(async function (this: Command, name: string, options: AgentEditOptions) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          const projectDir = getProjectDir(options);
          const updates: Record<string, unknown> = {};

          if (options.role) updates.role = options.role;
          if (options.description) updates.description = options.description;
          if (options.provider) updates.provider = options.provider;
          if (options.model) updates.model = options.model;
          if (options.temperature) updates.temperature = parseFloat(options.temperature);
          if (options.prompt) {
            updates.prompt = options.prompt.startsWith("@")
              ? await readPromptFromFile(options.prompt.slice(1))
              : options.prompt;
          }

          await updateAgent(projectDir, name, updates);
          formatter.success(`Updated agent: ${name}`);
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  agent
    .command("remove <name>")
    .description("Remove an agent")
    .option("--json", "Output as JSON")
    .option("--project-dir <dir>", "Project directory")
    .action(async function (this: Command, name: string, options: AgentOptions) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          const projectDir = getProjectDir(options);
          await removeAgent(projectDir, name);
          formatter.success(`Removed agent: ${name}`);
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  return agent;
}
