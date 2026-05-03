import type { WorkflowStep } from "../../workflow.js";
import type { StepContext, StepResult } from "../../step-executor.js";
import {
  executeReviewersInParallel,
  parseVote as parsePeerReviewVote,
  parseReviewerScore,
  parseReviewerIssues,
  buildPeerReviewSummary,
  evaluatePeerReview,
  extractPeerReviewConfig,
  type Vote,
  type ReviewerScore,
  type PeerReviewStepResult,
} from "../peer-review-executor.js";
import type { StepExecutionServices } from "./types.js";

export const peerReviewStrategy = {
  pattern: "peer-review",

  async execute(
    step: WorkflowStep,
    context: StepContext,
    services: StepExecutionServices
  ): Promise<PeerReviewStepResult> {
    const participants = Array.isArray(step.participants) ? step.participants : [];
    if (participants.length === 0) {
      throw new Error(`Peer-review step '${step.name}' requires participants`);
    }

    const prConfig = extractPeerReviewConfig(
      (step.config ?? {}) as Record<string, unknown>
    );
    const isParallel = prConfig.parallel !== false; // default true

    const runPeerReview = async (
      _timeoutSignal: AbortSignal
    ): Promise<PeerReviewStepResult> => {
      const consensusSignal = services.combineAbortSignals(
        context.signal,
        _timeoutSignal
      );
      const signalCtx: StepContext = {
        ...context,
        ...(consensusSignal?.signal
          ? { signal: consensusSignal.signal }
          : { signal: _timeoutSignal }),
      };

      const votes: Vote[] = [];
      const scores: ReviewerScore[] = [];

      const processResponse = async (participant: string): Promise<void> => {
        const response = await services.requestForStep(step, signalCtx, participant);
        const responseText = response.message.content ?? "";
        const vote = parsePeerReviewVote(responseText);
        const score = parseReviewerScore(responseText, vote);
        const issues = parseReviewerIssues(responseText);

        votes.push({ participant, vote, response: responseText });
        scores.push({ reviewer: participant, score, issues });

        await services.config.onEvent?.("peer_review_vote", {
          stepName: step.name,
          participant,
          vote,
          score,
          issueCount: issues.length,
          p0Count: issues.filter((i) => i.severity === "P0").length,
        });
      };

      try {
        if (isParallel) {
          const outcomes = await executeReviewersInParallel(
            participants,
            processResponse,
            prConfig.maxConcurrency
          );

          for (const outcome of outcomes) {
            if (outcome.status === "rejected") {
              await services.config.onEvent?.("peer_review_vote", {
                stepName: step.name,
                participant: outcome.participant,
                error:
                  outcome.error instanceof Error
                    ? outcome.error.message
                    : String(outcome.error),
                failed: true,
              });
            }
          }
        } else {
          for (const participant of participants) {
            await processResponse(participant);
          }
        }
      } finally {
        consensusSignal?.cleanup();
      }

      const summary = buildPeerReviewSummary(votes, scores);
      const evaluation = evaluatePeerReview(summary, prConfig);

      await services.config.onEvent?.("peer_review_result", {
        stepName: step.name,
        passed: evaluation.passed,
        reasons: evaluation.reasons,
        summary,
      });

      if (!evaluation.passed) {
        throw new Error(
          `Peer review failed for step '${step.name}': ${evaluation.reasons.join("; ")}`
        );
      }

      const mergedOutput = votes
        .map(
          (v) =>
            `[${v.participant}] ${v.vote} (score: ${
              scores.find((s) => s.reviewer === v.participant)?.score ?? "?"
            }): ${v.response}`
        )
        .join("\n\n");

      return {
        output: mergedOutput,
        votes,
        scores,
        passed: true,
        summary,
      };
    };

    const perRequestTimeoutMs = services.getStepTimeoutMs(step);
    const consensusTimeoutMs = services.getConsensusTimeoutMs(
      step,
      participants.length,
      perRequestTimeoutMs
    );

    return services.withTimeout(
      runPeerReview,
      consensusTimeoutMs,
      `Peer review timed out for step '${step.name}' after ${consensusTimeoutMs}ms`
    );
  },
} as const;
