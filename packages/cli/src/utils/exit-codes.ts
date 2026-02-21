import { OboraErrorCode } from "@obora/sdk";

export const ExitCode = {
  SUCCESS: 0,
  VALIDATION_ERROR: 2,
  EXECUTION_FAILED: 3,
  GATE_TIMEOUT: 4,
  CLI_ERROR: 10,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

/**
 * Maps OboraError codes to CLI exit codes per design §4.4.
 */
export function mapErrorToExitCode(code: string): ExitCodeValue {
  // Gate timeout / abort → 4 (must be checked before POLICY_* prefix mapping)
  if (code === OboraErrorCode.POLICY_GATE_TIMEOUT || code === OboraErrorCode.CELL_ABORTED) {
    return ExitCode.GATE_TIMEOUT;
  }

  // Validation/policy errors → 2
  if (code.startsWith("POLICY_") || code.startsWith("SDK_8004") || code.startsWith("SDK_8005")) {
    return ExitCode.VALIDATION_ERROR;
  }

  // Execution failures → 3
  if (
    code.startsWith("CELL_") ||
    code.startsWith("CONSENSUS_") ||
    code.startsWith("RECOVERY_") ||
    code.startsWith("ORCH_") ||
    code.startsWith("AUDIT_") ||
    code.startsWith("ADAPTER_")
  ) {
    return ExitCode.EXECUTION_FAILED;
  }

  // Default CLI error
  return ExitCode.CLI_ERROR;
}
