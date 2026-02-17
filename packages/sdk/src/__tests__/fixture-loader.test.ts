import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { OboraErrorCode } from "../runtime.js";
import { fixtureToTestCase, loadFixture, loadFixtures, validateFixture } from "../testing/fixture-loader.js";

describe("fixture-loader", () => {
  it("validateFixture accepts valid fixture", () => {
    const fixture = validateFixture({
      name: "peer-review-pass",
      workflow: "./workflows/doc-review.yaml",
      input: { topic: "M3 설계" },
      expect: {
        status: "completed",
        events: [{ type: "consensus_result", contains: { "payload.status": "pass" } }],
      },
      mocks: {
        agents: [{ name: "reviewer", responses: { draft: { ok: true } } }],
      },
    });

    expect(fixture.name).toBe("peer-review-pass");
    expect(fixture.expect.status).toBe("completed");
  });

  it("validateFixture rejects missing name", () => {
    expect(() =>
      validateFixture({
        workflow: "./wf.yaml",
        expect: { status: "completed" },
      }),
    ).toThrowError(expect.objectContaining({ code: OboraErrorCode.SDK_FIXTURE_INVALID }));
  });

  it("validateFixture rejects missing expect.status", () => {
    expect(() =>
      validateFixture({
        name: "missing-status",
        workflow: "./wf.yaml",
        expect: {},
      }),
    ).toThrowError(expect.objectContaining({ code: OboraErrorCode.SDK_FIXTURE_INVALID }));
  });

  it("validateFixture rejects invalid status value", () => {
    expect(() =>
      validateFixture({
        name: "bad-status",
        workflow: "./wf.yaml",
        expect: { status: "done" },
      }),
    ).toThrowError(expect.objectContaining({ code: OboraErrorCode.SDK_FIXTURE_INVALID }));
  });

  it("loadFixture reads and parses YAML fixture", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-fixture-"));
    const path = join(dir, "single.yaml");

    await writeFile(
      path,
      `name: load-single\nworkflow: ./wf.yaml\nexpect:\n  status: completed\n`,
      "utf-8",
    );

    const fixture = await loadFixture(path);
    expect(fixture.name).toBe("load-single");
    expect(fixture.expect.status).toBe("completed");
  });

  it("loadFixtures reads YAML fixtures from directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-fixtures-"));

    await writeFile(
      join(dir, "a.yaml"),
      `name: fixture-a\nworkflow: ./wf-a.yaml\nexpect:\n  status: completed\n`,
      "utf-8",
    );

    await writeFile(
      join(dir, "b.yml"),
      `name: fixture-b\nworkflow: ./wf-b.yaml\nexpect:\n  status: failed\n`,
      "utf-8",
    );

    await writeFile(join(dir, "ignore.txt"), "hello", "utf-8");

    const fixtures = await loadFixtures(dir);
    expect(fixtures).toHaveLength(2);
    expect(fixtures.map((f) => f.name)).toEqual(["fixture-a", "fixture-b"]);
  });

  it("fixtureToTestCase converts mock specs to MockAgent/MockTool", async () => {
    const testCase = fixtureToTestCase({
      name: "convert",
      workflow: "./wf.yaml",
      expect: { status: "completed" },
      mocks: {
        agents: [{ name: "writer", responses: { draft: { text: "hello" } } }],
        tools: [{ name: "formatter", responses: { format: { ok: true } } }],
      },
    });

    expect(testCase.name).toBe("convert");
    expect(testCase.mocks?.agents).toHaveLength(1);
    expect(testCase.mocks?.tools).toHaveLength(1);

    const agentResult = await testCase.mocks?.agents?.[0]?.execute({
      executionId: "exec-1",
      stepName: "draft",
      input: {},
      variables: {},
    });
    expect(agentResult?.output).toEqual({ text: "hello" });

    const toolResult = await testCase.mocks?.tools?.[0]?.execute({}, { executionId: "exec-1", stepName: "format" });
    expect(toolResult).toEqual({ ok: true });
  });
});
