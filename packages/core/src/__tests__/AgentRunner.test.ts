import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AgentRunner } from '../agents/runner'

const TEST_DIR = join(import.meta.dir, '.test-agent-runner')
const CUSTOM_AGENTS_DIR = join(TEST_DIR, 'agents')
const CUSTOM_SKILLS_DIR = join(TEST_DIR, 'skills')

function createRunner() {
  return new AgentRunner({
    customAgentsPath: CUSTOM_AGENTS_DIR,
    customSkillsPath: CUSTOM_SKILLS_DIR,
  })
}

const TEST_SKILL = `---
name: test-skill
description: A test skill
---

# Test Skill Instructions
`

const AGENT_WITH_SKILLS = `---
name: test-agent
description: An agent that uses skills
agentType: utility
persona:
  role: Test Agent
  tone: neutral
  expertise:
    - testing
invocation:
  mode: delegation
skills: [test-skill, nonexistent-skill]
---

# Test Agent Instructions

Use your skills to complete the task.
`

const AGENT_WITHOUT_SKILLS = `---
name: simple-agent
description: An agent without skills
agentType: utility
persona:
  role: Simple Agent
  tone: neutral
  expertise:
    - basic
invocation:
  mode: delegation
---

# Simple Agent Instructions

Just do the task.
`

const AGENT_WITH_MISSING_SKILLS = `---
name: agent-missing-skills
description: An agent with missing skills
agentType: utility
persona:
  role: Test Agent
  tone: neutral
  expertise:
    - testing
invocation:
  mode: delegation
skills: [nonexistent-skill-1, nonexistent-skill-2]
---

# Agent with missing skills

Should still work, just without skills.
`

async function createAgentFile(basePath: string, category: string | null, name: string, content: string) {
  const agentDir = category ? join(basePath, category) : basePath
  await mkdir(agentDir, { recursive: true })
  await writeFile(join(agentDir, `${name}.md`), content)
}

async function createSkillFile(basePath: string, category: string | null, name: string, content: string) {
  const skillDir = category ? join(basePath, category, name) : join(basePath, name)
  await mkdir(skillDir, { recursive: true })
  await writeFile(join(skillDir, 'SKILL.md'), content)
}

describe('AgentRunner - Skill Loading', () => {
  beforeEach(async () => {
    await mkdir(CUSTOM_AGENTS_DIR, { recursive: true })
    await mkdir(CUSTOM_SKILLS_DIR, { recursive: true })
  })

  afterEach(async () => {
    try {
      await rm(TEST_DIR, { recursive: true, force: true })
    } catch {}
  })

  describe('invoke with skills', () => {
    test('loads required skills for agent', async () => {
      await createSkillFile(CUSTOM_SKILLS_DIR, null, 'test-skill', TEST_SKILL)
      await createAgentFile(CUSTOM_AGENTS_DIR, 'test', 'test-agent', AGENT_WITH_SKILLS)

      const runner = createRunner()
      const result = await runner.invoke('test-agent', 'Test task')

      expect(result.success).toBe(true)
    })

    test('agent without skills works normally', async () => {
      await createAgentFile(CUSTOM_AGENTS_DIR, 'test', 'simple-agent', AGENT_WITHOUT_SKILLS)

      const runner = createRunner()
      const result = await runner.invoke('simple-agent', 'Simple task')

      expect(result.success).toBe(true)
    })

    test('silently skips missing skills and continues', async () => {
      await createAgentFile(CUSTOM_AGENTS_DIR, 'test', 'agent-missing-skills', AGENT_WITH_MISSING_SKILLS)

      const runner = createRunner()
      const result = await runner.invoke('agent-missing-skills', 'Should still work')

      expect(result.success).toBe(true)
    })

    test('loads available skills and skips missing ones', async () => {
      await createSkillFile(CUSTOM_SKILLS_DIR, null, 'test-skill', TEST_SKILL)
      await createAgentFile(CUSTOM_AGENTS_DIR, 'test', 'test-agent', AGENT_WITH_SKILLS)

      const runner = createRunner()
      const result = await runner.invoke('test-agent', 'Test with partial skills')

      expect(result.success).toBe(true)
    })
  })

  describe('agent metadata', () => {
    test('agent has skills in frontmatter', async () => {
      await createSkillFile(CUSTOM_SKILLS_DIR, null, 'test-skill', TEST_SKILL)
      await createAgentFile(CUSTOM_AGENTS_DIR, 'test', 'test-agent', AGENT_WITH_SKILLS)

      const runner = createRunner()
      const agent = await runner.getAgent('test-agent')

      expect(agent).not.toBeNull()
      expect(agent!.frontmatter.skills).toContain('test-skill')
    })

    test('agent without skills has no skill section', async () => {
      await createAgentFile(CUSTOM_AGENTS_DIR, 'test', 'simple-agent', AGENT_WITHOUT_SKILLS)

      const runner = createRunner()
      const agent = await runner.getAgent('simple-agent')

      expect(agent).not.toBeNull()
      expect(agent!.frontmatter.skills).toBeUndefined()
    })
  })
})
