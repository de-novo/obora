#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = "packages/sdk/src";
const hits = [];

function walk(dir) {
  readdirSync(dir).forEach((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === "__tests__") return;
      walk(path);
      return;
    }
    if (path.endsWith(".ts")) {
      inspect(path);
    }
  });
}

function isInsideConsoleAlertChannel(lines, lineIndex) {
  const classLine = lines.findIndex((line) => line.includes("export class ConsoleAlertChannel"));
  if (classLine < 0 || lineIndex <= classLine) {
    return false;
  }

  const state = lines.slice(classLine, lineIndex + 1).reduce(
    (currentState, line) =>
      Array.from(line ?? "").reduce((innerState, char) => {
        if (char === "{") {
          return { depth: innerState.depth + 1, opened: true };
        }
        if (char === "}") {
          return { ...innerState, depth: innerState.depth - 1 };
        }
        return innerState;
      }, currentState),
    { depth: 0, opened: false }
  );

  return state.opened && state.depth > 0;
}

function inspect(path) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!line?.includes("console.")) return;

    const allowed =
      path === "packages/sdk/src/alerting/alerting.ts" &&
      isInsideConsoleAlertChannel(lines, index);
    if (!allowed) {
      hits.push(`${path}:${index + 1}:${line.trim()}`);
    }
  });
}

walk(root);

if (hits.length > 0) {
  console.error("[FAIL] SDK library code must not write directly to console:");
  hits.forEach((hit) => {
    console.error(`  - ${hit}`);
  });
  console.error("Use OboraRuntimeConfig.logger or an explicit ConsoleAlertChannel instead.");
  process.exit(1);
}

console.log("[PASS] SDK source has no direct console writes outside ConsoleAlertChannel.");
