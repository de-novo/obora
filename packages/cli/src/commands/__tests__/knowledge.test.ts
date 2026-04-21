import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalCwd = process.cwd();
let knowledgeProvider: (() => Promise<unknown[]>) | undefined;

vi.mock("@obora/sdk", () => ({
  configureKnowledgeProvider: vi.fn((provider: () => Promise<unknown[]>) => {
    knowledgeProvider = provider;
  }),
  queryKnowledge: vi.fn(async (opts: Record<string, unknown> = {}) => {
    const entries = ((await knowledgeProvider?.()) ?? []) as Array<Record<string, unknown>>;
    const filtered = entries.filter((entry) => {
      const minConfidence = typeof opts.minConfidence === "number" ? opts.minConfidence : 0;
      if (typeof entry.confidence === "number" && entry.confidence < minConfidence) return false;
      if (typeof opts.projectId === "string" && entry.projectId !== opts.projectId) return false;
      if (Array.isArray(opts.tags) && opts.tags.length > 0) {
        const tags = Array.isArray(entry.tags) ? entry.tags : [];
        if (!(opts.tags as string[]).every((tag) => tags.includes(tag))) return false;
      }
      if (typeof opts.textQuery === "string") {
        const haystack = `${entry.title ?? ""}\n${entry.body ?? ""}`.toLowerCase();
        if (!haystack.includes(opts.textQuery.toLowerCase())) return false;
      }
      return true;
    });
    const limit = typeof opts.limit === "number" ? opts.limit : filtered.length;
    return filtered.slice(0, limit);
  }),
  parseKnowledgeSchema: vi.fn((raw: string) => ({
    version: "1.0",
    fields: [{ name: "title", type: "string" }],
    rawLength: raw.length,
  })),
  OboraError: class OboraError extends Error {
    code: string;

    constructor(message: string, code = "TEST_ERROR") {
      super(message);
      this.code = code;
    }
  },
  OboraErrorCode: {
    POLICY_GATE_TIMEOUT: "POLICY_GATE_TIMEOUT",
    CELL_ABORTED: "CELL_ABORTED",
  },
}));

import { createCLI } from "../../cli.js";
import { ExitCode } from "../../utils/exit-codes.js";
import { createKnowledgeCommand } from "../knowledge.js";

describe("knowledge command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    knowledgeProvider = undefined;
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? "undefined"}`);
    }) as never);
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("lists knowledge entries as JSON with local --json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-knowledge-"));
    await mkdir(join(dir, ".obora"), { recursive: true });
    await writeFile(
      join(dir, ".obora", "knowledge.json"),
      JSON.stringify([
        {
          id: "entry-1",
          title: "Release note policy",
          body: "READY marker is required.",
          tags: ["qa.policy"],
          source: "manual",
          confidence: 0.9,
          createdAt: "2026-03-10T10:00:00.000Z",
        },
      ])
    );
    process.chdir(dir);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createKnowledgeCommand();

    await cmd.parseAsync(["list", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "[]");
    expect(payload).toEqual([
      expect.objectContaining({
        id: "entry-1",
        title: "Release note policy",
      }),
    ]);
  });

  it("inherits root --json for knowledge schema show", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-knowledge-schema-"));
    await mkdir(join(dir, ".obora"), { recursive: true });
    await writeFile(join(dir, ".obora", "knowledge-schema.yaml"), "version: '1.0'\nfields: []\n");
    process.chdir(dir);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cli = createCLI();

    await cli.parseAsync(["--json", "knowledge", "schema", "show"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(expect.objectContaining({ version: "1.0" }));
  });

  it("inherits root --json for knowledge stats", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-knowledge-stats-"));
    await mkdir(join(dir, ".obora"), { recursive: true });
    await writeFile(
      join(dir, ".obora", "knowledge.json"),
      JSON.stringify([
        {
          id: "entry-1",
          title: "Release note policy",
          body: "READY marker is required.",
          tags: ["qa.policy", "qa.checklist"],
          source: "manual",
          confidence: 0.9,
          createdAt: "2026-03-10T10:00:00.000Z",
        },
        {
          id: "entry-2",
          title: "Judge prompt note",
          body: "Prefer concise score rationale.",
          tags: ["judge.prompt"],
          source: "manual",
          confidence: 0.8,
          createdAt: "2026-03-11T10:00:00.000Z",
        },
      ])
    );
    process.chdir(dir);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cli = createCLI();

    await cli.parseAsync(["--json", "knowledge", "stats"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual({
      entries: 2,
      domains: [
        { domain: "qa", count: 2 },
        { domain: "judge", count: 1 },
      ],
    });
  });

  it("uses validation exit code for invalid knowledge limits", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-knowledge-invalid-limit-"));
    await mkdir(join(dir, ".obora"), { recursive: true });
    await writeFile(join(dir, ".obora", "knowledge.json"), "[]");
    process.chdir(dir);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createKnowledgeCommand();

    await cmd.parseAsync(["list", "--limit", "abc"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain(
      "obora run <workflow.yaml> --dry-run"
    );
  });

  it("uses execution-failed exit code for missing knowledge schema", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-knowledge-missing-schema-"));
    await mkdir(join(dir, ".obora"), { recursive: true });
    process.chdir(dir);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createKnowledgeCommand();

    await cmd.parseAsync(["schema", "show"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(error).toHaveBeenCalled();
    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain(
      "obora init --quickstart"
    );
  });
});
