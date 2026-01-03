# AgentSkills: Authoring Guide

AgentSkills are portable, stateless, and declarative instruction sets that enhance AI participants' behavior during obora debates. They allow you to define specialized roles, constraints, and methodologies that AIs should follow during different phases of a debate.

## Why use AgentSkills?

- **Specialization**: Transform a general-purpose AI into a specialized expert (e.g., Fact-Checker, Devil's Advocate).
- **Consistency**: Ensure all participants follow the same rigorous methodology.
- **Portability**: Share skills across different projects and AI providers.
- **Phased Behavior**: Activate different instructions based on the debate phase (Initial, Rebuttal, Revised, Consensus).

## Quick Start: Create your first skill in 5 minutes

To create a custom skill, follow these steps:

1. Create a directory for your skill: `.ai/skills/my-specialist/`
2. Create a `SKILL.md` file inside that directory.
3. Add the required frontmatter and instructions.

### Copy-Paste Template

```markdown
---
name: my-specialist
description: A brief description of what this specialist does and when to use it.
metadata:
  version: 1.0.0
  author: Your Name
  category: debate
---

# My Specialist Skill

You are a [Role Name] participating in a multi-AI debate.

## Your Goal
[Describe the primary objective of this skill]

## Instructions
1. [Step-by-step instruction 1]
2. [Step-by-step instruction 2]

## Response Format
[Specify how the AI should structure its output]
```

## Programmatic Usage

You can apply skills to all participants or specific ones using the `DebateEngine`.

```typescript
import { DebateEngine, ClaudeProvider, OpenAIProvider } from '@obora/core'

const engine = new DebateEngine({
  mode: 'strong',
  skills: {
    // Apply to all participants
    global: ['fact-checker'],
    // Apply to specific participants
    participants: {
      pro: ['persuasion'],
      con: ['devil-advocate'],
    }
  },
  // Optional: path to your custom skills
  skillsPath: '.ai/skills',
})

const result = await engine.run({
  topic: 'Should we migrate to microservices?',
  participants: [
    { name: 'pro', provider: new ClaudeProvider() },
    { name: 'con', provider: new OpenAIProvider() },
  ],
  orchestrator: new ClaudeProvider(),
})
```

## Security

### Permission Model

Skills can declare which tools they're allowed to use via the `allowed-tools` frontmatter field:

```yaml
---
name: fact-checker
description: Verifies claims using web search
allowed-tools: WebSearch
---
```

When `allowed-tools` is specified, only those tools can be invoked during skill execution.

### Checking Permissions

```typescript
import { checkToolPermission, getSkillPermissions } from '@obora/core'

const skill = await loader.load('fact-checker')
const permissions = getSkillPermissions(skill)
// { allowedTools: ['WebSearch'], networkAccess: true, ... }

const canUseWebSearch = checkToolPermission(skill, 'WebSearch')
// true

const canUseFileSystem = checkToolPermission(skill, 'FileSystem')
// false (not in allowed-tools)
```

### Audit Logging

Enable audit logging to track skill operations:

```typescript
import { createAuditLogger, type SkillAuditEvent } from '@obora/core'

const events: SkillAuditEvent[] = []
const logger = createAuditLogger((event) => events.push(event))

// Log when skills are loaded
logger.logLoad(skill)

// Log when skills are activated
logger.logActivate(skill, 'rebuttal')

// Log tool invocations
logger.logToolInvoke(skill, 'WebSearch', true)
```

### Security Best Practices

| Practice | Description |
|----------|-------------|
| **Least Privilege** | Only declare tools the skill actually needs in `allowed-tools` |
| **Source Verification** | Only load skills from trusted sources (built-in or verified custom paths) |
| **Input Validation** | Skills should not process untrusted user input directly in instructions |
| **No Secrets** | Never include API keys, credentials, or sensitive data in SKILL.md files |
| **Review Third-Party** | Carefully review any external skills before adding to your project |

### Security Configuration

```typescript
import { SkillLoader, DEFAULT_SECURITY_CONFIG } from '@obora/core'

const securityConfig = {
  ...DEFAULT_SECURITY_CONFIG,
  auditLogging: true,
  defaultPermissions: {
    allowedTools: [], // No tools by default
    networkAccess: false,
    fileSystemAccess: 'none',
  },
}

// Use with permission checks
const allowed = checkToolPermission(skill, 'WebSearch', securityConfig, auditSink)
```

## Documentation Reference

- [SPECIFICATION.md](./SPECIFICATION.md): Full schema reference for SKILL.md format.
- [AUTHORING.md](./AUTHORING.md): Step-by-step guide for creating high-quality skills.
- [EXAMPLES.md](./EXAMPLES.md): Walkthrough of existing built-in skills.
