import { defineCommand, runMain as _runMain } from "citty";
import { consola } from "consola";
import { name, version, description } from "../package.json";
import { createCommand } from "./commands/create";
import { addCommand } from "./commands/add";
import { removeCommand } from "./commands/remove";
import { statusCommand } from "./commands/status";
import { listCommand } from "./commands/list";
import { llmHelpCommand } from "./commands/llm-help";
import { initCommand } from "./commands/init";
import { upgradeCommand } from "./commands/upgrade";
import { doctorCommand } from "./commands/doctor";
import { ejectCommand } from "./commands/eject";
import { dashboardCommand } from "./commands/dashboard";
import { chatCommand } from "./commands/chat";
import { runCommand } from "./commands/run";
import { startServer, stopServer } from "./dashboard/server";
import { initializeGlobalConfig } from "./utils";

const main = defineCommand({
  meta: {
    name,
    version,
    description,
  },
  subCommands: {
    create: createCommand,
    init: initCommand,
    add: addCommand,
    remove: removeCommand,
    upgrade: upgradeCommand,
    eject: ejectCommand,
    doctor: doctorCommand,
    status: statusCommand,
    list: listCommand,
    "llm-help": llmHelpCommand,
    dashboard: dashboardCommand,
    chat: chatCommand,
    run: runCommand,
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

export { createCommand, initCommand, addCommand, removeCommand, upgradeCommand, ejectCommand, doctorCommand, statusCommand, listCommand, llmHelpCommand, dashboardCommand, chatCommand, runCommand };
export { startServer, stopServer };
export * from "./orchestrator";
