import { describe, expect, it } from "vitest";

import { Workflow } from "../workflow.js";

describe("one-file schema validation", () => {
  it("rejects research-loop without problem.statement", () => {
    expect(() =>
      Workflow.create({
        name: "bad-research",
        mode: "research-loop",
        problem: { goal: "Produce a bounded research conclusion." },
      }),
    ).toThrow(/problem\.statement/);
  });

  it("rejects validation-repair with malformed override", () => {
    expect(() =>
      Workflow.create({
        name: "bad-validation",
        mode: "validation-repair",
        overrides: {
          build_or_repair: "not-an-object",
        },
      }),
    ).toThrow(/override build_or_repair must be an object/i);
  });

  it("rejects proof-loop without problem.statement", () => {
    expect(() =>
      Workflow.create({
        name: "bad-proof",
        mode: "proof-loop",
        problem: { goal: "Produce a bounded proof-search conclusion." },
      }),
    ).toThrow(/problem\.statement/);
  });

  it("rejects unknown top-level key for research-loop", () => {
    expect(() =>
      Workflow.create({
        name: "bad-research-extra",
        mode: "research-loop",
        problem: { statement: "Investigate X" },
        nonsense: true,
      }),
    ).toThrow(/does not allow key \"nonsense\".*Allowed keys:/i);
  });

  it("rejects unknown override key for validation-repair", () => {
    expect(() =>
      Workflow.create({
        name: "bad-validation-extra-override",
        mode: "validation-repair",
        overrides: {
          unknown_step: { prompt_suffix: "nope" },
        },
      }),
    ).toThrow(/does not allow key \"overrides\.unknown_step\".*Allowed keys:/i);
  });

  it("rejects wrong nested type for validation-repair loop", () => {
    expect(() =>
      Workflow.create({
        name: "bad-validation-loop-type",
        mode: "validation-repair",
        loop: { max_iterations: "three" },
      }),
    ).toThrow(/expects a number at loop\.max_iterations/i);
  });

  it("rejects unknown nested prompt key for proof-loop", () => {
    expect(() =>
      Workflow.create({
        name: "bad-proof-prompt-key",
        mode: "proof-loop",
        problem: { statement: "Prove X" },
        prompts: { extra: "not allowed" },
      }),
    ).toThrow(/does not allow key \"prompts\.extra\".*Allowed keys:/i);
  });

  it("suggests nearest key for research-loop agent typo", () => {
    expect(() =>
      Workflow.create({
        name: "bad-research-typo",
        mode: "research-loop",
        problem: { statement: "Investigate X" },
        agents: { reviewrs: "reviewer" },
      }),
    ).toThrow(/Did you mean \"agents\.reviewer\"\?/i);
  });

  it("suggests nearest key for validation-repair prompt typo", () => {
    expect(() =>
      Workflow.create({
        name: "bad-validation-typo",
        mode: "validation-repair",
        prompts: { valdate: "Validate it" },
      }),
    ).toThrow(/Did you mean \"prompts\.validate\"\?/i);
  });
});
