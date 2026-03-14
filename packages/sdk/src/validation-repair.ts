export interface ValidationFailureCheck {
  name: string;
  message: string;
  severity?: "error" | "warning";
  file?: string;
}

export interface ValidationResult {
  passed: boolean;
  summary: string;
  errorCode?: string;
  failedChecks: ValidationFailureCheck[];
  logPath?: string;
  artifactPaths?: string[];
  suggestedTargets?: string[];
  signature?: string;
}

export interface RepairContext {
  mode: "initial_build" | "repair";
  attempt: number;
  latestValidation?: ValidationResult;
  previousValidationResults?: ValidationResult[];
  validationStep?: string;
  repeatedSignatureCount?: number;
  maxNoProgressIterations?: number;
  repeatedCriticalIssueCeiling?: number;
}

export interface ValidationStepConfig {
  enabled?: boolean;
  emit_structured_result?: boolean;
}

export interface RepairLoopConfig {
  enabled?: boolean;
  validation_step?: string;
  max_no_progress_iterations?: number;
  repeated_critical_issue_ceiling?: number;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeFailureChecks(raw: unknown): ValidationFailureCheck[] {
  if (!Array.isArray(raw)) return [];

  const checks: ValidationFailureCheck[] = [];

  for (const entry of raw) {
    const item = asRecord(entry);
    if (!item) continue;

    const name = typeof item.name === "string"
      ? item.name
      : typeof item.code === "string"
        ? item.code
        : typeof item.level === "string"
          ? item.level
          : undefined;
    const message = typeof item.message === "string"
      ? item.message
      : typeof item.reason === "string"
        ? item.reason
        : undefined;

    if (!name || !message) continue;

    const severity = item.severity === "warning" || item.severity === "error"
      ? item.severity
      : item.level === "warning" || item.level === "error"
        ? item.level
        : undefined;
    const file = typeof item.file === "string" ? item.file : undefined;

    checks.push({
      name,
      message,
      ...(severity ? { severity } : {}),
      ...(file ? { file } : {}),
    });
  }

  return checks;
}

export function buildValidationSignature(result: {
  passed: boolean;
  errorCode?: string;
  summary?: string;
  failedChecks?: ValidationFailureCheck[];
}): string {
  if (result.passed) return "pass";

  const checks = (result.failedChecks ?? []).map((check) =>
    [check.severity ?? "error", check.name, check.file ?? "", check.message].join(":"),
  );

  return JSON.stringify({
    errorCode: result.errorCode ?? null,
    summary: result.summary ?? "",
    failedChecks: checks,
  });
}

export function normalizeValidationResult(value: unknown): ValidationResult | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const passed = typeof record.passed === "boolean"
    ? record.passed
    : record.status === "pass"
      ? true
      : record.status === "fail"
        ? false
        : undefined;

  if (passed === undefined) return undefined;

  const failedChecks = normalizeFailureChecks(record.failedChecks ?? record.issues);
  const summary = typeof record.summary === "string"
    ? record.summary
    : passed
      ? "Validation passed"
      : failedChecks.length > 0
        ? failedChecks.map((check) => `${check.name}: ${check.message}`).join("; ")
        : "Validation failed";

  const errorCode = typeof record.errorCode === "string" ? record.errorCode : undefined;
  const logPath = typeof record.logPath === "string" ? record.logPath : undefined;
  const artifactPaths = Array.isArray(record.artifactPaths)
    ? record.artifactPaths.filter((entry): entry is string => typeof entry === "string")
    : undefined;
  const suggestedTargets = Array.isArray(record.suggestedTargets)
    ? record.suggestedTargets.filter((entry): entry is string => typeof entry === "string")
    : undefined;
  const signature = typeof record.signature === "string"
    ? record.signature
    : buildValidationSignature({ passed, errorCode, summary, failedChecks });

  return {
    passed,
    summary,
    errorCode,
    failedChecks,
    logPath,
    artifactPaths,
    suggestedTargets,
    signature,
  };
}

export function getValidationStepConfig(config: unknown): ValidationStepConfig | undefined {
  const root = asRecord(config);
  const validation = asRecord(root?.validation);
  if (!validation) return undefined;

  return {
    enabled: typeof validation.enabled === "boolean" ? validation.enabled : true,
    emit_structured_result:
      typeof validation.emit_structured_result === "boolean"
        ? validation.emit_structured_result
        : false,
  };
}

export function getRepairLoopConfig(config: unknown): RepairLoopConfig | undefined {
  const root = asRecord(config);
  const repairLoop = asRecord(root?.repair_loop);
  if (!repairLoop) return undefined;

  return {
    enabled: typeof repairLoop.enabled === "boolean" ? repairLoop.enabled : true,
    validation_step:
      typeof repairLoop.validation_step === "string" ? repairLoop.validation_step : undefined,
    max_no_progress_iterations:
      typeof repairLoop.max_no_progress_iterations === "number" && Number.isFinite(repairLoop.max_no_progress_iterations)
        ? Math.max(1, Math.floor(repairLoop.max_no_progress_iterations))
        : undefined,
    repeated_critical_issue_ceiling:
      typeof repairLoop.repeated_critical_issue_ceiling === "number" && Number.isFinite(repairLoop.repeated_critical_issue_ceiling)
        ? Math.max(1, Math.floor(repairLoop.repeated_critical_issue_ceiling))
        : undefined,
  };
}
