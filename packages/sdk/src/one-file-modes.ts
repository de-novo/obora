import { OboraError, OboraErrorCode } from "./runtime-errors.js";

export type OneFileMode = "validation-repair" | "research-loop" | "proof-loop" | "judge";

export interface ValidationRepairStopSemantics {
  mode: "validation-repair";
  outcomes: Array<"continue" | "success" | "exhausted" | "no_progress" | "repeated_critical_issue" | "aborted">;
  thresholds: {
    max_iterations: number;
    no_progress_ceiling: number | undefined;
    repeated_critical_issue_ceiling: number | undefined;
  };
  output: {
    root: string | undefined;
  };
  archive: {
    enabled: boolean;
  };
  notes: string[];
}

export interface ResearchLoopStopSemantics {
  mode: "research-loop";
  outcomes: Array<"continue" | "success" | "bounded_stop" | "exhausted" | "aborted">;
  thresholds: {
    max_iterations: number;
  };
  output: {
    root: string | undefined;
  };
  archive: {
    enabled: boolean;
  };
  notes: string[];
}

export interface ProofLoopStopSemantics {
  mode: "proof-loop";
  outcomes: Array<"continue" | "success" | "bounded_stop" | "refuted" | "exhausted" | "aborted">;
  thresholds: {
    max_iterations: number;
  };
  output: {
    root: string | undefined;
  };
  archive: {
    enabled: boolean;
  };
  notes: string[];
}

export interface JudgeStopSemantics {
  mode: "judge";
  outcomes: Array<"success" | "schema_failed" | "binding_failed" | "provider_failed" | "aborted">;
  input: {
    json: string | undefined;
    schema: string | undefined;
  };
  output: {
    path: string | undefined;
    schema: string | undefined;
  };
  options: {
    repair: boolean;
    fallback: boolean;
  };
  notes: string[];
}

export type OneFileStopSemanticsByMode = {
  "validation-repair": ValidationRepairStopSemantics;
  "research-loop": ResearchLoopStopSemantics;
  "proof-loop": ProofLoopStopSemantics;
  judge: JudgeStopSemantics;
};

export type OneFileStopSemantics = OneFileStopSemanticsByMode[OneFileMode];

export interface OneFileModeExpander<TMode extends OneFileMode = OneFileMode> {
  mode: TMode;
  validate(input: Record<string, unknown>): void;
  expand(input: Record<string, unknown>): Record<string, unknown>;
  getStopSemantics(input: Record<string, unknown>): OneFileStopSemanticsByMode[TMode];
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw OboraError.invalidWorkflow(`One-file workflow requires a non-empty string at ${path}`);
  }
  return value;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i]![0] = i;
  for (let j = 0; j <= n; j += 1) dp[0]![j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m]![n]!;
}

function suggestKey(key: string, allowed: string[]): string | undefined {
  let best: { key: string; distance: number } | undefined;
  for (const candidate of allowed) {
    const distance = levenshtein(key, candidate);
    if (!best || distance < best.distance) {
      best = { key: candidate, distance };
    }
  }
  if (!best) return undefined;
  return best.distance <= 3 ? best.key : undefined;
}

function assertAllowedKeys(obj: Record<string, unknown>, allowed: string[], scope: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      const suggestion = suggestKey(key, allowed);
      throw OboraError.invalidWorkflow(
        `One-file workflow does not allow key "${scope}${key}". Allowed keys: ${allowed.join(", ")}${suggestion ? `. Did you mean "${scope}${suggestion}"?` : ""}`,
      );
    }
  }
}

function requireOptionalString(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== "string") {
    throw OboraError.invalidWorkflow(`One-file workflow expects a string at ${path}`);
  }
}

function requireOptionalBoolean(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== "boolean") {
    throw OboraError.invalidWorkflow(`One-file workflow expects a boolean at ${path}`);
  }
}

function requireOptionalNumber(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== "number") {
    throw OboraError.invalidWorkflow(`One-file workflow expects a number at ${path}`);
  }
}

const validationRepairExpander: OneFileModeExpander<"validation-repair"> = {
  mode: "validation-repair",
  validate(input) {
    assertAllowedKeys(input, ["name", "version", "mode", "agents", "prompts", "loop", "archive", "output", "overrides"], "");
    requireString(input.name, "name");

    const agents = asObject(input.agents);
    assertAllowedKeys(agents, ["repair", "validator"], "agents.");
    requireOptionalString(agents.repair, "agents.repair");
    requireOptionalString(agents.validator, "agents.validator");

    const prompts = asObject(input.prompts);
    assertAllowedKeys(prompts, ["repair", "validate"], "prompts.");
    requireOptionalString(prompts.repair, "prompts.repair");
    requireOptionalString(prompts.validate, "prompts.validate");

    const loop = asObject(input.loop);
    assertAllowedKeys(loop, ["max_iterations", "no_progress_ceiling", "repeated_critical_issue_ceiling"], "loop.");
    requireOptionalNumber(loop.max_iterations, "loop.max_iterations");
    requireOptionalNumber(loop.no_progress_ceiling, "loop.no_progress_ceiling");
    requireOptionalNumber(loop.repeated_critical_issue_ceiling, "loop.repeated_critical_issue_ceiling");

    const archive = asObject(input.archive);
    assertAllowedKeys(archive, ["enabled"], "archive.");
    requireOptionalBoolean(archive.enabled, "archive.enabled");

    const output = asObject(input.output);
    assertAllowedKeys(output, ["root"], "output.");
    requireOptionalString(output.root, "output.root");

    const overrides = asObject(input.overrides);
    assertAllowedKeys(overrides, ["build_or_repair", "validate"], "overrides.");
    const buildOverride = overrides.build_or_repair;
    const validateOverride = overrides.validate;
    if (buildOverride !== undefined && typeof buildOverride !== "object") {
      throw OboraError.invalidWorkflow("One-file validation-repair override build_or_repair must be an object");
    }
    if (validateOverride !== undefined && typeof validateOverride !== "object") {
      throw OboraError.invalidWorkflow("One-file validation-repair override validate must be an object");
    }
    const buildOverrideObj = asObject(buildOverride);
    const validateOverrideObj = asObject(validateOverride);
    assertAllowedKeys(buildOverrideObj, ["prompt_suffix"], "overrides.build_or_repair.");
    assertAllowedKeys(validateOverrideObj, ["prompt_suffix"], "overrides.validate.");
    requireOptionalString(buildOverrideObj.prompt_suffix, "overrides.build_or_repair.prompt_suffix");
    requireOptionalString(validateOverrideObj.prompt_suffix, "overrides.validate.prompt_suffix");
  },
  expand(input) {
    const agents = asObject(input.agents);
    const prompts = asObject(input.prompts);
    const loop = asObject(input.loop);
    const archive = asObject(input.archive);
    const output = asObject(input.output);
    const overrides = asObject(input.overrides);
    const buildOverride = asObject(overrides.build_or_repair);
    const validateOverride = asObject(overrides.validate);

    const repairAgent = typeof agents.repair === "string" ? agents.repair : "builder";
    const validatorAgent = typeof agents.validator === "string" ? agents.validator : "validator";
    const repairPromptBase = typeof prompts.repair === "string" ? prompts.repair : "Build or repair the target artifact.";
    const validatePromptBase =
      typeof prompts.validate === "string"
        ? prompts.validate
        : "Validate the artifact and return a structured ValidationResult JSON payload.";
    const repairPrompt = [repairPromptBase, typeof buildOverride.prompt_suffix === "string" ? buildOverride.prompt_suffix : undefined]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .join("\n\n");
    const validatePrompt = [validatePromptBase, typeof validateOverride.prompt_suffix === "string" ? validateOverride.prompt_suffix : undefined]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .join("\n\n");

    return {
      name: String(input.name),
      version: typeof input.version === "string" ? input.version : undefined,
      variables: {
        ...(typeof output.root === "string" ? { output_root: output.root } : {}),
        archive_enabled: archive.enabled === true,
      },
      steps: [
        {
          name: "build_or_repair",
          agent: repairAgent,
          config: {
            repair_loop: {
              enabled: true,
              validation_step: "validate",
              ...(typeof loop.no_progress_ceiling === "number"
                ? { max_no_progress_iterations: loop.no_progress_ceiling }
                : {}),
              ...(typeof loop.repeated_critical_issue_ceiling === "number"
                ? { repeated_critical_issue_ceiling: loop.repeated_critical_issue_ceiling }
                : {}),
            },
          },
          input: { task: repairPrompt },
        },
        {
          name: "validate",
          agent: validatorAgent,
          depends_on: ["build_or_repair"],
          config: {
            validation: {
              enabled: true,
              emit_structured_result: true,
            },
          },
          on_fail: {
            goto: "build_or_repair",
            max_iterations: Math.max(1, Math.floor(typeof loop.max_iterations === "number" ? loop.max_iterations : 3)),
          },
          input: { task: validatePrompt },
        },
      ],
    };
  },
  getStopSemantics(input) {
    const loop = asObject(input.loop);
    const output = asObject(input.output);
    const archive = asObject(input.archive);
    return {
      mode: "validation-repair",
      outcomes: ["continue", "success", "exhausted", "no_progress", "repeated_critical_issue", "aborted"],
      thresholds: {
        max_iterations: typeof loop.max_iterations === "number" ? loop.max_iterations : 3,
        no_progress_ceiling: typeof loop.no_progress_ceiling === "number" ? loop.no_progress_ceiling : undefined,
        repeated_critical_issue_ceiling:
          typeof loop.repeated_critical_issue_ceiling === "number" ? loop.repeated_critical_issue_ceiling : undefined,
      },
      output: { root: typeof output.root === "string" ? output.root : undefined },
      archive: { enabled: archive.enabled === true },
      notes: [
        "validator fail routes back to build_or_repair via on_fail.goto",
        "structured validation result is required for repair-loop semantics",
        "stop category is persisted in repair-loop summary when available",
        "step-level prompt_suffix overrides may be applied to build_or_repair and validate",
        "output.root is surfaced as workflow variable output_root",
        "archive.enabled is surfaced as workflow variable archive_enabled",
      ],
    };
  },
};

const researchLoopExpander: OneFileModeExpander<"research-loop"> = {
  mode: "research-loop",
  validate(input) {
    assertAllowedKeys(input, ["name", "version", "mode", "problem", "agents", "prompts", "loop", "archive", "output"], "");
    requireString(input.name, "name");
    const problem = asObject(input.problem);
    assertAllowedKeys(problem, ["statement", "goal"], "problem.");
    requireString(problem.statement, "problem.statement");
    requireOptionalString(problem.goal, "problem.goal");

    const agents = asObject(input.agents);
    assertAllowedKeys(agents, ["researcher", "reviewer"], "agents.");
    requireOptionalString(agents.researcher, "agents.researcher");
    requireOptionalString(agents.reviewer, "agents.reviewer");

    const prompts = asObject(input.prompts);
    assertAllowedKeys(prompts, ["frame", "research", "review"], "prompts.");
    requireOptionalString(prompts.frame, "prompts.frame");
    requireOptionalString(prompts.research, "prompts.research");
    requireOptionalString(prompts.review, "prompts.review");

    const loop = asObject(input.loop);
    assertAllowedKeys(loop, ["max_iterations"], "loop.");
    requireOptionalNumber(loop.max_iterations, "loop.max_iterations");

    const archive = asObject(input.archive);
    assertAllowedKeys(archive, ["enabled"], "archive.");
    requireOptionalBoolean(archive.enabled, "archive.enabled");

    const output = asObject(input.output);
    assertAllowedKeys(output, ["root"], "output.");
    requireOptionalString(output.root, "output.root");
  },
  expand(input) {
    const problem = asObject(input.problem);
    const agents = asObject(input.agents);
    const prompts = asObject(input.prompts);
    const archive = asObject(input.archive);
    const output = asObject(input.output);
    const problemStatement = typeof problem.statement === "string" ? problem.statement : "Research the given problem.";
    const problemGoal = typeof problem.goal === "string" ? problem.goal : "Produce a bounded research conclusion.";
    const researcherAgent = typeof agents.researcher === "string" ? agents.researcher : "researcher";
    const reviewerAgent = typeof agents.reviewer === "string" ? agents.reviewer : "reviewer";
    const framePrompt = typeof prompts.frame === "string" ? prompts.frame : `Frame the research problem clearly.\n\nProblem:\n${problemStatement}\n\nGoal:\n${problemGoal}`;
    const researchPrompt = typeof prompts.research === "string" ? prompts.research : "Produce structured research notes, findings, and a synthesis.";
    const reviewPrompt = typeof prompts.review === "string" ? prompts.review : "Review the research output, identify gaps, and produce a final bounded conclusion.";

    return {
      name: String(input.name),
      version: typeof input.version === "string" ? input.version : undefined,
      variables: {
        ...(typeof output.root === "string" ? { output_root: output.root } : {}),
        archive_enabled: archive.enabled === true,
        research_goal: problemGoal,
      },
      steps: [
        { name: "problem_frame", agent: researcherAgent, input: { task: framePrompt } },
        { name: "research", agent: researcherAgent, depends_on: ["problem_frame"], input: { task: researchPrompt } },
        { name: "review", agent: reviewerAgent, depends_on: ["research"], input: { task: reviewPrompt } },
      ],
    };
  },
  getStopSemantics(input) {
    const loop = asObject(input.loop);
    const output = asObject(input.output);
    const archive = asObject(input.archive);
    return {
      mode: "research-loop",
      outcomes: ["continue", "success", "bounded_stop", "exhausted", "aborted"],
      thresholds: {
        max_iterations: typeof loop.max_iterations === "number" ? loop.max_iterations : 3,
      },
      output: { root: typeof output.root === "string" ? output.root : undefined },
      archive: { enabled: archive.enabled === true },
      notes: [
        "research-loop expands to frame → research → review stages",
        "final archive behavior is not fully wired yet; archive intent is exposed as metadata",
      ],
    };
  },
};

const proofLoopExpander: OneFileModeExpander<"proof-loop"> = {
  mode: "proof-loop",
  validate(input) {
    assertAllowedKeys(input, ["name", "version", "mode", "problem", "agents", "prompts", "loop", "archive", "output"], "");
    requireString(input.name, "name");
    const problem = asObject(input.problem);
    assertAllowedKeys(problem, ["statement", "domain", "goal"], "problem.");
    requireString(problem.statement, "problem.statement");
    requireOptionalString(problem.domain, "problem.domain");
    requireOptionalString(problem.goal, "problem.goal");

    const agents = asObject(input.agents);
    assertAllowedKeys(agents, ["framer", "prover", "reviewer"], "agents.");
    requireOptionalString(agents.framer, "agents.framer");
    requireOptionalString(agents.prover, "agents.prover");
    requireOptionalString(agents.reviewer, "agents.reviewer");

    const prompts = asObject(input.prompts);
    assertAllowedKeys(prompts, ["frame", "audit", "proof", "review"], "prompts.");
    requireOptionalString(prompts.frame, "prompts.frame");
    requireOptionalString(prompts.audit, "prompts.audit");
    requireOptionalString(prompts.proof, "prompts.proof");
    requireOptionalString(prompts.review, "prompts.review");

    const loop = asObject(input.loop);
    assertAllowedKeys(loop, ["max_iterations"], "loop.");
    requireOptionalNumber(loop.max_iterations, "loop.max_iterations");

    const archive = asObject(input.archive);
    assertAllowedKeys(archive, ["enabled"], "archive.");
    requireOptionalBoolean(archive.enabled, "archive.enabled");

    const output = asObject(input.output);
    assertAllowedKeys(output, ["root"], "output.");
    requireOptionalString(output.root, "output.root");
  },
  expand(input) {
    const problem = asObject(input.problem);
    const agents = asObject(input.agents);
    const prompts = asObject(input.prompts);
    const archive = asObject(input.archive);
    const output = asObject(input.output);
    const statement = typeof problem.statement === "string" ? problem.statement : "Prove the given statement.";
    const domain = typeof problem.domain === "string" ? problem.domain : "unspecified domain";
    const goal = typeof problem.goal === "string" ? problem.goal : "Produce a bounded proof-search conclusion.";
    const framerAgent = typeof agents.framer === "string" ? agents.framer : "framer";
    const proverAgent = typeof agents.prover === "string" ? agents.prover : "prover";
    const reviewerAgent = typeof agents.reviewer === "string" ? agents.reviewer : "reviewer";
    const framePrompt = typeof prompts.frame === "string" ? prompts.frame : `Frame the proof problem clearly.\n\nStatement:\n${statement}\n\nDomain:\n${domain}\n\nGoal:\n${goal}`;
    const auditPrompt = typeof prompts.audit === "string" ? prompts.audit : "Audit known facts, assumptions, and likely difficulty points.";
    const proofPrompt = typeof prompts.proof === "string" ? prompts.proof : "Produce lemma candidates and a structured proof attempt with explicit gaps.";
    const reviewPrompt = typeof prompts.review === "string" ? prompts.review : "Review the proof attempt, identify gaps or refutations, and produce a bounded final classification.";

    return {
      name: String(input.name),
      version: typeof input.version === "string" ? input.version : undefined,
      variables: {
        ...(typeof output.root === "string" ? { output_root: output.root } : {}),
        archive_enabled: archive.enabled === true,
        proof_goal: goal,
      },
      steps: [
        { name: "problem_frame", agent: framerAgent, input: { task: framePrompt } },
        { name: "known_results_audit", agent: framerAgent, depends_on: ["problem_frame"], input: { task: auditPrompt } },
        { name: "proof_attempt", agent: proverAgent, depends_on: ["known_results_audit"], input: { task: proofPrompt } },
        { name: "review", agent: reviewerAgent, depends_on: ["proof_attempt"], input: { task: reviewPrompt } },
      ],
    };
  },
  getStopSemantics(input) {
    const loop = asObject(input.loop);
    const output = asObject(input.output);
    const archive = asObject(input.archive);
    return {
      mode: "proof-loop",
      outcomes: ["continue", "success", "bounded_stop", "refuted", "exhausted", "aborted"],
      thresholds: {
        max_iterations: typeof loop.max_iterations === "number" ? loop.max_iterations : 3,
      },
      output: { root: typeof output.root === "string" ? output.root : undefined },
      archive: { enabled: archive.enabled === true },
      notes: [
        "proof-loop expands to framing, audit, proof attempt, and review stages",
        "proof-loop success should not imply formal proof unless externally verified",
      ],
    };
  },
};


const judgeModeExpander: OneFileModeExpander<"judge"> = {
  mode: "judge",
  validate(input) {
    assertAllowedKeys(input, ["name", "version", "mode", "provider", "model", "agent", "prompt", "input", "output", "options"], "");
    requireString(input.name, "name");
    requireString(input.provider, "provider");
    requireString(input.model, "model");
    requireString(input.prompt, "prompt");

    const inputObj = asObject(input.input);
    assertAllowedKeys(inputObj, ["json", "schema"], "input.");
    requireString(inputObj.json, "input.json");
    requireOptionalString(inputObj.schema, "input.schema");

    const outputObj = asObject(input.output);
    assertAllowedKeys(outputObj, ["path", "schema"], "output.");
    requireString(outputObj.path, "output.path");
    requireOptionalString(outputObj.schema, "output.schema");

    const options = asObject(input.options);
    assertAllowedKeys(options, ["repair", "fallback", "temperature", "maxTokens"], "options.");
    requireOptionalBoolean(options.repair, "options.repair");
    requireOptionalBoolean(options.fallback, "options.fallback");
    requireOptionalNumber(options.temperature, "options.temperature");
    requireOptionalNumber(options.maxTokens, "options.maxTokens");
    requireOptionalString(input.agent, "agent");
  },
  expand(input) {
    const inputObj = asObject(input.input);
    const outputObj = asObject(input.output);
    const options = asObject(input.options);
    const prompt = requireString(input.prompt, "prompt");
    const provider = requireString(input.provider, "provider");
    const model = requireString(input.model, "model");
    const agent = typeof input.agent === "string" ? input.agent : "judge";
    return {
      name: String(input.name),
      version: typeof input.version === "string" ? input.version : undefined,
      variables: {
        judge_input_json: String(inputObj.json),
        ...(typeof inputObj.schema === "string" ? { judge_input_schema: inputObj.schema } : {}),
        judge_output_path: String(outputObj.path),
        ...(typeof outputObj.schema === "string" ? { judge_output_schema: outputObj.schema } : {}),
        judge_mode: true,
      },
      steps: [
        {
          name: "judge",
          agent,
          input: { task: prompt },
          config: {
            judge: {
              enabled: true,
              provider,
              model,
              input_json: String(inputObj.json),
              input_schema: typeof inputObj.schema === "string" ? inputObj.schema : undefined,
              output_path: String(outputObj.path),
              output_schema: typeof outputObj.schema === "string" ? outputObj.schema : undefined,
              repair: options.repair === true,
              fallback: options.fallback === true,
              temperature: typeof options.temperature === "number" ? options.temperature : undefined,
              maxTokens: typeof options.maxTokens === "number" ? options.maxTokens : undefined,
            },
          },
        },
      ],
    };
  },
  getStopSemantics(input) {
    const inputObj = asObject(input.input);
    const outputObj = asObject(input.output);
    const options = asObject(input.options);
    return {
      mode: "judge",
      outcomes: ["success", "schema_failed", "binding_failed", "provider_failed", "aborted"],
      input: {
        json: typeof inputObj.json === "string" ? inputObj.json : undefined,
        schema: typeof inputObj.schema === "string" ? inputObj.schema : undefined,
      },
      output: {
        path: typeof outputObj.path === "string" ? outputObj.path : undefined,
        schema: typeof outputObj.schema === "string" ? outputObj.schema : undefined,
      },
      options: {
        repair: options.repair === true,
        fallback: options.fallback === true,
      },
      notes: [
        "judge mode expands to a single-step workflow",
        "provider/model are carried in step config.judge",
        "input/output paths are surfaced as workflow variables",
      ],
    };
  },
};

const EXPANDERS: { [K in OneFileMode]: OneFileModeExpander<K> } = {
  "validation-repair": validationRepairExpander,
  "research-loop": researchLoopExpander,
  "proof-loop": proofLoopExpander,
  "judge": judgeModeExpander,
};

export function expandOneFileWorkflow(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== "object") return undefined;
  const def = input as Record<string, unknown>;
  const mode = def.mode;
  if (mode !== "validation-repair" && mode !== "research-loop" && mode !== "proof-loop" && mode !== "judge") return undefined;
  EXPANDERS[mode].validate(def);
  return EXPANDERS[mode].expand(def);
}

export function getOneFileStopSemantics(input: unknown): OneFileStopSemantics | undefined {
  if (!input || typeof input !== "object") return undefined;
  const def = input as Record<string, unknown>;
  const mode = def.mode;
  if (mode !== "validation-repair" && mode !== "research-loop" && mode !== "proof-loop" && mode !== "judge") return undefined;
  return EXPANDERS[mode].getStopSemantics(def);
}
