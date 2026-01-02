# Authoring Guide: Creating High-Quality Skills

Creating an effective AgentSkill requires a balance of clear role definition, precise instructions, and structured output requirements. This guide covers the process of creating and refining skills for obora debates.

## Step-by-Step Creation Process

### 1. Identify the Role and Phase
Determine what specific value the skill adds to the debate. Should it challenge arguments (Rebuttal phase), find consensus (Consensus phase), or provide deep analysis (Initial phase)?

Recommended Categories:
- **debate**: Core debate mechanics (e.g., `devil-advocate`, `synthesizer`).
- **analysis**: Deep dives into specific data or claims (e.g., `source-validator`).
- **domain**: Expertise in a specific field (e.g., `security-expert`, `cloud-architect`).
- **meta**: Skills that manage other skills or the debate process.

### 2. Define the Frontmatter
Start with the technical metadata. Ensure the `name` is kebab-case and matches your folder name.

```yaml
---
name: security-auditor
description: Audits proposed architectures for security vulnerabilities and compliance gaps.
metadata:
  category: domain
  version: 1.0.0
---
```

### 3. Write Core Instructions
Use clear, imperative language. Define:
- **Who you are**: The specific persona.
- **What you look for**: Triggers or patterns to identify.
- **Your methodology**: The steps you take to evaluate.

### 4. Specify Output Format
A structured output makes the AI's response more readable and helps other AIs (or the orchestrator) process the information. Use Markdown headers or block formats.

```markdown
## Response Format
Structure your audit as:
- **Risk ID**: [Identifier]
- **Severity**: [High/Medium/Low]
- **Vulnerability**: [Description]
- **Mitigation**: [Recommendation]
```

## Best Practices

- **Be Concise**: LLMs have context limits. Keep instructions focused on the specific skill.
- **Avoid Soft Language**: Instead of "You might want to check...", use "Verify...".
- **Focus on Edge Cases**: Good skills push AIs to look where they otherwise wouldn't.
- **Stateless Design**: Do not assume the AI remembers anything outside the current debate transcript.

## Testing and Debugging

### Using DebateEngine
The best way to test a skill is to run a small debate with it.

1. Create your skill in `.ai/skills/my-skill/SKILL.md`.
2. Run a test script:
```typescript
const engine = new DebateEngine({
  skillsPath: '.ai/skills',
  skills: { global: ['my-skill'] }
});
// Run and inspect output
```

### Debugging Tips
- **Unexpected Format**: If the AI ignores your response format, try adding an example to the skill instructions.
- **Skill Not Loading**: Check that the folder name matches the `name` in frontmatter exactly.
- **Conflicting Instructions**: If you use multiple skills, ensure they don't give contradictory instructions (e.g., one asking for brevity and another for detail).

## Refinement Loop
1. **Draft**: Create the initial `SKILL.md`.
2. **Execute**: Run a debate using the skill.
3. **Analyze**: Did the AI follow the instructions? Was the output useful?
4. **Iterate**: Refine the instructions based on observed behavior.
