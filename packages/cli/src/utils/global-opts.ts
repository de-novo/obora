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
  const findRoot = (current: Command | null | undefined): Command | undefined =>
    current?.parent ? findRoot(current.parent) : (current ?? undefined);

  const opts = (findRoot(cmd)?.opts() ?? {}) as GlobalOptions;
  const noColor = process.env.NO_COLOR !== undefined || opts.color === false;

  formatter.setColorEnabled(!noColor);

  return {
    ...opts,
    noColor,
  };
}
