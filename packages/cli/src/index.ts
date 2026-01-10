import { defineCommand, runMain as _runMain } from "citty";
import { consola } from "consola";
import { name, version, description } from "../package.json";
import { createCommand } from "./commands/create";
import { addCommand } from "./commands/add";
import { removeCommand } from "./commands/remove";
import { statusCommand } from "./commands/status";
import { listCommand } from "./commands/list";
import { llmHelpCommand } from "./commands/llm-help";

const main = defineCommand({
  meta: {
    name,
    version,
    description,
  },
  subCommands: {
    create: createCommand,
    add: addCommand,
    remove: removeCommand,
    status: statusCommand,
    list: listCommand,
    "llm-help": llmHelpCommand,
  },
  setup() {
    consola.box(`obora v${version}`);
  },
});

export function runMain() {
  _runMain(main);
}

export { createCommand, addCommand, removeCommand, statusCommand, listCommand, llmHelpCommand };
