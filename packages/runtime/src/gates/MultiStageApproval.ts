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
}

export class MultiStageApprovalGate {
  constructor(
    private readonly config: MultiStageGateConfig,
    private readonly context: GateRuntimeContext = {}
  ) {}

  async evaluate(decisions: ApprovalDecision[]): Promise<MultiStageApprovalResult> {
    const normalized = this.normalizeDecisions(decisions);
    const stageResults: MultiStageApprovalResult["stages"] = [];
    const trackHistory = this.config.track_history ?? true;

    for (let stageIndex = 0; stageIndex < this.config.stages.length; stageIndex += 1) {
      const stage = this.config.stages[stageIndex]!;
      let allowed = false;
      try {
        allowed = evaluateGateCondition(stage.condition, {
          ...(this.context.conditionContext ?? {}),
          stageIndex,
          stageName: stage.name,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stageResults.push({
          name: stage.name,
          status: "rejected",
          decisions: [],
        });
        return {
          approved: false,
          stages: stageResults,
          reason: `condition_evaluation_error: ${message}`,
        };
      }

      if (!allowed) {
        stageResults.push({ name: stage.name, status: "skipped", decisions: [] });
        continue;
      }

      const stageDecisions = this.pickStageDecisions(normalized, stageIndex, stage.name, stage.approvers);
      const approvals = stageDecisions.filter((entry) => entry.decision === "approved").length;
      const rejections = stageDecisions.filter((entry) => entry.decision === "rejected");

      if (rejections.length > 0) {
        for (const rejection of rejections) {
          await this.context.emit?.({
            type: "gate_approval_decision",
            payload: {
              stageIndex,
              stageName: stage.name,
              approver: rejection.approver,
              decision: rejection.decision,
              comment: rejection.comment,
              timestamp: rejection.timestamp.toISOString(),
            },
          });
        }

        stageResults.push({
          name: stage.name,
          status: "rejected",
          decisions: trackHistory ? stageDecisions : [],
        });

        return {
          approved: false,
          stages: stageResults,
          reason: `Rejected at stage '${stage.name}' (${this.config.on_reject ?? "fail"})`,
        };
      }

      for (const stageDecision of stageDecisions) {
        await this.context.emit?.({
          type: "gate_approval_decision",
          payload: {
            stageIndex,
            stageName: stage.name,
            approver: stageDecision.approver,
            decision: stageDecision.decision,
            comment: stageDecision.comment,
            timestamp: stageDecision.timestamp.toISOString(),
          },
        });
      }

      if (approvals >= stage.required) {
        stageResults.push({
          name: stage.name,
          status: "approved",
          decisions: trackHistory ? stageDecisions : [],
        });
        continue;
      }

      stageResults.push({
        name: stage.name,
        status: "pending",
        decisions: trackHistory ? stageDecisions : [],
      });

      return {
        approved: false,
        stages: stageResults,
        reason: `Stage '${stage.name}' requires ${stage.required} approvals (${approvals} received)`,
      };
    }

    return {
      approved: true,
      stages: stageResults,
    };
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
    const latestByApprover = new Map<string, ApprovalDecision>();

    for (const decision of decisions) {
      if (decision.stageIndex !== stageIndex && decision.stageName !== stageName) {
        continue;
      }
      if (!allowedApprovers.includes(decision.approver)) {
        continue;
      }

      const normalizedDecision = this.config.allow_comments === false
        ? { ...decision, comment: undefined }
        : decision;
      latestByApprover.set(decision.approver, normalizedDecision);
    }

    return [...latestByApprover.values()].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
}
