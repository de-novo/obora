import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SkillLoader, SkillNotFoundError } from '../skills/loader'

const TEST_DIR = join(import.meta.dir, '.test-skills')
const CUSTOM_SKILLS_DIR = join(TEST_DIR, 'custom')

const VALID_SKILL_CONTENT = `---
name: test-skill
description: A test skill for unit testing
license: MIT
metadata:
  version: "1.0.0"
  author: test
---

# Test Skill

This is a test skill for unit testing.
`

const SKILL_WITH_TOOLS = `---
name: tool-skill
description: A skill with allowed tools
allowed-tools: WebSearch FileRead
---

# Tool Skill

This skill has allowed tools.
`

async function createSkillFile(basePath: string, category: string | null, name: string, content: string) {
  const skillDir = category ? join(basePath, category, name) : join(basePath, name)
  await mkdir(skillDir, { recursive: true })
  await writeFile(join(skillDir, 'SKILL.md'), content)
  return skillDir
}

describe('SkillLoader', () => {
  beforeEach(async () => {
    await mkdir(CUSTOM_SKILLS_DIR, { recursive: true })
  })

  afterEach(async () => {
    try {
      await rm(TEST_DIR, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('discoverBuiltIn', () => {
    test('discovers built-in skills', async () => {
      const loader = new SkillLoader()
      const result = await loader.discoverBuiltIn()

      expect(result.skills.length).toBeGreaterThan(0)
      expect(result.errors).toHaveLength(0)

      const factChecker = result.skills.find((s) => s.name === 'fact-checker')
      expect(factChecker).toBeDefined()
      expect(factChecker?.category).toBe('debate')
      expect(factChecker?.isBuiltIn).toBe(true)
    })

    test('discovers all expected built-in skills', async () => {
      const loader = new SkillLoader()
      const result = await loader.discoverBuiltIn()

      const skillNames = result.skills.map((s) => s.name)
      expect(skillNames).toContain('fact-checker')
      expect(skillNames).toContain('devil-advocate')
      expect(skillNames).toContain('synthesizer')
      expect(skillNames).toContain('source-validator')
      expect(skillNames).toContain('create-skill')
    })
  })

  describe('discoverCustom', () => {
    test('discovers custom skills from configured path', async () => {
      await createSkillFile(CUSTOM_SKILLS_DIR, 'testing', 'test-skill', VALID_SKILL_CONTENT)

      const loader = new SkillLoader({
        customSkillsPath: CUSTOM_SKILLS_DIR,
        includeBuiltIn: false,
      })
      const result = await loader.discoverCustom()

      expect(result.skills).toHaveLength(1)
      const skill = result.skills[0]!
      expect(skill.name).toBe('test-skill')
      expect(skill.category).toBe('testing')
      expect(skill.isBuiltIn).toBe(false)
    })

    test('returns empty when custom path does not exist', async () => {
      const loader = new SkillLoader({
        customSkillsPath: '/nonexistent/path',
        includeBuiltIn: false,
      })
      const result = await loader.discoverCustom()

      expect(result.skills).toHaveLength(0)
      expect(result.errors).toHaveLength(0)
    })

    test('handles skills without category', async () => {
      await createSkillFile(
        CUSTOM_SKILLS_DIR,
        null,
        'root-skill',
        VALID_SKILL_CONTENT.replace('test-skill', 'root-skill'),
      )

      const loader = new SkillLoader({
        customSkillsPath: CUSTOM_SKILLS_DIR,
        includeBuiltIn: false,
      })
      const result = await loader.discoverCustom()

      expect(result.skills).toHaveLength(1)
      const skill = result.skills[0]!
      expect(skill.name).toBe('root-skill')
      expect(skill.category).toBeNull()
    })
  })

  describe('discover', () => {
    test('merges custom and built-in skills', async () => {
      await createSkillFile(
        CUSTOM_SKILLS_DIR,
        'custom',
        'my-skill',
        VALID_SKILL_CONTENT.replace('test-skill', 'my-skill'),
      )

      const loader = new SkillLoader({
        customSkillsPath: CUSTOM_SKILLS_DIR,
        includeBuiltIn: true,
      })
      const result = await loader.discover()

      const customSkill = result.skills.find((s) => s.name === 'my-skill')
      const builtInSkill = result.skills.find((s) => s.name === 'fact-checker')

      expect(customSkill).toBeDefined()
      expect(customSkill?.isBuiltIn).toBe(false)
      expect(builtInSkill).toBeDefined()
      expect(builtInSkill?.isBuiltIn).toBe(true)
    })

    test('custom skills override built-in with same name', async () => {
      const customFactChecker = `---
name: fact-checker
description: Custom fact checker override
---

# Custom Fact Checker
`
      await createSkillFile(CUSTOM_SKILLS_DIR, 'debate', 'fact-checker', customFactChecker)

      const loader = new SkillLoader({
        customSkillsPath: CUSTOM_SKILLS_DIR,
        includeBuiltIn: true,
      })
      const result = await loader.discover()

      const factCheckers = result.skills.filter((s) => s.name === 'fact-checker')
      expect(factCheckers).toHaveLength(1)
      const factChecker = factCheckers[0]!
      expect(factChecker.description).toBe('Custom fact checker override')
      expect(factChecker.isBuiltIn).toBe(false)

      const overrideWarning = result.warnings.find((w) => w.type === 'override' && w.skillName === 'fact-checker')
      expect(overrideWarning).toBeDefined()
    })

    test('warns on duplicate custom skills', async () => {
      await createSkillFile(
        CUSTOM_SKILLS_DIR,
        'cat1',
        'dupe-skill',
        VALID_SKILL_CONTENT.replace('test-skill', 'dupe-skill'),
      )
      await createSkillFile(
        CUSTOM_SKILLS_DIR,
        'cat2',
        'dupe-skill',
        VALID_SKILL_CONTENT.replace('test-skill', 'dupe-skill'),
      )

      const loader = new SkillLoader({
        customSkillsPath: CUSTOM_SKILLS_DIR,
        includeBuiltIn: false,
      })
      const result = await loader.discover()

      expect(result.skills.filter((s) => s.name === 'dupe-skill')).toHaveLength(1)
      expect(result.warnings.some((w) => w.type === 'duplicate' && w.skillName === 'dupe-skill')).toBe(true)
    })
  })

  describe('load', () => {
    test('loads built-in skill by name', async () => {
      const loader = new SkillLoader()
      const skill = await loader.load('fact-checker')

      expect(skill.name).toBe('fact-checker')
      expect(skill.frontmatter.name).toBe('fact-checker')
      expect(skill.instructions).toContain('Fact-Checker Skill')
      expect(skill.frontmatter['allowed-tools']).toBe('WebSearch')
    })

    test('loads custom skill by name', async () => {
      await createSkillFile(CUSTOM_SKILLS_DIR, 'testing', 'test-skill', VALID_SKILL_CONTENT)

      const loader = new SkillLoader({
        customSkillsPath: CUSTOM_SKILLS_DIR,
      })
      const skill = await loader.load('test-skill')

      expect(skill.name).toBe('test-skill')
      expect(skill.isBuiltIn).toBe(false)
      expect(skill.instructions).toContain('This is a test skill')
    })

    test('throws SkillNotFoundError for unknown skill', async () => {
      const loader = new SkillLoader()

      expect(loader.load('nonexistent-skill')).rejects.toThrow(SkillNotFoundError)
    })

    test('custom skill takes priority over built-in', async () => {
      const customFactChecker = `---
name: fact-checker
description: Custom override
---

# Custom Implementation
`
      await createSkillFile(CUSTOM_SKILLS_DIR, 'debate', 'fact-checker', customFactChecker)

      const loader = new SkillLoader({
        customSkillsPath: CUSTOM_SKILLS_DIR,
      })
      const skill = await loader.load('fact-checker')

      expect(skill.description).toBe('Custom override')
      expect(skill.isBuiltIn).toBe(false)
    })

    test('caches loaded skills', async () => {
      const loader = new SkillLoader()

      const skill1 = await loader.load('fact-checker')
      const skill2 = await loader.load('fact-checker')

      expect(skill1).toBe(skill2)
    })
  })

  describe('loadMany', () => {
    test('loads multiple skills', async () => {
      const loader = new SkillLoader()
      const skills = await loader.loadMany(['fact-checker', 'devil-advocate'])

      expect(skills).toHaveLength(2)
      expect(skills.map((s) => s.name)).toContain('fact-checker')
      expect(skills.map((s) => s.name)).toContain('devil-advocate')
    })
  })

  describe('toPrompt', () => {
    test('generates XML prompt for full skills', async () => {
      const loader = new SkillLoader()
      const skills = await loader.loadMany(['fact-checker'])
      const prompt = loader.toPrompt(skills)

      expect(prompt).toContain('<available_skills>')
      expect(prompt).toContain('</available_skills>')
      expect(prompt).toContain('<skill name="fact-checker"')
      expect(prompt).toContain('<description>')
      expect(prompt).toContain('<instructions>')
      expect(prompt).toContain('<allowed-tools>WebSearch</allowed-tools>')
    })

    test('generates XML prompt for metadata only', async () => {
      const loader = new SkillLoader()
      const result = await loader.discoverBuiltIn()
      const prompt = loader.toPrompt(result.skills)

      expect(prompt).toContain('<available_skills>')
      expect(prompt).toContain('<skill name="fact-checker"')
      expect(prompt).not.toContain('<instructions>')
    })

    test('returns empty string for empty skills array', () => {
      const loader = new SkillLoader()
      const prompt = loader.toPrompt([])

      expect(prompt).toBe('')
    })
  })

  describe('toDiscoveryPrompt', () => {
    test('generates compact discovery prompt', async () => {
      const loader = new SkillLoader()
      const result = await loader.discoverBuiltIn()
      const prompt = loader.toDiscoveryPrompt(result.skills)

      expect(prompt).toContain('Available skills:')
      expect(prompt).toContain('- fact-checker [debate]:')
      expect(prompt).toContain('- devil-advocate [debate]:')
    })
  })

  describe('validation', () => {
    test('reports error for invalid skill name pattern', async () => {
      const invalidSkill = `---
name: Invalid_Name
description: Has invalid name
---
`
      await createSkillFile(CUSTOM_SKILLS_DIR, null, 'Invalid_Name', invalidSkill)

      const loader = new SkillLoader({
        customSkillsPath: CUSTOM_SKILLS_DIR,
        includeBuiltIn: false,
        validateSchema: true,
      })
      const result = await loader.discoverCustom()

      expect(result.skills).toHaveLength(0)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]!.field).toBe('name')
    })

    test('reports error when name does not match folder', async () => {
      const mismatchSkill = `---
name: different-name
description: Name does not match folder
---
`
      await createSkillFile(CUSTOM_SKILLS_DIR, null, 'folder-name', mismatchSkill)

      const loader = new SkillLoader({
        customSkillsPath: CUSTOM_SKILLS_DIR,
        includeBuiltIn: false,
      })
      const result = await loader.discoverCustom()

      expect(result.skills).toHaveLength(0)
      expect(result.errors.some((e) => e.message.includes('does not match folder name'))).toBe(true)
    })

    test('skips validation when disabled', async () => {
      const invalidSkill = `---
name: Invalid_Name
description: Has invalid name
---
`
      await createSkillFile(CUSTOM_SKILLS_DIR, null, 'Invalid_Name', invalidSkill)

      const loader = new SkillLoader({
        customSkillsPath: CUSTOM_SKILLS_DIR,
        includeBuiltIn: false,
        validateSchema: false,
      })
      const result = await loader.discoverCustom()

      expect(result.errors).toHaveLength(0)
    })
  })

  describe('clearCache', () => {
    test('clears cached skills', async () => {
      const loader = new SkillLoader()

      await loader.load('fact-checker')
      loader.clearCache()

      const result = await loader.discoverBuiltIn()
      expect(result.skills.length).toBeGreaterThan(0)
    })
  })

  describe('config', () => {
    test('excludes built-in skills when configured', async () => {
      const loader = new SkillLoader({
        includeBuiltIn: false,
      })
      const result = await loader.discover()

      expect(result.skills.every((s) => !s.isBuiltIn)).toBe(true)
    })
  })
})
