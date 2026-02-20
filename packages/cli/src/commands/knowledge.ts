import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Command } from "commander";

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

async function loadKnowledgeEntries(cwd = process.cwd()): Promise<KnowledgeEntry[]> {
  const jsonPath = resolve(cwd, ".obora/knowledge.json");
  const jsonlPath = resolve(cwd, ".obora/knowledge.jsonl");

  try {
    const raw = await readFile(jsonPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as KnowledgeEntry[]) : [];
  } catch {
    // ignore and fallback
  }

  try {
    const raw = await readFile(jsonlPath, "utf-8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as KnowledgeEntry);
  } catch {
    return [];
  }
}

function formatEntry(entry: KnowledgeEntry): string {
  return `- ${entry.id} [${entry.tags.join(", ")}] ${entry.title} (conf=${entry.confidence.toFixed(2)})`;
}

export function createKnowledgeCommand(): Command {
  const cmd = new Command("knowledge").description("Knowledge system commands");

  cmd
    .command("list")
    .description("List knowledge entries")
    .option("--limit <n>", "Result limit", "20")
    .option("--json", "Output as JSON")
    .action(async (opts: { limit: string; json?: boolean }) => {
      const { configureKnowledgeProvider, queryKnowledge } = await import("@obora/sdk");
      const entries = await loadKnowledgeEntries();
      configureKnowledgeProvider(async () => entries);
      const results = await queryKnowledge({ limit: Number(opts.limit) || 20 });

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      if (results.length === 0) {
        console.log("No knowledge entries found.");
        return;
      }

      for (const entry of results) console.log(formatEntry(entry));
    });

  cmd
    .command("query")
    .description("Query knowledge entries by tag/filter")
    .option("--tag <tag>", "Tag filter (repeatable)", (v, acc: string[] = []) => [...acc, v], [])
    .option("--project <id>", "Project ID filter")
    .option("--min-confidence <n>", "Minimum confidence", "0")
    .option("--limit <n>", "Result limit", "20")
    .option("--json", "Output as JSON")
    .action(
      async (opts: {
        tag: string[];
        project?: string;
        minConfidence: string;
        limit: string;
        json?: boolean;
      }) => {
        const { configureKnowledgeProvider, queryKnowledge } = await import("@obora/sdk");
        const entries = await loadKnowledgeEntries();
        configureKnowledgeProvider(async () => entries);

        const results = await queryKnowledge({
          tags: opts.tag.length > 0 ? opts.tag : undefined,
          projectId: opts.project,
          minConfidence: Number(opts.minConfidence),
          limit: Number(opts.limit) || 20,
        });

        if (opts.json) {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        if (results.length === 0) {
          console.log("No knowledge entries matched query.");
          return;
        }

        for (const entry of results) console.log(formatEntry(entry));
      },
    );

  cmd
    .command("search")
    .description("Search knowledge by text")
    .argument("<query>", "Text query")
    .option("--limit <n>", "Result limit", "20")
    .option("--json", "Output as JSON")
    .action(async (query: string, opts: { limit: string; json?: boolean }) => {
      const { configureKnowledgeProvider, queryKnowledge } = await import("@obora/sdk");
      const entries = await loadKnowledgeEntries();
      configureKnowledgeProvider(async () => entries);
      const results = await queryKnowledge({ textQuery: query, limit: Number(opts.limit) || 20 });

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      if (results.length === 0) {
        console.log("No knowledge entries matched search.");
        return;
      }

      for (const entry of results) console.log(formatEntry(entry));
    });

  cmd
    .command("stats")
    .description("Show knowledge domain/tag distribution")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      const entries = await loadKnowledgeEntries();
      const domainCount = new Map<string, number>();
      for (const e of entries) {
        for (const tag of e.tags ?? []) {
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

      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      console.log(`Entries: ${payload.entries}`);
      for (const d of payload.domains) {
        console.log(`- ${d.domain}: ${d.count}`);
      }
    });

  cmd
    .command("schema")
    .description("Knowledge schema helpers")
    .command("show")
    .description("Show active knowledge schema")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      const schemaPath = resolve(process.cwd(), ".obora/knowledge-schema.yaml");
      const raw = await readFile(schemaPath, "utf-8");
      const forceJson = opts.json || process.argv.includes("--json");
      if (forceJson) {
        const { parseKnowledgeSchema } = await import("@obora/sdk");
        console.log(JSON.stringify(parseKnowledgeSchema(raw), null, 2));
      } else {
        console.log(raw);
      }
    });

  return cmd;
}
