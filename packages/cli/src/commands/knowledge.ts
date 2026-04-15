import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Command } from "commander";

import { CLIError } from "../utils/cli-error.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { ExitCode } from "../utils/exit-codes.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts, type GlobalOptions } from "../utils/global-opts.js";

interface KnowledgeEntry {
  id: string;
  title: string;
  body: string;
  tags: string[];
  source: string;
  confidence: number;
  projectId?: string;
  createdAt: string;
  updatedAt?: string;
}

interface KnowledgeQueryOptions {
  limit?: number;
  tags?: string[];
  projectId?: string;
  minConfidence?: number;
  textQuery?: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shouldOutputJson(localJson: boolean | undefined, globalOpts: GlobalOptions): boolean {
  return Boolean(localJson || globalOpts.json);
}

function parsePositiveIntegerOption(
  value: string | undefined,
  fallback: number,
  label: string
): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CLIError(`Invalid knowledge ${label}: ${value}`, ExitCode.VALIDATION_ERROR);
  }
  return parsed;
}

function parseNonNegativeNumberOption(
  value: string | undefined,
  fallback: number,
  label: string
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CLIError(`Invalid knowledge ${label}: ${value}`, ExitCode.VALIDATION_ERROR);
  }
  return parsed;
}

async function loadKnowledgeEntries(cwd = process.cwd()): Promise<KnowledgeEntry[]> {
  const jsonPath = resolve(cwd, ".obora/knowledge.json");
  const jsonlPath = resolve(cwd, ".obora/knowledge.jsonl");

  try {
    const raw = await readFile(jsonPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new CLIError(
        `Knowledge file must contain an array: ${jsonPath}`,
        ExitCode.EXECUTION_FAILED
      );
    }
    return parsed as KnowledgeEntry[];
  } catch (error) {
    const message = getErrorMessage(error);
    if (!message.includes("ENOENT")) {
      if (error instanceof CLIError) throw error;
      throw new CLIError(`Failed to load knowledge file: ${jsonPath}`, ExitCode.EXECUTION_FAILED);
    }
  }

  try {
    const raw = await readFile(jsonlPath, "utf-8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as KnowledgeEntry);
  } catch (error) {
    const message = getErrorMessage(error);
    if (message.includes("ENOENT")) return [];
    throw new CLIError(`Failed to load knowledge file: ${jsonlPath}`, ExitCode.EXECUTION_FAILED);
  }
}

function formatEntry(entry: KnowledgeEntry): string {
  return `- ${entry.id} [${entry.tags.join(", ")}] ${entry.title} (conf=${entry.confidence.toFixed(2)})`;
}

async function queryKnowledgeEntries(query: KnowledgeQueryOptions): Promise<KnowledgeEntry[]> {
  try {
    const { configureKnowledgeProvider, queryKnowledge } = await import("@obora/sdk");
    const entries = await loadKnowledgeEntries();
    configureKnowledgeProvider(async () => entries);
    return (await queryKnowledge(query)) as KnowledgeEntry[];
  } catch (error) {
    if (error instanceof CLIError) throw error;
    throw new CLIError(
      `Failed to query knowledge entries: ${getErrorMessage(error)}`,
      ExitCode.EXECUTION_FAILED
    );
  }
}

async function runKnowledgeList(
  opts: { limit?: string; json?: boolean },
  globalOpts: GlobalOptions
): Promise<void> {
  const results = await queryKnowledgeEntries({
    limit: parsePositiveIntegerOption(opts.limit, 20, "limit"),
  });

  if (shouldOutputJson(opts.json, globalOpts)) {
    formatter.json(results);
    return;
  }

  if (results.length === 0) {
    console.log("No knowledge entries found.");
    return;
  }

  for (const entry of results) console.log(formatEntry(entry));
}

async function runKnowledgeQuery(
  opts: {
    tag: string[];
    project?: string;
    minConfidence?: string;
    limit?: string;
    json?: boolean;
  },
  globalOpts: GlobalOptions
): Promise<void> {
  const results = await queryKnowledgeEntries({
    tags: opts.tag.length > 0 ? opts.tag : undefined,
    projectId: opts.project,
    minConfidence: parseNonNegativeNumberOption(opts.minConfidence, 0, "min-confidence"),
    limit: parsePositiveIntegerOption(opts.limit, 20, "limit"),
  });

  if (shouldOutputJson(opts.json, globalOpts)) {
    formatter.json(results);
    return;
  }

  if (results.length === 0) {
    console.log("No knowledge entries matched query.");
    return;
  }

  for (const entry of results) console.log(formatEntry(entry));
}

async function runKnowledgeSearch(
  query: string,
  opts: { limit?: string; json?: boolean },
  globalOpts: GlobalOptions
): Promise<void> {
  const results = await queryKnowledgeEntries({
    textQuery: query,
    limit: parsePositiveIntegerOption(opts.limit, 20, "limit"),
  });

  if (shouldOutputJson(opts.json, globalOpts)) {
    formatter.json(results);
    return;
  }

  if (results.length === 0) {
    console.log("No knowledge entries matched search.");
    return;
  }

  for (const entry of results) console.log(formatEntry(entry));
}

async function runKnowledgeStats(
  opts: { json?: boolean },
  globalOpts: GlobalOptions
): Promise<void> {
  const entries = await loadKnowledgeEntries();
  const domainCount = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.tags ?? []) {
      const domain = tag.split(".")[0] ?? "unknown";
      domainCount.set(domain, (domainCount.get(domain) ?? 0) + 1);
    }
  }

  const payload = {
    entries: entries.length,
    domains: Array.from(domainCount.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count),
  };

  if (shouldOutputJson(opts.json, globalOpts)) {
    formatter.json(payload);
    return;
  }

  console.log(`Entries: ${payload.entries}`);
  for (const domain of payload.domains) {
    console.log(`- ${domain.domain}: ${domain.count}`);
  }
}

async function runKnowledgeSchemaShow(
  opts: { json?: boolean },
  globalOpts: GlobalOptions
): Promise<void> {
  const schemaPath = resolve(process.cwd(), ".obora/knowledge-schema.yaml");

  let raw: string;
  try {
    raw = await readFile(schemaPath, "utf-8");
  } catch (error) {
    throw new CLIError(
      `Failed to read knowledge schema: ${getErrorMessage(error)}`,
      ExitCode.EXECUTION_FAILED
    );
  }

  if (shouldOutputJson(opts.json, globalOpts)) {
    try {
      const { parseKnowledgeSchema } = await import("@obora/sdk");
      formatter.json(parseKnowledgeSchema(raw));
      return;
    } catch (error) {
      throw new CLIError(
        `Failed to parse knowledge schema: ${getErrorMessage(error)}`,
        ExitCode.EXECUTION_FAILED
      );
    }
  }

  console.log(raw);
}

export function createKnowledgeCommand(): Command {
  const cmd = new Command("knowledge").description("Knowledge system commands");

  cmd
    .command("list")
    .description("List knowledge entries")
    .option("--limit <n>", "Result limit", "20")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, opts: { limit?: string; json?: boolean }) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runKnowledgeList(opts, globalOpts), {
        verbose: Boolean(globalOpts.verbose),
      });
    });

  cmd
    .command("query")
    .description("Query knowledge entries by tag/filter")
    .option("--tag <tag>", "Tag filter (repeatable)", (v, acc: string[] = []) => [...acc, v], [])
    .option("--project <id>", "Project ID filter")
    .option("--min-confidence <n>", "Minimum confidence", "0")
    .option("--limit <n>", "Result limit", "20")
    .option("--json", "Output as JSON")
    .action(async function (
      this: Command,
      opts: {
        tag: string[];
        project?: string;
        minConfidence?: string;
        limit?: string;
        json?: boolean;
      }
    ) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runKnowledgeQuery(opts, globalOpts), {
        verbose: Boolean(globalOpts.verbose),
      });
    });

  cmd
    .command("search")
    .description("Search knowledge by text")
    .argument("<query>", "Text query")
    .option("--limit <n>", "Result limit", "20")
    .option("--json", "Output as JSON")
    .action(async function (
      this: Command,
      query: string,
      opts: { limit?: string; json?: boolean }
    ) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runKnowledgeSearch(query, opts, globalOpts), {
        verbose: Boolean(globalOpts.verbose),
      });
    });

  cmd
    .command("stats")
    .description("Show knowledge domain/tag distribution")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, opts: { json?: boolean }) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runKnowledgeStats(opts, globalOpts), {
        verbose: Boolean(globalOpts.verbose),
      });
    });

  cmd
    .command("schema")
    .description("Knowledge schema helpers")
    .command("show")
    .description("Show active knowledge schema")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, opts: { json?: boolean }) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runKnowledgeSchemaShow(opts, globalOpts), {
        verbose: Boolean(globalOpts.verbose),
      });
    });

  return cmd;
}
