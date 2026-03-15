import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFile = promisify(execFileCb);
const REPO_ROOT = join(process.cwd(), "..", "..");
const GLM_SCRIPT = join(
  REPO_ROOT,
  "sandbox/glm47-research-loop/run-master-loop-compact.sh",
);
const GLM_WORKFLOW = join(
  REPO_ROOT,
  "sandbox/glm47-research-loop/workflows/00-master-research-loop-compact.yaml",
);
const GLM_WORKFLOW_DIR = join(
  REPO_ROOT,
  "sandbox/glm47-research-loop/workflows",
);
const GLM_RUNNER = join(
  REPO_ROOT,
  "sandbox/glm47-research-loop/run-master-loop-compact.sh",
);
const GLM_RUNNER_DIR = join(
  REPO_ROOT,
  "sandbox/glm47-research-loop",
);
const MATH_WORKFLOW = join(
  REPO_ROOT,
  "sandbox/math-proof-loop/workflows/00-math-proof-loop.yaml",
);
const MATH_RUNNER = join(
  REPO_ROOT,
  "sandbox/math-proof-loop/run-math-proof-loop.sh",
);

describe("research sandbox regressions", () => {
  it("glm runner falls back to latest result JSON and trims decision whitespace", async () => {
    const script = await readFile(GLM_SCRIPT, "utf8");
    const [functionBlock] = script.split('\ncd "$REPO_ROOT"\n');
    expect(functionBlock).toContain("extract_decision()");

    const dir = await mkdtemp(join(tmpdir(), "obora-glm-decision-"));
    const resultJson = join(dir, "result.json");
    await writeFile(
      resultJson,
      JSON.stringify(
        {
          outputs: {
            "review-and-finalize": [
              "# Loop Decision",
              "",
              "- decision:   STOP   ",
              "- rationale: archiveable bounded conclusion",
            ].join("\n"),
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const bash = [
      functionBlock,
      `LAST_RESULT_JSON=${JSON.stringify(resultJson)}`,
      'DECISION_FILE="/tmp/does-not-exist.md"',
      'extract_decision "$DECISION_FILE"',
    ].join("\n");

    const { stdout } = await execFile("bash", ["-c", bash], {
      cwd: REPO_ROOT,
      env: process.env,
    });

    expect(stdout.trim()).toBe("STOP");
  });

  it("glm workflows keep read/write paths confined to sandbox-local locations", async () => {
    const workflow = await readFile(GLM_WORKFLOW, "utf8");
    const workflowFiles = (await readdir(GLM_WORKFLOW_DIR))
      .filter((name) => name.endsWith(".yaml"))
      .sort();

    expect(workflow).toContain(
      "/Users/denovo/workspace/github/obora-kit/sandbox/glm47-research-loop/input/research-brief.md",
    );
    expect(workflow).toContain(
      "/Users/denovo/workspace/github/obora-kit/sandbox/glm47-research-loop/output/final/23-loop-decision.md",
    );
    expect(workflow).toContain(
      "/Users/denovo/workspace/github/obora-kit/sandbox/glm47-research-loop/output/archive/34-archive-bundle-index.md",
    );

    expect(workflow).not.toContain("Read input/research-brief.md");
    expect(workflow).not.toContain(" and input/loop-policy.md.");
    expect(workflow).not.toMatch(/^[\t ]*- output\/final\/23-loop-decision\.md$/m);
    expect(workflow).not.toMatch(/^[\t ]*- output\/archive\/34-archive-bundle-index\.md$/m);

    for (const file of workflowFiles) {
      const text = await readFile(join(GLM_WORKFLOW_DIR, file), "utf8");
      expect(text, file).not.toContain("/Users/denovo/workspace/github/obora-kit/output/");
      expect(text, file).not.toContain("Read input/");
      expect(text, file).not.toContain("Write output/");
      expect(text, file).not.toContain("Write/update output/");
      expect(text, file).not.toContain("Read output/");
    }
  });

  it("math proof workflow writes only to sandbox-local output paths", async () => {
    const workflow = await readFile(MATH_WORKFLOW, "utf8");

    expect(workflow).toContain(
      "/Users/denovo/workspace/github/obora-kit/sandbox/math-proof-loop/output/final/22-math-final-conclusion.md",
    );
    expect(workflow).toContain(
      "/Users/denovo/workspace/github/obora-kit/sandbox/math-proof-loop/output/archive/45-math-archive-bundle-index.md",
    );

    expect(workflow).not.toContain("/Users/denovo/workspace/github/obora-kit/output/final/");
    expect(workflow).not.toContain("/Users/denovo/workspace/github/obora-kit/output/iterations/");
    expect(workflow).not.toContain("/Users/denovo/workspace/github/obora-kit/output/archive/");
  });

  it("research runners use idle watchdogs with large safety ceilings", async () => {
    const glmRunner = await readFile(GLM_RUNNER, "utf8");
    const mathRunner = await readFile(MATH_RUNNER, "utf8");
    const glmRunnerFiles = (await readdir(GLM_RUNNER_DIR))
      .filter((name) => name.endsWith(".sh"))
      .sort();

    expect(glmRunner).toContain('RUN_HELPER="$REPO_ROOT/sandbox/_lib/run-obora-with-watchdog.sh"');
    expect(glmRunner).toContain('OBORA_TIMEOUT_MS="${OBORA_TIMEOUT_MS:-86400000}"');
    expect(glmRunner).toContain('OBORA_IDLE_TIMEOUT_SEC="${OBORA_IDLE_TIMEOUT_SEC:-900}"');
    expect(glmRunner).toContain('OBORA_SAFETY_TIMEOUT_SEC="${OBORA_SAFETY_TIMEOUT_SEC:-43200}"');

    expect(mathRunner).toContain('RUN_HELPER="$REPO_ROOT/sandbox/_lib/run-obora-with-watchdog.sh"');
    expect(mathRunner).toContain('OBORA_TIMEOUT_MS="${OBORA_TIMEOUT_MS:-86400000}"');
    expect(mathRunner).toContain('OBORA_IDLE_TIMEOUT_SEC="${OBORA_IDLE_TIMEOUT_SEC:-900}"');
    expect(mathRunner).toContain('OBORA_SAFETY_TIMEOUT_SEC="${OBORA_SAFETY_TIMEOUT_SEC:-43200}"');
    expect(mathRunner).toContain('--output-dir "$RESULT_DIR"');

    for (const file of glmRunnerFiles) {
      const text = await readFile(join(GLM_RUNNER_DIR, file), "utf8");
      expect(text, file).toContain('RUN_HELPER="$REPO_ROOT/sandbox/_lib/run-obora-with-watchdog.sh"');
      expect(text, file).toContain('OBORA_IDLE_TIMEOUT_SEC="${OBORA_IDLE_TIMEOUT_SEC:-900}"');
      expect(text, file).toContain('OBORA_SAFETY_TIMEOUT_SEC="${OBORA_SAFETY_TIMEOUT_SEC:-43200}"');
      expect(text, file).not.toContain('$REPO_ROOT/output/');
    }
  });
});
