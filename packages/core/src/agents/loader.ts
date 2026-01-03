/**
 * AgentLoader - Discovery and Loading System for Obora Agents
 *
 * Supports:
 * - Built-in agents (bundled with @obora/core)
 * - Custom agents (user's .ai/agents/ directory)
 * - Progressive disclosure: metadata-only for discovery, full for execution
 */

import { parse as parseYaml } from 'yaml'
import {
  AGENT_PATHS,
  type Agent,
  type AgentContext,
  type AgentFrontmatter,
  type AgentMetadata,
  type AgentValidationError,
  type AgentValidationResult,
} from './types'

// ============================================================================
// Parsing Functions
// ============================================================================

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

function extractAgentName(filePath: string): string {
  const parts = filePath.split('/')
  const agentName = parts[parts.length - 2]
  if (!agentName) {
    throw new Error(`Invalid agent path: ${filePath}`)
  }
  return agentName
}

function extractCategory(filePath: string, basePath: string): string | null {
  const normalizedFile = filePath.replace(/\\/g, '/')
  const normalizedBase = basePath.replace(/\\/g, '/')
  const relativePath = normalizedFile.replace(normalizedBase, '').replace(/^\//, '')
  const parts = relativePath.split('/')

  if (parts.length >= 3 && parts[0]) {
    return parts[0]
  }
  return null
}

// ============================================================================
// Validation
// ============================================================================

function validateFrontmatter(data: unknown, path: string): AgentValidationResult {
  const errors: AgentValidationError[] = []
  const warnings: string[] = []

  if (typeof data !== 'object' || data === null) {
    return { valid: false, errors: [{ field: 'frontmatter', message: 'Must be an object', value: data }], warnings: [] }
  }

  const obj = data as Record<string, unknown>

  // Required fields
  if (typeof obj.name !== 'string' || !obj.name) {
    errors.push({ field: 'name', message: 'name is required and must be a non-empty string' })
  } else if (!/^[a-z][a-z0-9-]*$/.test(obj.name)) {
    errors.push({ field: 'name', message: 'name must be kebab-case (lowercase letters, numbers, hyphens only)' })
  }

  if (typeof obj.description !== 'string' || !obj.description) {
    errors.push({ field: 'description', message: 'description is required and must be a non-empty string' })
  }

  // Validate agentType
  const validTypes = ['debate', 'analysis', 'research', 'utility', 'custom']
  if (typeof obj.agentType !== 'string' || !validTypes.includes(obj.agentType)) {
    errors.push({ field: 'agentType', message: `agentType must be one of: ${validTypes.join(', ')}` })
  }

  // Validate persona
  if (typeof obj.persona !== 'object' || obj.persona === null) {
    errors.push({ field: 'persona', message: 'persona is required' })
  } else {
    const persona = obj.persona as Record<string, unknown>
    if (!persona.role || typeof persona.role !== 'string') {
      errors.push({ field: 'persona.role', message: 'persona.role is required' })
    }
  }

  // Validate invocation
  if (typeof obj.invocation !== 'object' || obj.invocation === null) {
    errors.push({ field: 'invocation', message: 'invocation is required' })
  } else {
    const invocation = obj.invocation as Record<string, unknown>
    const validModes = ['delegation', 'handoff', 'parallel']
    if (!validModes.includes(invocation.mode as string)) {
      errors.push({ field: 'invocation.mode', message: `invocation.mode must be one of: ${validModes.join(', ')}` })
    }
  }

  // Warnings for optional fields
  if (!obj.version) {
    warnings.push('version is recommended for versioning agents')
  }
  if (!obj.author) {
    warnings.push('author is recommended for attribution')
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ============================================================================
// AgentLoader Class
// ============================================================================

export class AgentLoader {
  private builtInPath: string
  private customPath: string
  private metadataCache: Map<string, AgentMetadata> = new Map()
  private fullCache: Map<string, Agent> = new Map()

  constructor(config: { customAgentsPath?: string } = {}) {
    const currentFile = import.meta.url.replace('file://', '')
    const packageRoot = currentFile.replace(/\/src\/agents\/loader\.ts$/, '')
    this.builtInPath = `${packageRoot}/${AGENT_PATHS.builtin}`
    this.customPath = config.customAgentsPath || `${process.cwd()}/${AGENT_PATHS.custom}`
  }

  /**
   * Discover all available agents
   */
  async discover(): Promise<AgentMetadata[]> {
    const agents: AgentMetadata[] = []
    const seen = new Map<string, string>()

    // Custom agents (higher priority)
    const customResult = await this.discoverFromPath(this.customPath, false)
    for (const agent of customResult) {
      if (!seen.has(agent.name)) {
        seen.set(agent.name, agent.location)
        agents.push(agent)
        this.metadataCache.set(agent.name, agent)
      }
    }

    // Built-in agents
    const builtInResult = await this.discoverFromPath(this.builtInPath, true)
    for (const agent of builtInResult) {
      if (!seen.has(agent.name)) {
        seen.set(agent.name, agent.location)
        agents.push(agent)
        this.metadataCache.set(agent.name, agent)
      }
    }

    return agents
  }

  /**
   * Discover agents from a specific path
   */
  private async discoverFromPath(basePath: string, isBuiltIn: boolean): Promise<AgentMetadata[]> {
    const agents: AgentMetadata[] = []

    try {
      const glob = new Bun.Glob(AGENT_PATHS.globPattern)
      const files = glob.scanSync({ cwd: basePath, absolute: true })

      for (const filePath of files) {
        try {
          const content = await Bun.file(filePath).text()
          const { frontmatter } = parseFrontmatter(content)
          const validation = validateFrontmatter(frontmatter, filePath)

          if (!validation.valid) {
            console.warn(`Invalid agent at ${filePath}:`, validation.errors)
            continue
          }

          const fm = frontmatter as AgentFrontmatter

          const metadata: AgentMetadata = {
            name: fm.name,
            description: fm.description,
            agentType: fm.agentType,
            category: extractCategory(filePath, basePath),
            invocationMode: fm.invocation.mode,
            location: filePath,
            isBuiltIn,
            version: fm.version,
          }

          agents.push(metadata)
        } catch (err) {
          console.error(`Error loading agent from ${filePath}:`, err)
        }
      }
    } catch {
      // Path doesn't exist
    }

    return agents
  }

  /**
   * Load full agent by name
   */
  async load(agentName: string): Promise<Agent> {
    // Check full cache
    if (this.fullCache.has(agentName)) {
      return this.fullCache.get(agentName)!
    }

    // Check metadata cache
    if (this.metadataCache.has(agentName)) {
      const metadata = this.metadataCache.get(agentName)!
      return this.loadFromPath(metadata.location)
    }

    // Try to find
    const customAgent = await this.findInPath(agentName, this.customPath, false)
    if (customAgent) {
      this.fullCache.set(agentName, customAgent)
      return customAgent
    }

    const builtInAgent = await this.findInPath(agentName, this.builtInPath, true)
    if (builtInAgent) {
      this.fullCache.set(agentName, builtInAgent)
      return builtInAgent
    }

    throw new Error(`Agent '${agentName}' not found`)
  }

  /**
   * Load agent from specific path
   */
  private async loadFromPath(filePath: string): Promise<Agent> {
    const content = await Bun.file(filePath).text()
    const { frontmatter, body } = parseFrontmatter(content)
    const fm = frontmatter as AgentFrontmatter

    const agentDir = filePath.replace(`/${AGENT_PATHS.agentFile}`, '')
    const basePath = filePath.includes(this.builtInPath) ? this.builtInPath : this.customPath

    const agent: Agent = {
      name: fm.name,
      description: fm.description,
      agentType: fm.agentType,
      category: extractCategory(filePath, basePath),
      invocationMode: fm.invocation.mode,
      location: filePath,
      isBuiltIn: filePath.includes(this.builtInPath),
      version: fm.version,
      frontmatter: fm,
      instructions: body,
      agentDir,
      resources: await this.discoverResources(agentDir),
    }

    this.fullCache.set(agent.name, agent)
    return agent
  }

  /**
   * Find and load agent from path
   */
  private async findInPath(agentName: string, basePath: string, isBuiltIn: boolean): Promise<Agent | null> {
    try {
      const glob = new Bun.Glob(`**/${agentName}/${AGENT_PATHS.agentFile}`)
      const files = glob.scanSync({ cwd: basePath, absolute: true })

      for (const filePath of files) {
        const agent = await this.loadFromPath(filePath)
        if (agent.name === agentName) {
          return agent
        }
      }
    } catch {
      // Path doesn't exist
    }
    return null
  }

  /**
   * Discover resources in agent directory
   */
  private async discoverResources(agentDir: string): Promise<Agent['resources']> {
    const resources: Agent['resources'] = {
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
        const dirPath = `${agentDir}/${dir}`
        const files = glob.scanSync({ cwd: dirPath, absolute: true })
        target.push(...files)
      } catch {
        // Directory doesn't exist
      }
    }

    return resources
  }

  /**
   * Generate prompt for agent invocation
   */
  toPrompt(agent: Agent, context: AgentContext): string {
    const fm = agent.frontmatter

    const xml = `
<agent name="${agent.name}" type="${fm.agentType}" mode="${fm.invocation.mode}">
  <role>${fm.persona.role}</role>
  <tone>${fm.persona.tone}</tone>
  <expertise>
${fm.persona.expertise.map((e) => `    - ${e}`).join('\n')}
  </expertise>
  
  <instructions>
${agent.instructions}
  </instructions>
  
  <task>${context.task}</task>
  
  <context>
    <session_id>${context.sessionId}</session_id>
${context.parentSessionId ? `    <parent_session>${context.parentSessionId}</parent_session>` : ''}
${context.history ? `    <history_length>${context.history.length}</history_length>` : ''}
${context.activeFiles?.length ? `    <active_files>${context.activeFiles.join(', ')}</active_files>` : ''}
  </context>
  
  <output_format>
    <type>${fm.output?.type || 'text'}</type>
  </output_format>
</agent>
    `.trim()

    return xml
  }

  /**
   * Generate discovery prompt (lightweight)
   */
  toDiscoveryPrompt(agents: AgentMetadata[]): string {
    if (agents.length === 0) {
      return 'No agents available.'
    }

    const lines = agents.map((a) => {
      const category = a.category ? ` [${a.category}]` : ''
      const mode = ` (${a.invocationMode})`
      return `- ${a.name}${category}${mode}: ${a.description}`
    })

    return `Available agents:\n${lines.join('\n')}`
  }

  /**
   * Clear caches
   */
  clearCache(): void {
    this.metadataCache.clear()
    this.fullCache.clear()
  }

  /**
   * Get agent categories
   */
  async getCategories(): Promise<string[]> {
    const agents = await this.discover()
    const categories = new Set<string>()

    for (const agent of agents) {
      if (agent.category) {
        categories.add(agent.category)
      }
    }

    return Array.from(categories)
  }

  /**
   * Find agents by type
   */
  async findByType(type: Agent['agentType']): Promise<Agent[]> {
    const agents = await this.discover()
    const matching = agents.filter((a) => a.agentType === type)
    return Promise.all(matching.map((m) => this.load(m.name)))
  }

  /**
   * Find agents by trigger condition
   */
  async findByTrigger(trigger: string): Promise<Agent[]> {
    const agents = await this.discover()
    const matching: Agent[] = []

    for (const metadata of agents) {
      const agent = await this.load(metadata.name)
      const triggers = agent.frontmatter.triggers || []

      const matches = triggers.some((t) => {
        if (t.type === 'always') return true
        if (t.type === 'event' && t.event === trigger) return true
        if (t.type === 'phase' && t.phase === trigger) return true
        return false
      })

      if (matches) {
        matching.push(agent)
      }
    }

    return matching
  }
}

// ============================================================================
// Export
// ============================================================================

export { parseFrontmatter, extractAgentName, extractCategory, validateFrontmatter }
