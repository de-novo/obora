import type { Command } from "commander";

export interface GlobalOptions {
  json?: boolean;
  quiet?: boolean;
}

export function getGlobalOpts(cmd: Command): GlobalOptions {
  let current: Command | null = cmd;
  while (current?.parent) {
    current = current.parent;
  }

  return (current?.opts() ?? {}) as GlobalOptions;
}
