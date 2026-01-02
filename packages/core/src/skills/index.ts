/**
 * Skills module for Obora
 *
 * Provides types and utilities for AgentSkills integration
 */

export {
  // Core types
  type Skill,
  type SkillFrontmatter,
  type SkillMetadata,
  type SkillMetadataFields,
  type SkillResources,
  type SkillSource,
  // Loader types
  type SkillLoaderConfig,
  // Discovery types
  type SkillDiscoveryResult,
  type SkillValidationError,
  type SkillWarning,
  // Validation
  isValidSkillFrontmatter,
  SKILL_CONSTRAINTS,
  SKILL_PATHS,
  validateSkillFrontmatter,
} from './types'
