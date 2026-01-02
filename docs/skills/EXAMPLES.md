# AgentSkills Examples

This document walks through the built-in skills in obora to illustrate different patterns and use cases.

## 1. Fact-Checker (Analysis with Tools)
**Path**: `packages/core/skills/debate/fact-checker/SKILL.md`

The Fact-Checker skill demonstrates how to use external tools to verify claims.

### Key Pattern: Tool Integration
```yaml
allowed-tools: WebSearch
```
By specifying `allowed-tools`, the skill signals to the `DebateEngine` that this participant requires access to the `WebSearch` tool during its turn.

### Key Pattern: Status-Based Analysis
The skill provides a specific set of statuses for the AI to use:
- Verified
- Partially Verified
- Unverified
- Disputed
- False

This ensures that the fact-checking results are consistent and easy to interpret.

## 2. Devil's Advocate (Critique Methodology)
**Path**: `packages/core/skills/debate/devil-advocate/SKILL.md`

This skill is designed for the Rebuttal phase. It forces the AI to be critical even when it agrees with the position.

### Key Pattern: Technique Taxonomy
The skill provides 5 specific techniques for the AI to use:
1. Assumption Hunting
2. Failure Scenario Generation
3. Alternative Exploration
4. Edge Case Identification
5. Stakeholder Perspective

By giving the AI a menu of techniques, it produces more diverse and thorough critiques.

## 3. Synthesizer (Consensus Building)
**Path**: `packages/core/skills/debate/synthesizer/SKILL.md`

Used during the Consensus phase, this skill focuses on bridging gaps.

### Key Pattern: Disagreement Preservation
```markdown
## Disagreement Preservation
- What disagreements are fundamental and should be documented?
- What trade-offs remain unresolved?
```
A crucial part of synthesis in obora is acknowledging that some disagreements are valuable and should be preserved rather than forced into a false consensus.

## 4. Source Validator (Multi-Dimensional Evaluation)
**Path**: `packages/core/skills/analysis/source-validator/SKILL.md`

This skill demonstrates a complex evaluation framework using a Markdown table.

### Key Pattern: Structured Evaluation Table
The skill instructs the AI to use a specific table format for its evaluation:
| Criterion | Rating | Notes |
|-----------|--------|-------|
| Authority | High/Medium/Low | ... |

This structure makes it easy for human readers and other AIs to quickly scan the credibility of a cited source.

---

For more information on authoring your own skills, see the [Authoring Guide](./AUTHORING.md).
