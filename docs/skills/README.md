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

## Documentation Reference

- [SPECIFICATION.md](./SPECIFICATION.md): Full schema reference for SKILL.md format.
- [AUTHORING.md](./AUTHORING.md): Step-by-step guide for creating high-quality skills.
- [EXAMPLES.md](./EXAMPLES.md): Walkthrough of existing built-in skills.
