# AgentSkills Specification

This document defines the technical specification for AgentSkills used in the obora project. AgentSkills follow a subset of the [AgentSkills specification](https://github.com/agentskills/agentskills).

## Skill File Structure

Each skill must be contained in its own directory. The directory name must match the skill name.

```text
skill-name/
└── SKILL.md      # Required: Main skill definition
```

### Skill Paths
- **Built-in skills**: `packages/core/skills/`
- **Custom skills**: `.ai/skills/` (relative to project root)
- **Discovery**: The system uses the glob pattern `**/SKILL.md` to find skills within these directories.

## SKILL.md Format

A skill definition file consists of a YAML frontmatter section and a Markdown body containing instructions.

### Frontmatter Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | 1-64 chars, kebab-case (`/^[a-z0-9]+(-[a-z0-9]+)*$/`). Must match parent folder. |
| `description` | `string` | Yes | 1-1024 chars. Used for discovery and matching. |
| `license` | `string` | No | License identifier (e.g., "MIT", "Apache-2.0"). |
| `compatibility` | `string` | No | Max 500 chars. Notes on model or system compatibility. |
| `allowed-tools`| `string` | No | Space-separated list of tool names (e.g., "WebSearch"). |
| `metadata` | `object` | No | Arbitrary key-value metadata. |

#### Metadata Fields
Commonly used metadata fields:
- `version`: Semver recommended.
- `author`: Skill author name or identifier.
- `category`: Organizational category (e.g., "debate", "analysis").
- `builtin`: Boolean indicating if it's a core skill.

### Instructions Body
The content following the frontmatter is the instruction set provided to the AI. It should be written in clear Markdown and typically includes:
- Role definition
- Activation conditions
- Methodologies or processes
- Response format requirements
- Examples

## Validation Rules

The `SkillLoader` enforces the following constraints:

1. **Name**:
   - Minimum 1 character, maximum 64 characters.
   - Pattern: lowercase letters, numbers, and hyphens only.
2. **Description**:
   - Minimum 1 character, maximum 1024 characters.
3. **Compatibility**:
   - Maximum 500 characters.
4. **Folder Match**:
   - The `name` field in frontmatter must match the name of the parent directory.

## Design Principles

1. **Stateless**: Skills must not depend on runtime state. They receive context through the conversation history.
2. **Declarative**: Define *what* behavior is expected, not *how* to implement it.
3. **Portable**: Skills should be designed to work across different AI providers.
