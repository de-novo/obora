/**
 * SkillLoader - Discovery and Loading System for AgentSkills
 *
 * Supports:
 * - Built-in skills (bundled with @obora/core)
 * - Custom skills (user's .ai/skills/ directory)
 * - Nested categorization via ** /SKILL.md glob pattern
 *
 * Progressive Disclosure:
 * - Discovery phase: ~100 tokens/skill (name, description, category)
 * - Activation phase: Full skill content (~5k tokens)
 * - Execution phase: Resources loaded on-demand
 */

import { parse as parseYaml } from 'yaml'
import {
  SKILL_PATHS,
  type Skill,
  type SkillDiscoveryResult,
  type SkillFrontmatter,
  type SkillLoaderConfig,
  type SkillMetadata,
  type SkillResources,
  type SkillValidationError,
  type SkillWarning,
  validateSkillFrontmatter,
} from './types'

/**
 * Error thrown when a skill cannot be found
 */
export class SkillNotFoundError extends Error {
  constructor(skillName: string) {
    super(`Skill '${skillName}' not found in custom or built-in skills`)
    this.name = 'SkillNotFoundError'
  }
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): { frontmatter: unknown; body: string } {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (!match || !match[1] || match[2] === undefined) {
    return { frontmatter: {}, body: content }
  }

  try {
    const frontmatter = parseYaml(match[1])
    return { frontmatter, body: match[2].trim() }
  } catch {
    return { frontmatter: {}, body: content }
  }
}

/**
 * Extract skill name from file path
 * Path: /path/to/category/skill-name/SKILL.md → skill-name
 */
function extractSkillName(filePath: string): string {
  const parts = filePath.split('/')
  // Parent folder of SKILL.md is the skill name
  const skillName = parts[parts.length - 2]
  if (!skillName) {
    throw new Error(`Invalid skill path: ${filePath}`)
  }
  return skillName
}

/**
 * Extract category from file path
 * Path: /path/to/skills/category/skill-name/SKILL.md → category
 * Path: /path/to/skills/skill-name/SKILL.md → null
 */
function extractCategory(filePath: string, basePath: string): string | null {
  // Normalize paths
  const normalizedFile = filePath.replace(/\\/g, '/')
  const normalizedBase = basePath.replace(/\\/g, '/')

  // Get relative path from base
  const relativePath = normalizedFile.replace(normalizedBase, '').replace(/^\//, '')
  const parts = relativePath.split('/')

  // If path is category/skill-name/SKILL.md, return category
  // If path is skill-name/SKILL.md, return null
  if (parts.length >= 3 && parts[0]) {
    return parts[0]
  }
  return null
}

/**
 * SkillLoader class for discovering and loading skills
 */
export class SkillLoader {
  private config: Required<SkillLoaderConfig>
  private builtInPath: string
  private customPath: string
  private cache: Map<string, SkillMetadata> = new Map()
  private fullCache: Map<string, Skill> = new Map()

  constructor(config: SkillLoaderConfig = {}) {
    this.config = {
      customSkillsPath: config.customSkillsPath ?? SKILL_PATHS.custom,
      includeBuiltIn: config.includeBuiltIn ?? true,
      validateSchema: config.validateSchema ?? true,
    }

    // Built-in skills path: relative to this file's package
    // __dirname equivalent in ESM
    const currentFile = import.meta.url.replace('file://', '')
    const packageRoot = currentFile.replace(/\/src\/skills\/loader\.ts$/, '')
    this.builtInPath = `${packageRoot}/${SKILL_PATHS.builtin}`

    // Custom skills path: absolute or relative to cwd
    const customPath = this.config.customSkillsPath
    this.customPath = customPath.startsWith('/') ? customPath : `${process.cwd()}/${customPath}`
  }

  /**
   * Discover all skills (custom + built-in)
   * Returns metadata only for token efficiency
   */
  async discover(): Promise<SkillDiscoveryResult> {
    const skills: SkillMetadata[] = []
    const errors: SkillValidationError[] = []
    const warnings: SkillWarning[] = []
    const seenNames = new Map<string, string>() // name → first path

    // Custom skills first (higher priority)
    const customResult = await this.discoverFromPath(this.customPath, false)
    for (const skill of customResult.skills) {
      if (seenNames.has(skill.name)) {
        warnings.push({
          type: 'duplicate',
          skillName: skill.name,
          message: `Skill '${skill.name}' found in multiple custom locations`,
          paths: [seenNames.get(skill.name)!, skill.location],
        })
      } else {
        seenNames.set(skill.name, skill.location)
        skills.push(skill)
        this.cache.set(skill.name, skill)
      }
    }
    errors.push(...customResult.errors)

    // Built-in skills (lower priority)
    if (this.config.includeBuiltIn) {
      const builtInResult = await this.discoverFromPath(this.builtInPath, true)
      for (const skill of builtInResult.skills) {
        if (seenNames.has(skill.name)) {
          // Custom overrides built-in - add warning for visibility
          warnings.push({
            type: 'override',
            skillName: skill.name,
            message: `Custom skill '${skill.name}' overrides built-in skill`,
            paths: [seenNames.get(skill.name)!, skill.location],
          })
        } else {
          seenNames.set(skill.name, skill.location)
          skills.push(skill)
          this.cache.set(skill.name, skill)
        }
      }
      errors.push(...builtInResult.errors)
    }

    return { skills, errors, warnings }
  }

  /**
   * Discover built-in skills only
   */
  async discoverBuiltIn(): Promise<SkillDiscoveryResult> {
    return this.discoverFromPath(this.builtInPath, true)
  }

  /**
   * Discover custom skills only
   */
  async discoverCustom(): Promise<SkillDiscoveryResult> {
    return this.discoverFromPath(this.customPath, false)
  }

  /**
   * Discover skills from a specific path
   */
  private async discoverFromPath(basePath: string, isBuiltIn: boolean): Promise<SkillDiscoveryResult> {
    const skills: SkillMetadata[] = []
    const errors: SkillValidationError[] = []
    const warnings: SkillWarning[] = []

    try {
      const glob = new Bun.Glob(SKILL_PATHS.globPattern)
      const files = glob.scanSync({ cwd: basePath, absolute: true })

      for (const filePath of files) {
        try {
          const content = await Bun.file(filePath).text()
          const { frontmatter } = parseFrontmatter(content)

          // Validate if enabled
          if (this.config.validateSchema) {
            const validationErrors = validateSkillFrontmatter(frontmatter, filePath)
            if (validationErrors.length > 0) {
              errors.push(...validationErrors)
              continue
            }
          }

          const fm = frontmatter as SkillFrontmatter
          const skillName = extractSkillName(filePath)

          // Verify name matches folder
          if (fm.name !== skillName) {
            errors.push({
              path: filePath,
              message: `Skill name '${fm.name}' does not match folder name '${skillName}'`,
              field: 'name',
            })
            continue
          }

          const metadata: SkillMetadata = {
            name: fm.name,
            description: fm.description,
            category: extractCategory(filePath, basePath),
            location: filePath,
            isBuiltIn,
          }

          skills.push(metadata)
        } catch (err) {
          errors.push({
            path: filePath,
            message: err instanceof Error ? err.message : 'Unknown error reading skill file',
          })
        }
      }
    } catch {
      // Path doesn't exist or is not accessible - not an error
    }

    return { skills, errors, warnings }
  }

  /**
   * Load full skill by name
   * Checks custom first, falls back to built-in
   */
  async load(skillName: string): Promise<Skill> {
    // Check full cache first
    if (this.fullCache.has(skillName)) {
      return this.fullCache.get(skillName)!
    }

    // Check metadata cache for location
    if (this.cache.has(skillName)) {
      const metadata = this.cache.get(skillName)!
      return this.loadFromPath(metadata.location)
    }

    // Try to find the skill
    // Custom first
    const customSkill = await this.findSkillInPath(skillName, this.customPath, false)
    if (customSkill) {
      this.fullCache.set(skillName, customSkill)
      return customSkill
    }

    // Built-in second
    if (this.config.includeBuiltIn) {
      const builtInSkill = await this.findSkillInPath(skillName, this.builtInPath, true)
      if (builtInSkill) {
        this.fullCache.set(skillName, builtInSkill)
        return builtInSkill
      }
    }

    throw new SkillNotFoundError(skillName)
  }

  /**
   * Load multiple skills by name
   */
  async loadMany(skillNames: string[]): Promise<Skill[]> {
    return Promise.all(skillNames.map((name) => this.load(name)))
  }

  /**
   * Find and load a skill from a specific base path
   */
  private async findSkillInPath(skillName: string, basePath: string, isBuiltIn: boolean): Promise<Skill | null> {
    try {
      const glob = new Bun.Glob(`**/${skillName}/${SKILL_PATHS.skillFile}`)
      const files = glob.scanSync({ cwd: basePath, absolute: true })

      for (const filePath of files) {
        const skill = await this.loadFromPath(filePath, isBuiltIn)
        if (skill.name === skillName) {
          return skill
        }
      }
    } catch {
      // Path doesn't exist
    }
    return null
  }

  /**
   * Load skill from a specific file path
   */
  private async loadFromPath(filePath: string, isBuiltIn?: boolean): Promise<Skill> {
    const content = await Bun.file(filePath).text()
    const { frontmatter, body } = parseFrontmatter(content)
    const fm = frontmatter as SkillFrontmatter

    const skillDir = filePath.replace(`/${SKILL_PATHS.skillFile}`, '')

    // Determine isBuiltIn if not provided
    const builtIn = isBuiltIn ?? filePath.includes(this.builtInPath)

    // Determine base path for category extraction
    const basePath = builtIn ? this.builtInPath : this.customPath

    // Discover resources
    const resources = await this.discoverResources(skillDir)

    const skill: Skill = {
      name: fm.name,
      description: fm.description,
      category: extractCategory(filePath, basePath),
      location: filePath,
      isBuiltIn: builtIn,
      frontmatter: fm,
      instructions: body,
      skillDir,
      resources,
    }

    this.fullCache.set(skill.name, skill)
    return skill
  }

  /**
   * Discover resources in skill directory
   */
  private async discoverResources(skillDir: string): Promise<SkillResources> {
    const resources: SkillResources = {
      scripts: [],
      references: [],
      assets: [],
    }

    const resourceDirs = [
      { dir: 'scripts', target: resources.scripts },
      { dir: 'references', target: resources.references },
      { dir: 'assets', target: resources.assets },
    ]

    for (const { dir, target } of resourceDirs) {
      try {
        const glob = new Bun.Glob('*')
        const dirPath = `${skillDir}/${dir}`
        const files = glob.scanSync({ cwd: dirPath, absolute: true })
        target.push(...files)
      } catch {
        // Directory doesn't exist
      }
    }

    return resources
  }

  /**
   * Generate prompt text for skill injection
   * Format: XML-like structure for LLM consumption
   */
  toPrompt(skills: Skill[] | SkillMetadata[]): string {
    if (skills.length === 0) {
      return ''
    }

    const skillEntries = skills
      .map((skill) => {
        const category = skill.category ? ` (category: ${skill.category})` : ''
        const isFullSkill = 'instructions' in skill

        if (isFullSkill) {
          const fullSkill = skill as Skill
          const allowedTools = fullSkill.frontmatter['allowed-tools']
            ? `\n    <allowed-tools>${fullSkill.frontmatter['allowed-tools']}</allowed-tools>`
            : ''

          return `  <skill name="${skill.name}"${category}>
    <description>${skill.description}</description>${allowedTools}
    <instructions>
${fullSkill.instructions}
    </instructions>
  </skill>`
        }

        // Metadata only (discovery phase)
        return `  <skill name="${skill.name}"${category}>
    <description>${skill.description}</description>
  </skill>`
      })
      .join('\n')

    return `<available_skills>
${skillEntries}
</available_skills>`
  }

  /**
   * Generate compact prompt for discovery phase
   * Lists only skill names and descriptions
   */
  toDiscoveryPrompt(skills: SkillMetadata[]): string {
    if (skills.length === 0) {
      return ''
    }

    const lines = skills.map((s) => {
      const cat = s.category ? ` [${s.category}]` : ''
      return `- ${s.name}${cat}: ${s.description}`
    })

    return `Available skills:\n${lines.join('\n')}`
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.cache.clear()
    this.fullCache.clear()
  }
}
