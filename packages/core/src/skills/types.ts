/**
 * AgentSkills Types for Obora
 *
 * Based on AgentSkills specification: https://github.com/agentskills/agentskills
 *
 * Supports:
 * - Built-in skills (bundled with @obora/core)
 * - Custom skills (user's .ai/skills/ directory)
 * - Nested categorization via ** /SKILL.md glob pattern
 *
 * Design Principles:
 * - STATELESS: Skills must not hold or depend on any runtime state.
 *   Each skill activation is independent and self-contained.
 *   Skills receive all necessary context through the current conversation.
 * - DECLARATIVE: Skills define "what" behavior is expected, not "how" to implement it.
 * - PORTABLE: Skills can be shared across different AI providers and debate sessions.
 */

/**
 * SKILL.md frontmatter schema
 */
export interface SkillFrontmatter {
  /**
   * Skill identifier (1-64 chars, kebab-case)
   * Must match the parent folder name
   */
  name: string

  /**
   * Description of what the skill does and when to use it (1-1024 chars)
   * Used for skill discovery and matching
   */
  description: string

  /**
   * License identifier (e.g., "MIT", "Apache-2.0")
   */
  license?: string

  /**
   * System requirements or compatibility notes (max 500 chars)
   */
  compatibility?: string

  /**
   * Arbitrary key-value metadata
   */
  metadata?: SkillMetadataFields

  /**
   * Space-separated list of allowed tools
   * When specified, only these tools are available during skill execution
   */
  'allowed-tools'?: string
}

/**
 * Common metadata fields
 */
export interface SkillMetadataFields {
  /**
   * Skill version (semver recommended)
   */
  version?: string

  /**
   * Skill author
   */
  author?: string

  /**
   * Category for organization (extracted from directory structure)
   */
  category?: string

  /**
   * Whether this is a built-in skill
   */
  builtin?: boolean

  /**
   * Additional arbitrary fields
   */
  [key: string]: string | boolean | undefined
}

/**
 * Skill metadata returned during discovery phase
 * Minimal data to reduce token cost (~100 tokens/skill)
 */
export interface SkillMetadata {
  /**
   * Skill name (last folder name in path)
   */
  name: string

  /**
   * Skill description for matching
   */
  description: string

  /**
   * Category (extracted from intermediate directories)
   */
  category: string | null

  /**
   * Absolute path to SKILL.md file
   */
  location: string

  /**
   * Whether this is a built-in skill
   */
  isBuiltIn: boolean
}

/**
 * Full skill data loaded during activation phase
 */
export interface Skill extends SkillMetadata {
  /**
   * Full frontmatter data
   */
  frontmatter: SkillFrontmatter

  /**
   * Markdown instructions (body content after frontmatter)
   */
  instructions: string

  /**
   * Absolute path to skill directory
   */
  skillDir: string

  /**
   * Available resources
   */
  resources: SkillResources
}

/**
 * Skill resources (scripts, references, assets)
 */
export interface SkillResources {
  /**
   * List of script files in scripts/ directory
   */
  scripts: string[]

  /**
   * List of reference files in references/ directory
   */
  references: string[]

  /**
   * List of asset files in assets/ directory
   */
  assets: string[]
}

/**
 * Skill source type
 */
export type SkillSource = 'builtin' | 'custom'

/**
 * Skill loader configuration
 */
export interface SkillLoaderConfig {
  /**
   * Path to custom skills directory
   * @default ".ai/skills"
   */
  customSkillsPath?: string

  /**
   * Whether to include built-in skills
   * @default true
   */
  includeBuiltIn?: boolean

  /**
   * Whether to validate skill schema
   * @default true
   */
  validateSchema?: boolean
}

/**
 * Skill validation error
 */
export interface SkillValidationError {
  /**
   * Skill path that failed validation
   */
  path: string

  /**
   * Error message
   */
  message: string

  /**
   * Field that failed validation (if applicable)
   */
  field?: string
}

/**
 * Skill discovery result
 */
export interface SkillDiscoveryResult {
  /**
   * Successfully discovered skills
   */
  skills: SkillMetadata[]

  /**
   * Skills that failed validation
   */
  errors: SkillValidationError[]

  /**
   * Duplicate skill warnings (same name in different locations)
   */
  warnings: SkillWarning[]
}

/**
 * Skill warning (e.g., duplicate names)
 */
export interface SkillWarning {
  /**
   * Warning type
   */
  type: 'duplicate' | 'override'

  /**
   * Skill name
   */
  skillName: string

  /**
   * Warning message
   */
  message: string

  /**
   * Paths involved
   */
  paths: string[]
}

export type SkillIsolation = 'none' | 'sandbox' | 'container'

export interface SkillPermissions {
  allowedTools: string[]
  maxTokenBudget?: number
  networkAccess: boolean
  fileSystemAccess: 'none' | 'read' | 'write'
}

export interface SkillSecurityConfig {
  requireSigning?: boolean
  trustedSources?: string[]
  defaultPermissions?: Partial<SkillPermissions>
  isolation?: SkillIsolation
  auditLogging?: boolean
}

export interface SkillAuditEvent {
  timestamp: number
  eventType: 'load' | 'activate' | 'tool_invoke' | 'permission_denied'
  skillName: string
  skillLocation: string
  details?: Record<string, unknown>
}

export type SkillAuditSink = (event: SkillAuditEvent) => void

export const DEFAULT_SKILL_PERMISSIONS: SkillPermissions = {
  allowedTools: [],
  maxTokenBudget: undefined,
  networkAccess: false,
  fileSystemAccess: 'none',
}

export const DEFAULT_SECURITY_CONFIG: SkillSecurityConfig = {
  requireSigning: false,
  trustedSources: [],
  defaultPermissions: DEFAULT_SKILL_PERMISSIONS,
  isolation: 'none',
  auditLogging: false,
}

export function getSkillPermissions(skill: Skill, config?: SkillSecurityConfig): SkillPermissions {
  const defaults = config?.defaultPermissions ?? DEFAULT_SKILL_PERMISSIONS
  const allowedToolsStr = skill.frontmatter['allowed-tools']
  const allowedTools = allowedToolsStr ? allowedToolsStr.split(/\s+/).filter(Boolean) : (defaults.allowedTools ?? [])

  return {
    allowedTools,
    maxTokenBudget: defaults.maxTokenBudget,
    networkAccess: allowedTools.includes('WebSearch') || allowedTools.includes('web_search'),
    fileSystemAccess: defaults.fileSystemAccess ?? 'none',
  }
}

export function checkToolPermission(
  skill: Skill,
  toolName: string,
  config?: SkillSecurityConfig,
  auditSink?: SkillAuditSink,
): boolean {
  const permissions = getSkillPermissions(skill, config)

  if (permissions.allowedTools.length === 0) {
    return true
  }

  const allowed = permissions.allowedTools.includes(toolName) || permissions.allowedTools.includes('*')

  if (!allowed && auditSink) {
    auditSink({
      timestamp: Date.now(),
      eventType: 'permission_denied',
      skillName: skill.name,
      skillLocation: skill.location,
      details: { toolName, allowedTools: permissions.allowedTools },
    })
  }

  return allowed
}

export function createAuditLogger(sink: SkillAuditSink): {
  logLoad: (skill: Skill) => void
  logActivate: (skill: Skill, phase?: string) => void
  logToolInvoke: (skill: Skill, toolName: string, allowed: boolean) => void
} {
  return {
    logLoad: (skill: Skill) => {
      sink({
        timestamp: Date.now(),
        eventType: 'load',
        skillName: skill.name,
        skillLocation: skill.location,
      })
    },
    logActivate: (skill: Skill, phase?: string) => {
      sink({
        timestamp: Date.now(),
        eventType: 'activate',
        skillName: skill.name,
        skillLocation: skill.location,
        details: phase ? { phase } : undefined,
      })
    },
    logToolInvoke: (skill: Skill, toolName: string, allowed: boolean) => {
      sink({
        timestamp: Date.now(),
        eventType: allowed ? 'tool_invoke' : 'permission_denied',
        skillName: skill.name,
        skillLocation: skill.location,
        details: { toolName, allowed },
      })
    },
  }
}

/**
 * Validation constraints based on AgentSkills spec
 */
export const SKILL_CONSTRAINTS = {
  name: {
    minLength: 1,
    maxLength: 64,
    pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/,
  },
  description: {
    minLength: 1,
    maxLength: 1024,
  },
  compatibility: {
    maxLength: 500,
  },
} as const

/**
 * Default paths
 */
export const SKILL_PATHS = {
  /**
   * Default custom skills path (relative to project root)
   */
  custom: '.ai/skills',

  /**
   * Built-in skills path (relative to @obora/core package)
   */
  builtin: 'skills',

  /**
   * SKILL.md filename
   */
  skillFile: 'SKILL.md',

  /**
   * Glob pattern for discovering skills
   */
  globPattern: '**/SKILL.md',
} as const

/**
 * Type guard for SkillFrontmatter
 */
export function isValidSkillFrontmatter(data: unknown): data is SkillFrontmatter {
  if (typeof data !== 'object' || data === null) {
    return false
  }

  const obj = data as Record<string, unknown>

  // Required fields
  if (typeof obj.name !== 'string' || obj.name.length === 0) {
    return false
  }
  if (typeof obj.description !== 'string' || obj.description.length === 0) {
    return false
  }

  // Validate name pattern
  if (!SKILL_CONSTRAINTS.name.pattern.test(obj.name)) {
    return false
  }

  // Validate lengths
  if (obj.name.length > SKILL_CONSTRAINTS.name.maxLength) {
    return false
  }
  if (obj.description.length > SKILL_CONSTRAINTS.description.maxLength) {
    return false
  }

  // Optional field validation
  if (obj.compatibility !== undefined && typeof obj.compatibility === 'string') {
    if (obj.compatibility.length > SKILL_CONSTRAINTS.compatibility.maxLength) {
      return false
    }
  }

  return true
}

/**
 * Validate skill frontmatter and return detailed errors
 */
export function validateSkillFrontmatter(data: unknown, path: string): SkillValidationError[] {
  const errors: SkillValidationError[] = []

  if (typeof data !== 'object' || data === null) {
    errors.push({
      path,
      message: 'Frontmatter must be an object',
    })
    return errors
  }

  const obj = data as Record<string, unknown>

  // Name validation
  if (typeof obj.name !== 'string') {
    errors.push({
      path,
      message: 'name is required and must be a string',
      field: 'name',
    })
  } else {
    if (obj.name.length < SKILL_CONSTRAINTS.name.minLength) {
      errors.push({
        path,
        message: 'name cannot be empty',
        field: 'name',
      })
    }
    if (obj.name.length > SKILL_CONSTRAINTS.name.maxLength) {
      errors.push({
        path,
        message: `name must be at most ${SKILL_CONSTRAINTS.name.maxLength} characters`,
        field: 'name',
      })
    }
    if (!SKILL_CONSTRAINTS.name.pattern.test(obj.name)) {
      errors.push({
        path,
        message: 'name must be kebab-case (lowercase letters, numbers, and hyphens)',
        field: 'name',
      })
    }
  }

  // Description validation
  if (typeof obj.description !== 'string') {
    errors.push({
      path,
      message: 'description is required and must be a string',
      field: 'description',
    })
  } else {
    if (obj.description.length < SKILL_CONSTRAINTS.description.minLength) {
      errors.push({
        path,
        message: 'description cannot be empty',
        field: 'description',
      })
    }
    if (obj.description.length > SKILL_CONSTRAINTS.description.maxLength) {
      errors.push({
        path,
        message: `description must be at most ${SKILL_CONSTRAINTS.description.maxLength} characters`,
        field: 'description',
      })
    }
  }

  // Compatibility validation (optional)
  if (obj.compatibility !== undefined) {
    if (typeof obj.compatibility !== 'string') {
      errors.push({
        path,
        message: 'compatibility must be a string',
        field: 'compatibility',
      })
    } else if (obj.compatibility.length > SKILL_CONSTRAINTS.compatibility.maxLength) {
      errors.push({
        path,
        message: `compatibility must be at most ${SKILL_CONSTRAINTS.compatibility.maxLength} characters`,
        field: 'compatibility',
      })
    }
  }

  return errors
}
