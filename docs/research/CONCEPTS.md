# Core Concepts in Multi-Agent Debate

Key terminology and concepts for understanding multi-AI debate systems.

## Debate Modes

### Strong Debate
Full adversarial debate with explicit criticism and position revision.

**Phases:**
1. **Initial Position** - Each AI states their recommendation
2. **Rebuttal** - AIs criticize each other's positions
3. **Revised Position** - AIs update based on criticism
4. **Consensus** - Synthesize agreements and disagreements

**Characteristics:**
- Explicit adversarial prompting ("find weaknesses")
- Position changes are expected and tracked
- Produces detailed cautions and failure scenarios
- Higher time/cost, higher quality

### Weak Debate
Simple opinion sharing without structured criticism.

**Phases:**
1. **Initial Position** - Each AI states their view
2. **Consensus** - Summarize perspectives

**Characteristics:**
- Collaborative prompting ("share your perspective")
- Position changes are rare
- Quick consensus, less depth
- Lower time/cost, moderate quality

---

## Key Mechanisms

### Position Change
When an AI modifies their recommendation after receiving criticism.

**Detection Indicators:**
- "I have revised my position"
- "Reconsidering..."
- "After reviewing the rebuttals"
- "I now agree that..."

**Significance:**
- Proves genuine debate occurred (not just ensemble)
- Indicates effective critique
- Higher position change rate = more effective debate

### Unresolved Disagreement
Points where AIs maintain different positions after debate.

**Value:**
- More honest than forced consensus
- Highlights genuine trade-offs
- Informs decision-maker of risks

### Rebuttal
Structured criticism of another AI's position.

**Effective Rebuttal Prompts:**
```
Point out problems, gaps, and underestimated risks.
- Find weaknesses even if you agree
- Avoid "Good point, but..."
- Provide specific counterexamples
```

---

## Theoretical Foundations

### Society of Mind
**Origin:** Marvin Minsky (1986), adapted for LLMs by Du et al. (2023)

**Concept:**
Intelligence emerges from interaction of multiple "agents" with different perspectives.

**Application to Obora:**
Multiple AI models act as different "minds" that debate to produce collective intelligence.

### Adversarial Collaboration
**Origin:** Daniel Kahneman (2003)

**Concept:**
Researchers with opposing views work together to design experiments that could resolve their disagreement.

**Application to Obora:**
AIs with different recommendations collaboratively identify what evidence would change their position.

### Dialectical Reasoning
**Origin:** Hegel, applied to AI

**Concept:**
- **Thesis** - Initial position
- **Antithesis** - Opposing critique
- **Synthesis** - Revised understanding

**Application to Obora:**
Strong debate follows thesis (initial) → antithesis (rebuttal) → synthesis (revised/consensus).

---

## Quality Metrics

### Debate Quality Indicators

| Metric | Good Sign | Bad Sign |
|--------|-----------|----------|
| Position Changes | 1+ participants changed | No changes (echo chamber) |
| Rebuttal Specificity | Concrete counterexamples | Vague "but consider..." |
| Unresolved Count | Some genuine disagreements | 0 (forced consensus) |
| Caution Count | 5+ specific risks | Generic warnings |

### Comparison: Debate vs Ensemble

| Aspect | Debate | Ensemble |
|--------|--------|----------|
| Interaction | AIs respond to each other | Independent responses |
| Position Changes | Expected | None |
| Output | Synthesis with disagreements | Merged/averaged |
| Proof of Quality | Track position changes | Statistical |

---

## Model Heterogeneity

### Why Different Models Matter

| Model | Typical Strength |
|-------|------------------|
| Claude | Nuanced reasoning, safety awareness |
| GPT-4 | Broad knowledge, code generation |
| Gemini | Google ecosystem, multimodal |

### Heterogeneity Benefits
- Different training data = different blind spots
- Different RLHF = different value weightings
- Cross-critique reveals model-specific biases

### Homogeneity Risks
- Same model = same blind spots
- Agreement may indicate shared bias
- Less effective debate

---

## Prompt Engineering for Debate

### Effective Rebuttal Prompts
```
Your role: Critical Reviewer

Point out problems, gaps, and underestimated risks.
- Find weaknesses even if you agree
- Avoid phrases like "Good point, but..."
- Provide specific counterexamples or failure scenarios
- Specify conditions under which the approach could fail
```

### Ineffective Prompts
```
# Too weak - produces agreement
"Share your thoughts on this position"
"What do you think about this approach?"

# Too adversarial - produces nonsense criticism
"Completely destroy this argument"
"Find every possible flaw"
```

### Consensus Prompts
```
You are the debate moderator.

Summarize:
1. Points of agreement
2. Unresolved disagreements (maintain both positions)
3. Final recommendation
4. Cautions (risks raised in rebuttals)
```

---

## Limitations

### When Debate Fails

| Failure Mode | Cause | Mitigation |
|--------------|-------|------------|
| Echo Chamber | Same model, weak prompts | Use different models, strong prompts |
| Analysis Paralysis | Too many rebuttals | Limit rounds, force decision |
| False Consensus | Forced agreement | Explicitly preserve disagreements |
| Factual Errors | No verification | Add tool use (web search) |

### Not Suitable For

- Pure factual queries (use search)
- Creative tasks (different objective)
- Time-critical decisions (too slow)
- Tasks with single correct answer (no need for debate)
