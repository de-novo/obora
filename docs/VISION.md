# Obora Vision

## Core Value

**"Combination of AIs"**

Combine multiple AIs to produce better results.

---

## Three Pillars

### 1. Agent + Model

Assign the optimal AI model to each agent.

```yaml
# Example
web-search:
  model: gemini      # Built-in search

coder:
  model: codex       # Coding specialist

analyst:
  model: claude      # Analysis/reasoning
```

- Use the best AI for each task
- No vendor lock-in
- Easy to add new models

### 2. Multi-AI Perspective

Leverage multiple AI perspectives for better outcomes.

- **Debate**: Challenge and revise each other for better conclusions
- **Cross-check**: Reduce errors through cross-validation
- **Ensemble**: Synthesize diverse perspectives

### 3. Workflow

Define and enforce agent combinations.

```yaml
# Example: Code review workflow
steps:
  - agent: security-scanner
    required: true
  - agent: code-reviewer
    required: true
  - agent: approval
    mode: debate
```

- **Free mode**: Use freely without workflows
- **Workflow mode**: Enforce defined sequences and required steps

---

## Design Principles

1. **Combination is key** - Multiple AIs, not a single AI
2. **Flexibility** - Works with or without workflows
3. **Openness** - Easy to add new models and agents
4. **Pragmatism** - Multi-AI when needed, optimal single model otherwise
