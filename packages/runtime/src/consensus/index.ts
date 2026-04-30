export {
  evaluateConsensus,
  CONSENSUS_STATUSES,
  isConsensusResult,
} from "../blackboard/domains/consensus/index.js";
export type {
  ConsensusMethod,
  EvaluateConsensusOptions,
  ConsensusStatus,
  VotingSessionSnapshot,
  ConsensusCondition,
  ConsensusEscalation,
  ConsensusResult,
} from "../blackboard/domains/consensus/index.js";
export * from "./ConsensusGate.js";
