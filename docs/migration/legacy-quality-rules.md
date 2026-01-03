# Legacy DebateEngine Quality Rules

This document captures implicit quality rules extracted from the legacy `DebateEngine.ts` (847 lines) to ensure the new `DebatePattern` maintains behavioral parity.

## 1. Default Configuration

| Parameter | Value | Notes |
|-----------|-------|-------|
| mode | `'strong'` | Default debate mode |
| maxRounds | `10` | Maximum debate rounds |
| timeout | `300000` (5 min) | Execution timeout |
| toolPhases | `['rebuttal']` | WebSearch enabled during rebuttal |

## 2. Prompt Engineering Rules

### Initial Phase Prompt
```
Topic: ${topic}

You must present a clear position as an expert on this topic.
- Provide a specific recommendation
- Clearly explain the reasoning behind your choice
- Also mention potential risks
```

**Key Requirements:**
- Must provide specific recommendation (not vague)
- Must explain reasoning
- Must acknowledge risks

### Rebuttal Phase Prompt
```
Your role: Critical Reviewer
Point out problems, gaps, and underestimated risks in the above opinions.
- Find weaknesses even if you agree
- Avoid phrases like "Good point, but..."
- Provide specific counterexamples or failure scenarios
- Specify conditions under which the approach could fail
```

**Key Requirements:**
- Role is explicitly "Critical Reviewer"
- Must find weaknesses unconditionally
- Banned phrase: "Good point, but..."
- Must provide specific counterexamples
- Must specify failure conditions

### Rebuttal with WebSearch
When tools are enabled, additional instruction:
```
IMPORTANT: Before making factual claims, use the webSearch tool to verify:
- Service certifications (SOC2, HIPAA, etc.)
- Current pricing or feature availability
- Recent announcements or changes
- Technical specifications

Example: If you claim "Service X lacks SOC2", search to confirm this is current.
```

### Revised Phase Prompt
```
Considering other experts' rebuttals:
1. Revise your initial position if needed
2. Defend with stronger evidence if you maintain your position
3. Present your final recommendation
```

### Consensus Phase Prompt
```
Please summarize:
1. Points of agreement (what all experts agreed on)
2. Unresolved disagreements (where opinions still differ and each position)
3. Final recommendation (practical approach considering disagreements)
4. Cautions (risks raised in rebuttals that must be considered)
```

**Output Structure:** Must include all 4 sections.

## 3. Position Change Detection

**Heuristic:** Check for presence of change indicator phrases (case-insensitive):

```typescript
const changeIndicators = [
  'i have revised',
  'i now agree',
  'i changed my position',
  'reconsidering',
  'after reviewing',
  'i must acknowledge',
  'my position has evolved',
]
```

**Note:** Simple string matching, not semantic analysis.

## 4. Disagreement Extraction

**Algorithm:**
1. Split consensus by newlines
2. Find section containing "unresolved" or "disagreement"
3. Extract bullet points (lines starting with `-`)
4. Stop at "recommendation" or "caution" sections

```typescript
if (lowerLine.includes('unresolved') || lowerLine.includes('disagreement')) {
  inDisagreementSection = true
}
if (inDisagreementSection && line.trim().startsWith('-')) {
  disagreements.push(line.trim().substring(1).trim())
}
```

## 5. History Formatting

**Message Format:**
```
[role] content

---

[role] content
```

**Role Suffixes:**
- Initial: participant name only
- Rebuttal: `${name}(rebuttal)`
- Final: `${name}(final)`
- Consensus: `orchestrator`

## 6. XML Escaping

Skills use XML-like format. Escape characters:
```typescript
str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
```

## 7. Skill Prompt Structure

```xml
<skills_context>
<activation-phase>${phase}</activation-phase>
<purpose>Apply these skills while ${phaseContext}</purpose>
</skills_context>

<available_skills>
${discoveryBlocks}
</available_skills>

<activated_skill_contents>
${activatedContents}
</activated_skill_contents>
```

**Phase Contexts:**
| Phase | Purpose Text |
|-------|--------------|
| initial | "presenting your initial position" |
| rebuttal | "critiquing other positions" |
| revised | "revising your position" |
| consensus | "summarizing the debate" |

## 8. Tool Integration

**Tool-enabled phases:** Configured via `toolPhases` array (default: `['rebuttal']`)

**Native WebSearch:** When `useNativeWebSearch` is true, prompts include verification instructions.

**Custom Tools:** Checked via `isToolEnabledProvider()` type guard.

## 9. Streaming Behavior

**Event Order:**
1. `phase_start`
2. `round_start` (per participant)
3. `chunk` (multiple, per token)
4. `round_end` (includes full content + usage)
5. `phase_end`

**Consensus Phase:** Non-streaming (single `round_end` event).

## 10. Error Handling (Implicit)

**Skill Loading:** Silently catches errors and continues without skill.
```typescript
try {
  const skill = await this.skillLoader.load(name)
  skills.push(skill)
} catch {} // Silent failure
```

## Quality Regression Test Recommendations

### Test Cases Needed

1. **Position Change Detection**
   - Input with each change indicator phrase → should detect change
   - Input without indicators → should not detect change

2. **Disagreement Extraction**
   - Standard consensus format → extract correct disagreements
   - Missing section → return empty array
   - Multiple bullet points → extract all

3. **Prompt Generation**
   - Verify banned phrase instruction present in rebuttal
   - Verify 4-section structure in consensus prompt
   - Verify tool instructions when WebSearch enabled

4. **History Formatting**
   - Correct role suffixes per phase
   - Correct separator (`---`)

5. **Skill Injection**
   - XML escaping of special characters
   - Correct phase context mapping

### Golden Dataset Format

```typescript
interface GoldenCase {
  id: string
  description: string
  input: {
    topic: string
    mode: 'strong' | 'weak'
    participantResponses: Record<string, string[]>
  }
  expected: {
    positionChanges?: string[]
    disagreements?: string[]
    roundCount: number
    phaseSequence: DebatePhase[]
  }
}
```

## Migration Checklist

- [ ] Verify DEFAULT_CONFIG matches in DebatePattern
- [ ] Verify PROMPTS templates identical
- [ ] Verify position change detection logic
- [ ] Verify disagreement extraction algorithm
- [ ] Verify history formatting
- [ ] Verify skill prompt structure
- [ ] Verify streaming event order
- [ ] Add regression tests for each rule above
