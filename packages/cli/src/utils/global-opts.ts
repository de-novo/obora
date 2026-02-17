import type { Command } from "commander";

import { formatter } from "./formatter.js";

export interface GlobalOptions {
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  noColor?: boolean;
  color?: boolean;
}

export function getGlobalOpts(cmd: Command): GlobalOptions {
  let current: Command | null = cmd;
  while (current?.parent) {
    current = current.parent;
  }

  const opts = (current?.opts() ?? {}) as GlobalOptions;
  const noColor = process.env.NO_COLOR !== undefined || opts.color === false;

  formatter.setColorEnabled(!noColor);

  return {
    ...opts,
    noColor,
  };
}
