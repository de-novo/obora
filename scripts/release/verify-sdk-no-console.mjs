#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = "packages/sdk/src";
const hits = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === "__tests__") continue;
      walk(path);
      continue;
    }
    if (path.endsWith(".ts")) {
      inspect(path);
    }
  }
}

function isInsideConsoleAlertChannel(lines, lineIndex) {
  const classLine = lines.findIndex((line) => line.includes("export class ConsoleAlertChannel"));
  if (classLine < 0 || lineIndex <= classLine) {
    return false;
  }

  let depth = 0;
  let opened = false;
  for (let index = classLine; index <= lineIndex; index += 1) {
    for (const char of lines[index] ?? "") {
      if (char === "{") {
        depth += 1;
        opened = true;
      } else if (char === "}") {
        depth -= 1;
      }
    }
  }

  return opened && depth > 0;
}

function inspect(path) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line?.includes("console.")) continue;

    const allowed =
      path === "packages/sdk/src/alerting/alerting.ts" &&
      isInsideConsoleAlertChannel(lines, index);
    if (!allowed) {
      hits.push(`${path}:${index + 1}:${line.trim()}`);
    }
  }
}

walk(root);

if (hits.length > 0) {
  console.error("[FAIL] SDK library code must not write directly to console:");
  for (const hit of hits) {
    console.error(`  - ${hit}`);
  }
  console.error("Use OboraRuntimeConfig.logger or an explicit ConsoleAlertChannel instead.");
  process.exit(1);
}

console.log("[PASS] SDK source has no direct console writes outside ConsoleAlertChannel.");
