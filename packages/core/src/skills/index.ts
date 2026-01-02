/**
 * Skills module for Obora
 *
 * Provides types and utilities for AgentSkills integration
 */

export {
  // Validation
  isValidSkillFrontmatter,
  SKILL_CONSTRAINTS,
  SKILL_PATHS,
  // Core types
  type Skill,
  // Discovery types
  type SkillDiscoveryResult,
  type SkillFrontmatter,
  // Loader types
  type SkillLoaderConfig,
  type SkillMetadata,
  type SkillMetadataFields,
  type SkillResources,
  type SkillSource,
  type SkillValidationError,
  type SkillWarning,
  validateSkillFrontmatter,
} from './types'

// Loader
export { SkillLoader, SkillNotFoundError } from './loader'
