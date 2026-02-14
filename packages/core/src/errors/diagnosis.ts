/**
 * Actionable diagnosis templates for high-frequency errors
 * Each template follows: Hypothesis → Evidence → Command → Rollback
 * @module @obora/core/errors/diagnosis
 */

export interface DiagnosisTemplate {
  /** Error code */
  code: string;
  /** One-line summary */
  title: string;
  /** Probable cause hypothesis */
  hypothesis: string;
  /** How to confirm the hypothesis */
  evidence: string;
  /** Command(s) to fix */
  commands: string[];
  /** How to undo if the fix makes things worse */
  rollback: string;
}

const templates: Record<string, DiagnosisTemplate> = {
  E4001: {
    code: "E4001",
    title: "Agent execution failed",
    hypothesis:
      "BaseAgent.execute() returned { success: false }. The agent encountered a business-logic failure (bad prompt, invalid input, etc.).",
    evidence: "Review step output and agent logs for the failure reason.",
    commands: [
      "obora run --from-step <failed-step> -f <feature>  # Re-run from failed step",
      "# Check agent configuration and step inputs",
    ],
    rollback: "No side effects — agent failure is contained within the step.",
  },
  E4002: {
    code: "E4002",
    title: "Step execution timeout",
    hypothesis:
      "The step exceeded its configured timeout. The agent.execute() call was aborted via AbortSignal.",
    evidence: "Check step timeout configuration and agent response time.",
    commands: [
      "# Increase timeout in workflow YAML: timeout: '5m'",
      "obora run --from-step <failed-step> -f <feature>  # Re-run",
    ],
    rollback: "No side effects — timeout aborts cleanly via AbortController.",
  },
  E4003: {
    code: "E4003",
    title: "Agent resolution failed",
    hypothesis:
      "AgentResolver.resolve() could not find or instantiate the agent specified in the step. The agent name may be misspelled or unregistered.",
    evidence: "Check step.agent value against registered agent names.",
    commands: [
      "obora validate  # Verify workflow agent references",
    ],
    rollback: "No side effects — resolution failure occurs before execution.",
  },
  E4004: {
    code: "E4004",
    title: "Lock acquisition failed",
    hypothesis:
      "A previous obora process crashed without releasing the lock, or another instance is running.",
    evidence: "Check for stale lock files: ls -la .obora/locks/",
    commands: [
      "obora lock clean          # Remove stale locks",
      "# Or wait and retry after the other process finishes",
    ],
    rollback: "No rollback needed — lock clean only removes stale locks.",
  },
  E4005: {
    code: "E4005",
    title: "Step failed after retries exhausted",
    hypothesis:
      "The agent failed repeatedly. Common causes: invalid prompt, missing input file, or agent misconfiguration.",
    evidence:
      "Review step logs: cat .obora/features/<feature>/.obora/outputs/<step>.md",
    commands: [
      "obora run --from-step <failed-step> -f <feature>  # Re-run from failed step",
      "obora validate                                     # Check workflow definition",
    ],
    rollback:
      "Outputs from failed steps are not committed. Safe to re-run.",
  },
  E4006: {
    code: "E4006",
    title: "Spec validation failed",
    hypothesis:
      "Required spec files (proposal.md, design.md, etc.) are missing or malformed.",
    evidence:
      "Check feature directory: ls .obora/features/<feature>/",
    commands: [
      "obora validate -f <feature>   # See detailed validation errors",
      "# Then create/fix the missing spec files",
    ],
    rollback: "No destructive action — just add the missing files.",
  },
  E4007: {
    code: "E4007",
    title: "Context assembly failed",
    hypothesis:
      "ContextBuilder failed to assemble AgentContext (Blackboard init, sessionId, etc.). This is an infrastructure error.",
    evidence: "Check Blackboard availability and context configuration.",
    commands: [
      "# Verify blackboard package is installed and configured",
      "obora validate  # Check project integrity",
    ],
    rollback: "No side effects — context assembly failure occurs before execution.",
  },
  E6003: {
    code: "E6003",
    title: "OpenClaw connection failed",
    hypothesis:
      "The OpenClaw gateway is not running, or the connection endpoint is misconfigured.",
    evidence:
      "Check gateway status: openclaw gateway status",
    commands: [
      "openclaw gateway start         # Start the gateway",
      "openclaw gateway restart        # Or restart if already running",
    ],
    rollback:
      "openclaw gateway stop           # Stop if the restart caused issues",
  },
};

/**
 * Get diagnosis template for a given error code.
 * Returns undefined if no template exists.
 */
export function getDiagnosis(code: string): DiagnosisTemplate | undefined {
  return templates[code];
}

/**
 * Format a diagnosis template as a human-readable CLI string.
 */
export function formatDiagnosis(diag: DiagnosisTemplate): string {
  const lines: string[] = [
    "",
    `💊 Diagnosis for ${diag.code}: ${diag.title}`,
    "",
    `  Hypothesis : ${diag.hypothesis}`,
    `  Evidence   : ${diag.evidence}`,
    `  Fix        :`,
    ...diag.commands.map((c) => `    $ ${c}`),
    `  Rollback   : ${diag.rollback}`,
    "",
  ];
  return lines.join("\n");
}

/**
 * Get all registered diagnosis templates.
 */
export function getAllDiagnoses(): DiagnosisTemplate[] {
  return Object.values(templates);
}
