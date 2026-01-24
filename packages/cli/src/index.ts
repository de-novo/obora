import { defineCommand, runMain as _runMain } from "citty";
import { consola } from "consola";
import { name, version, description } from "../package.json";
import { createCommand } from "./commands/create";
import { createPresetCommand } from "./commands/create-preset";
import { addCommand } from "./commands/add";
import { removeCommand } from "./commands/remove";
import { statusCommand } from "./commands/status";
import { listCommand } from "./commands/list";
import { llmHelpCommand } from "./commands/llm-help";
import { initCommand } from "./commands/init";
import { upgradeCommand } from "./commands/upgrade";
import { doctorCommand } from "./commands/doctor";
import { ejectCommand } from "./commands/eject";
import { chatCommand } from "./commands/chat";
import { runCommand } from "./commands/run";
import { sandboxCommand } from "./commands/sandbox";
import { configCommand } from "./commands/config";
import { titleGenerateCommand } from "./commands/title-generate";
import { syncCommand } from "./commands/sync";
import { transformCommand } from "./commands/transform";
import { undoCommand } from "./commands/undo";
import { initializeGlobalConfig } from "./utils";

const main = defineCommand({
  meta: {
    name,
    version,
    description,
  },
  subCommands: {
    create: createCommand,
    "create-preset": createPresetCommand,
    init: initCommand,
    add: addCommand,
    remove: removeCommand,
    upgrade: upgradeCommand,
    eject: ejectCommand,
    doctor: doctorCommand,
    status: statusCommand,
    list: listCommand,
    config: configCommand,
    "llm-help": llmHelpCommand,
    chat: chatCommand,
    run: runCommand,
    sandbox: sandboxCommand,
    sync: syncCommand,
    transform: transformCommand,
    undo: undoCommand,
    "title-generate": titleGenerateCommand,
  },
  setup() {
    // Initialize global ~/.obora/ directory and dashboard.db
    initializeGlobalConfig();
    consola.box(`obora v${version}`);
  },
});

export function runMain() {
  _runMain(main);
}

export { createCommand, createPresetCommand, initCommand, addCommand, removeCommand, upgradeCommand, ejectCommand, doctorCommand, statusCommand, listCommand, configCommand, llmHelpCommand, chatCommand, runCommand, sandboxCommand, syncCommand, transformCommand, undoCommand, titleGenerateCommand };

// Re-export from new packages for backwards compatibility
export * from "@obora/workflow-core";
export { ClaudeAgentProvider, simpleQuery } from "@obora/agent-claude";

// CLI utilities
export { CLIError, Errors, showError, type ErrorCode } from "./utils/errors";
export { withSpinner, ProgressGroup, runTasks, runPreflightChecks, showResults, showSummary, createSpinner, NestedProgress, runInstallSteps, type TaskStep, type TaskOptions, type PreflightCheck, type PreflightResult, type SummaryItem, type NestedStep, type InstallStep } from "./utils/progress";
