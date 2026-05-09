import { evaluateGateCondition, type GateFallback, type GateRuntimeContext } from "./types.js";

export interface ApprovalStage {
  name: string;
  approvers: string[];
  required: number;
  timeout?: string;
  fallback?: GateFallback;
  escalation_to?: string;
  condition?: string;
}

export interface MultiStageGateConfig {
  stages: ApprovalStage[];
  on_reject?: "fail" | "restart" | "reassign";
  allow_comments?: boolean;
  track_history?: boolean;
}

export interface ApprovalDecision {
  stageIndex: number;
  stageName: string;
  approver: string;
  decision: "approved" | "rejected" | "abstained";
  comment?: string;
  timestamp: Date;
}

export interface MultiStageApprovalResult {
  approved: boolean;
  stages: Array<{
    name: string;
    status: "approved" | "rejected" | "pending" | "skipped" | "timeout";
    decisions: ApprovalDecision[];
  }>;
  reason?: string;
  /**
   * Signals the distinct on_reject action the caller should take:
   * - "fail": terminal rejection, no retry.
   * - "restart": caller should reset all stages and re-collect decisions from stage 0.
   * - "reassign": caller should reassign the rejecting stage to a different approver.
   * Only set when a rejection occurs.
   */
  action?: "fail" | "restart" | "reassign";
  /** When action="reassign", identifies the stage index to reassign. */
  reassignStageIndex?: number;
}

/**
 * Stage-level timeout/fallback/escalation_to mapping to SLAManager:
 *
 * Each ApprovalStage may declare `timeout`, `fallback`, and `escalation_to`.
 * These fields map to SLAManager.checkSLA() as follows:
 *   - stage.timeout   → SLAConfig.timeout
 *   - stage.fallback   → SLAConfig.fallback (defaults to "fail")
 *   - stage.escalation_to → SLAConfig.escalation_chain[0]
 *
 * The caller is responsible for constructing an SLAConfig from stage fields
 * and invoking SLAManager.checkSLA() with the relevant GateAssignment.
 * Use `buildSLAConfigFromStage()` below for the canonical mapping.
 */

export interface StageSLAConfig {
  timeout: string;
  fallback: GateFallback;
  escalation_chain?: string[];
}

/**
 * Build an SLAConfig from stage-level timeout/fallback/escalation_to fields.
 * Returns undefined if the stage has no timeout configured.
 */
export function buildSLAConfigFromStage(stage: ApprovalStage): StageSLAConfig | undefined {
  if (!stage.timeout) return undefined;
  return {
    timeout: stage.timeout,
    fallback: stage.fallback ?? "fail",
    escalation_chain: stage.escalation_to ? [stage.escalation_to] : undefined,
  };
}

export class MultiStageApprovalGate {
  constructor(
    private readonly config: MultiStageGateConfig,
    private readonly context: GateRuntimeContext = {}
  ) {}

  async evaluate(decisions: ApprovalDecision[]): Promise<MultiStageApprovalResult> {
    const normalized = this.normalizeDecisions(decisions);
    const trackHistory = this.config.track_history ?? true;
    const onReject = this.config.on_reject ?? "fail";

    const evaluateStage = async (
      stageIndex: number,
      stageResults: MultiStageApprovalResult["stages"]
    ): Promise<MultiStageApprovalResult> => {
      const stage = this.config.stages[stageIndex]!;
      if (!stage) {
        return {
          approved: true,
          stages: stageResults,
        };
      }

      const conditionResult:
        | { status: "ok"; allowed: boolean }
        | { status: "error"; message: string } = (() => {
        try {
          return {
            status: "ok",
            allowed: evaluateGateCondition(stage.condition, {
              ...(this.context.conditionContext ?? {}),
              stageIndex,
              stageName: stage.name,
            }),
          };
        } catch (error) {
          return {
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          };
        }
      })();

      if (conditionResult.status === "error") {
        const nextStageResults: MultiStageApprovalResult["stages"] = [...stageResults, {
          name: stage.name,
          status: "rejected",
          decisions: [],
        }];
        return {
          approved: false,
          stages: nextStageResults,
          reason: `condition_evaluation_error: ${conditionResult.message}`,
          action: "fail",
        };
      }

      if (!conditionResult.allowed) {
        return evaluateStage(stageIndex + 1, [
          ...stageResults,
          { name: stage.name, status: "skipped", decisions: [] },
        ]);
      }

      const stageDecisions = this.pickStageDecisions(normalized, stageIndex, stage.name, stage.approvers);
      const approvals = stageDecisions.filter((entry) => entry.decision === "approved").length;
      const rejections = stageDecisions.filter((entry) => entry.decision === "rejected");

      if (rejections.length > 0) {
        await Promise.all(
          rejections.map((rejection) =>
            this.context.emit?.({
            type: "gate_approval_decision",
            payload: {
              stageIndex,
              stageName: stage.name,
              approver: rejection.approver,
              decision: rejection.decision,
              comment: rejection.comment,
              timestamp: rejection.timestamp.toISOString(),
            },
            })
          )
        );

        const nextStageResults: MultiStageApprovalResult["stages"] = [...stageResults, {
          name: stage.name,
          status: "rejected",
          decisions: trackHistory ? stageDecisions : [],
        }];

        const result: MultiStageApprovalResult = {
          approved: false,
          stages: nextStageResults,
          reason: `Rejected at stage '${stage.name}' (${onReject})`,
          action: onReject,
        };

        // For "reassign", indicate which stage needs reassignment
        if (onReject === "reassign") {
          result.reassignStageIndex = stageIndex;
        }

        return result;
      }

      await Promise.all(
        stageDecisions.map((stageDecision) =>
          this.context.emit?.({
          type: "gate_approval_decision",
          payload: {
            stageIndex,
            stageName: stage.name,
            approver: stageDecision.approver,
            decision: stageDecision.decision,
            comment: stageDecision.comment,
            timestamp: stageDecision.timestamp.toISOString(),
          },
          })
        )
      );

      if (approvals >= stage.required) {
        return evaluateStage(stageIndex + 1, [...stageResults, {
          name: stage.name,
          status: "approved",
          decisions: trackHistory ? stageDecisions : [],
        }]);
      }

      const nextStageResults: MultiStageApprovalResult["stages"] = [...stageResults, {
        name: stage.name,
        status: "pending",
        decisions: trackHistory ? stageDecisions : [],
      }];

      return {
        approved: false,
        stages: nextStageResults,
        reason: `Stage '${stage.name}' requires ${stage.required} approvals (${approvals} received)`,
      };
    };

    return evaluateStage(0, []);
  }

  private normalizeDecisions(decisions: ApprovalDecision[]): ApprovalDecision[] {
    return [...decisions].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private pickStageDecisions(
    decisions: ApprovalDecision[],
    stageIndex: number,
    stageName: string,
    allowedApprovers: string[]
  ): ApprovalDecision[] {
    const latestByApprover = decisions.reduce((map, decision) => {
      if (
        (decision.stageIndex !== stageIndex && decision.stageName !== stageName) ||
        !allowedApprovers.includes(decision.approver)
      ) {
        return map;
      }

      const normalizedDecision = this.config.allow_comments === false
        ? { ...decision, comment: undefined }
        : decision;
      return new Map([...map, [decision.approver, normalizedDecision]]);
    }, new Map<string, ApprovalDecision>());

    return [...latestByApprover.values()].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
}
