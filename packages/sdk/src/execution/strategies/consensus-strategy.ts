import type { WorkflowStep } from "../../workflow.js";
import type { StepContext, StepResult } from "../../step-executor-types.js";
import { parseVote as parsePeerReviewVote } from "../peer-review-executor.js";
import type { StepExecutionServices } from "./types.js";

export const consensusStrategy = {
  pattern: "consensus",

  async execute(
    step: WorkflowStep,
    context: StepContext,
    services: StepExecutionServices
  ): Promise<StepResult> {
    const participants = Array.isArray(step.participants) ? step.participants : [];
    if (participants.length === 0) {
      throw new Error(`Consensus step '${step.name}' requires participants`);
    }

    const runConsensus = async (_timeoutSignal: AbortSignal): Promise<StepResult> => {
      const votes: Array<{
        participant: string;
        vote: "APPROVE" | "REJECT" | "REQUEST_CHANGES";
        response: string;
      }> = [];
      const consensusSignal = services.combineAbortSignals(
        context.signal,
        _timeoutSignal
      );

      try {
        for (const participant of participants) {
          const response = await services.requestForStep(
            step,
            {
              ...context,
              ...(consensusSignal?.signal
                ? { signal: consensusSignal.signal }
                : { signal: _timeoutSignal }),
            },
            participant
          );
          const responseText = response.message.content ?? "";
          const vote = parsePeerReviewVote(responseText);
          votes.push({ participant, vote, response: responseText });
          await services.config.onEvent?.("consensus_vote", {
            stepName: step.name,
            participant,
            vote,
            response: responseText,
          });
        }
      } finally {
        consensusSignal?.cleanup();
      }

      const approveCount = votes.filter((v) => v.vote === "APPROVE").length;
      const quorumRule = services.getConsensusQuorumRule(step, votes.length);
      const pass = approveCount >= quorumRule.requiredApprovals;
      await services.config.onEvent?.("consensus_result", {
        stepName: step.name,
        pass,
        approveCount,
        requiredApprovals: quorumRule.requiredApprovals,
        totalVotes: votes.length,
        votes,
      });

      if (!pass) {
        throw new Error(
          `Consensus failed for step '${step.name}' (${approveCount}/${votes.length} approvals, requires ${quorumRule.description})`
        );
      }

      return {
        output: votes.map((v) => `[${v.participant}] ${v.vote}: ${v.response}`).join("\n\n"),
        votes,
      };
    };

    const perRequestTimeoutMs = services.getStepTimeoutMs(step);
    const consensusTimeoutMs = services.getConsensusTimeoutMs(
      step,
      participants.length,
      perRequestTimeoutMs
    );

    return services.withTimeout(
      runConsensus,
      consensusTimeoutMs,
      `Consensus timed out for step '${step.name}' after ${consensusTimeoutMs}ms`
    );
  },
} as const;
