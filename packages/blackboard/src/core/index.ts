/**
 * @module core/index
 * @description Core exports
 */

// Blackboard class
export {
  Blackboard,
  BlackboardOptions,
  QueryOptions,
  WriteResult,
  Operation,
  BlackboardErrorCode,
  PathNotFoundError,
  BlackboardError,
} from './blackboard';

// Re-export error classes for convenience
export { VersionConflictError } from './versioning';

// Versioning
export {
  VersionManager,
  VersionConflictError as _VersionConflictError,
  VersioningConfig,
  DEFAULT_VERSIONING_CONFIG,
} from './versioning';

// Path utilities
export {
  getByPath,
  setByPath,
  deleteByPath,
  parsePath,
  isValidPath,
  normalizePath,
  joinPath,
  isSubPath,
  getParentPath,
  type ParsedPath,
} from './path-utils';

// Immutable utilities
export {
  deepClone,
  deepFreeze,
  immutableUpdate,
  mapToObject,
  objectToMap,
  merge,
} from './immutable';

// ID generator
export {
  DefaultIdGenerator,
  SequentialIdGenerator,
  defaultIdGenerator,
  sequentialIdGenerator,
  type IdGenerator,
} from './id-generator';

// Accessors
export {
  StateSectionAccessor,
  KnowledgeSectionAccessor,
  DecisionsSectionAccessor,
} from './accessors';

// Event-aware Blackboard
export {
  EventAwareBlackboard,
  EventAwareBlackboardOptions,
} from './blackboard-events';
