import { AgendaStore } from "../../consensus/agenda/index.js";
import { EventBus } from "../../_legacy/blackboard/events/index.js";
import { MeetingStateMachine } from "./discussion/index.js";
import {
  CollaborationPatternBase,
  type BuiltinPatternKind,
  type DiscussionPatternConfig,
  PATTERN_BLACKBOARD_DOMAIN_MAP,
  type PatternPayloadResult,
  type PatternRuntimeContext,
} from "../types.js";

type DiscussionOpinion = string;

type RoundOpinions = Record<string, DiscussionOpinion>;

interface DiscussionInputShape {
  topic?: string;
  opinions?: Record<string, unknown>;
  rounds?: Array<Record<string, unknown>>;
}

interface ConvergenceEvaluation {
  converged: boolean;
  decision?: DiscussionOpinion;
  disagreements: number;
}

interface CustomConvergenceContext {
  round: number;
  opinions: RoundOpinions;
  participants: string[];
}

type CustomConvergenceFn = (context: CustomConvergenceContext) => boolean;

const DEFAULT_MAX_ROUNDS = 3;
const DEFAULT_CONVERGENCE: Required<DiscussionPatternConfig>["convergence"] = "no_disagreements";
const DEFAULT_DEADLOCK: Required<DiscussionPatternConfig>["on_deadlock"] = "fail";

export class DiscussionPattern extends CollaborationPatternBase {
  readonly name = "discussion";
  readonly kind: BuiltinPatternKind = "discussion";

  validateConfig(config: DiscussionPatternConfig): void {
    if (config.max_rounds !== undefined) {
      if (!Number.isInteger(config.max_rounds) || config.max_rounds < 1) {
        throw new Error("discussion.max_rounds must be an integer >= 1");
      }
    }

    if (config.convergence !== undefined) {
      const allowed = new Set(["no_disagreements", "majority", "unanimous", "custom"]);
      if (!allowed.has(config.convergence)) {
        throw new Error("discussion.convergence must be one of: no_disagreements, majority, unanimous, custom");
      }
    }

    if (config.on_deadlock !== undefined) {
      const allowed = new Set(["escalate", "retry", "fail"]);
      if (!allowed.has(config.on_deadlock)) {
        throw new Error("discussion.on_deadlock must be one of: escalate, retry, fail");
      }
    }
  }

  protected async onExecute(context: PatternRuntimeContext): Promise<PatternPayloadResult> {
    const participants = Object.keys(context.participants ?? {});
    if (participants.length === 0) {
      throw new Error("discussion pattern requires at least one participant");
    }

    const config = (context.config ?? {}) as DiscussionPatternConfig;
    const maxRounds = config.max_rounds ?? DEFAULT_MAX_ROUNDS;
    const convergence = config.convergence ?? DEFAULT_CONVERGENCE;
    const onDeadlock = config.on_deadlock ?? DEFAULT_DEADLOCK;

    const messageBus = new EventBus({ historySize: 200 });
    const agendaStore = new AgendaStore({ eventBus: messageBus });
    const meetingStateMachine = new MeetingStateMachine(messageBus);

    const agendaId = `discussion-${context.executionId ?? context.stepName ?? "agenda"}`;
    const topic = this.getDiscussionInput(context).topic ?? context.stepName ?? "Discussion";

    agendaStore.create({ id: agendaId, title: topic }, "system");
    agendaStore.transition(agendaId, "pending", "system");
    agendaStore.transition(agendaId, "active", "system");

    meetingStateMachine.apply({ type: "agenda.created" });
    meetingStateMachine.apply({ type: "agenda.status.changed", payload: { status: "IN_PROGRESS" } });

    const rounds: Array<{ round: number; opinions: RoundOpinions; converged: boolean; decision?: string }> = [];
    let decision: string | undefined;
    let converged = false;

    const roundLimit = onDeadlock === "retry" ? maxRounds + 1 : maxRounds;

    for (let round = 1; round <= roundLimit; round++) {
      await context.emit?.({
        type: "discussion_round_start",
        payload: { round, participants },
      });

      const opinions = this.collectRoundOpinions(context, participants, round);
      const evaluation = this.evaluateConvergence({
        convergence,
        opinions,
        participants,
        round,
        context,
      });

      rounds.push({
        round,
        opinions,
        converged: evaluation.converged,
        decision: evaluation.decision,
      });

      await context.emit?.({
        type: "discussion_round_end",
        payload: {
          round,
          opinions,
          converged: evaluation.converged,
          decision: evaluation.decision,
          disagreements: evaluation.disagreements,
        },
      });

      if (evaluation.converged) {
        converged = true;
        decision = evaluation.decision;
        break;
      }
    }

    meetingStateMachine.apply({ type: "decisions.voting.started" });
    meetingStateMachine.apply({ type: "decisions.voting.ended" });

    if (converged) {
      meetingStateMachine.apply({
        type: "workflow.consensus.computed",
        payload: { reason: "converged" },
      });
      agendaStore.transition(agendaId, "completed", "system");

      return {
        success: true,
        output: {
          topic,
          status: "consensus-reached",
          decision,
          rounds,
        },
        metadata: {
          rounds: rounds.length,
          converged: true,
          convergence,
          blackboard_domains: PATTERN_BLACKBOARD_DOMAIN_MAP["discussion"],
          meeting_state: meetingStateMachine.getState(),
        },
      };
    }

    const deadlockResult = this.handleDeadlock(onDeadlock, rounds.length);

    if (deadlockResult.status === "escalated") {
      agendaStore.transition(agendaId, "cancelled", "system");
      meetingStateMachine.apply({
        type: "workflow.timeout",
        payload: { reason: "deadlock escalation" },
      });
    } else {
      agendaStore.transition(agendaId, "cancelled", "system");
      meetingStateMachine.apply({
        type: "workflow.timeout",
        payload: { reason: "deadlock" },
      });
    }

    return {
      success: false,
      output: {
        topic,
        status: deadlockResult.status,
        reason: "max_rounds_reached",
        rounds,
      },
      metadata: {
        rounds: rounds.length,
        converged: false,
        convergence,
        on_deadlock: onDeadlock,
        blackboard_domains: PATTERN_BLACKBOARD_DOMAIN_MAP["discussion"],
        meeting_state: meetingStateMachine.getState(),
      },
    };
  }

  private getDiscussionInput(context: PatternRuntimeContext): DiscussionInputShape {
    const input = context.input;
    if (!input || typeof input !== "object") {
      return {};
    }

    return input as DiscussionInputShape;
  }

  private collectRoundOpinions(
    context: PatternRuntimeContext,
    participants: string[],
    round: number
  ): RoundOpinions {
    const input = this.getDiscussionInput(context);
    const roundInput = input.rounds?.[round - 1];

    const opinions: RoundOpinions = {};
    for (const participant of participants) {
      const raw = roundInput?.[participant] ?? input.opinions?.[participant] ?? participant;
      opinions[participant] = String(raw);
    }

    return opinions;
  }

  private evaluateConvergence(args: {
    convergence: NonNullable<DiscussionPatternConfig["convergence"]>;
    opinions: RoundOpinions;
    participants: string[];
    round: number;
    context: PatternRuntimeContext;
  }): ConvergenceEvaluation {
    const values = Object.values(args.opinions);
    const counts = this.countOpinions(values);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const [topOpinion, topCount] = sorted[0] ?? [undefined, 0];
    const disagreements = values.length - topCount;

    if (args.convergence === "no_disagreements" || args.convergence === "unanimous") {
      return {
        converged: sorted.length <= 1,
        decision: sorted.length <= 1 ? topOpinion : undefined,
        disagreements,
      };
    }

    if (args.convergence === "majority") {
      const required = Math.floor(args.participants.length / 2) + 1;
      const converged = topCount >= required;
      return {
        converged,
        decision: converged ? topOpinion : undefined,
        disagreements,
      };
    }

    const customFn = this.resolveCustomConvergence(args.context);
    const customConverged = customFn({
      round: args.round,
      opinions: args.opinions,
      participants: args.participants,
    });

    return {
      converged: customConverged,
      decision: customConverged ? topOpinion : undefined,
      disagreements,
    };
  }

  private resolveCustomConvergence(context: PatternRuntimeContext): CustomConvergenceFn {
    const configFn = (context.config as { custom_convergence?: unknown } | undefined)?.custom_convergence;
    if (typeof configFn === "function") {
      return configFn as CustomConvergenceFn;
    }

    const contextFn = (context as PatternRuntimeContext & { customConvergence?: unknown }).customConvergence;
    if (typeof contextFn === "function") {
      return contextFn as CustomConvergenceFn;
    }

    throw new Error("discussion.convergence='custom' requires custom_convergence function");
  }

  private countOpinions(opinions: DiscussionOpinion[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const opinion of opinions) {
      counts.set(opinion, (counts.get(opinion) ?? 0) + 1);
    }
    return counts;
  }

  private handleDeadlock(
    action: NonNullable<DiscussionPatternConfig["on_deadlock"]>,
    rounds: number
  ): { status: "failed" | "escalated" | "retried"; rounds: number } {
    if (action === "escalate") {
      return { status: "escalated", rounds };
    }

    if (action === "retry") {
      return { status: "retried", rounds };
    }

    return { status: "failed", rounds };
  }
}
