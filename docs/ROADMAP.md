# Obora Roadmap

## Vision

**Enable anyone to make better decisions through Multi-AI Debate.**

The ultimate goal is to create a tool like [Claude Code](https://github.com/anthropics/claude-code) or [OpenCode](https://github.com/opencode-ai/opencode) — but for **decision-making through AI debate** rather than coding.

---

## Core Research Question

> **Does AI debate lead to better decisions than a single AI?**

### Sub-questions (Open for Contribution)

| ID | Question | Status |
|----|----------|--------|
| RQ1 | What is the optimal AI combination? | Open |
| RQ2 | Which types of questions benefit from debate? | Open |
| RQ3 | What is the optimal number of debate rounds? | Open |
| RQ4 | How do we measure "better" decisions? | Open |
| RQ5 | Can debate reduce AI hallucinations? | Open |

---

## Validated Hypotheses

| Hypothesis | Status | Evidence |
|------------|--------|----------|
| Strong prompts induce real rebuttals | ✅ Validated | 20/20 cases showed actual criticism |
| AIs change positions after rebuttals | ✅ Validated | Multiple position changes observed |
| Heterogeneous models increase diversity | ✅ Validated | Claude + Codex showed different perspectives |
| Preserving disagreements adds value | ✅ Validated | Explicit disagreements more honest than forced consensus |

---

## Phases

### Phase 1: Research ✅ Complete

- [x] Implement strong debate mode (4-phase structure)
- [x] Run 20-case benchmark
- [x] Document academic background
- [x] Validate core hypothesis

**Outcome**: Proved that Multi-AI debate produces position changes and deeper analysis.

---

### Phase 2: MCP Server 🎯 Current Focus

Transform Obora into an MCP (Model Context Protocol) server for seamless integration with existing AI tools.

#### Why MCP First?

| Standalone CLI | MCP Integration |
|----------------|-----------------|
| Competes with existing tools | Complements existing tools |
| Users learn new interface | Users stay in familiar environment |
| Hard to gain adoption | Leverages existing user base |

#### MCP Tools Design

```typescript
// obora-mcp-server

tools: {
  "obora_debate": {
    description: "Run multi-AI debate for high-stakes decisions",
    parameters: {
      question: string,
      participants?: ["claude", "codex", "gemini"],
      rounds?: number,  // default: 1
      mode?: "strong" | "quick"
    },
    returns: {
      consensus: string,
      disagreements: string[],
      positionChanges: Array<{
        ai: string,
        from: string,
        to: string,
        reason: string
      }>,
      fullTranscript: string
    }
  },

  "obora_quick_opinions": {
    description: "Get parallel opinions without debate (faster)",
    parameters: {
      question: string,
      participants?: string[]
    }
  },

  "obora_should_debate": {
    description: "Analyze if a question warrants full debate",
    parameters: {
      question: string
    },
    returns: {
      shouldDebate: boolean,
      reason: string,
      suggestedMode: "single" | "parallel" | "debate"
    }
  }
}
```

#### Usage in Claude Code

```
User: "Should we use serverless or containers for our new service?"

Claude: "This is a significant architectural decision. Let me consult
        other AI experts through Obora debate..."

[Obora MCP runs debate between Claude, Codex, and Gemini]

Claude: "After debate with other AI experts:

        **Consensus**: ECS Fargate recommended for your 3-person team

        **Key Rebuttal Accepted**: Codex initially suggested hybrid
        but revised after Claude pointed out operational overhead.

        **Unresolved**: Consider hybrid when team grows to 5+ engineers"
```

#### Tasks

- [ ] Create `obora-mcp` package
- [ ] Implement MCP server with FastMCP or MCP SDK
- [ ] Test with Claude Code integration
- [ ] Document MCP installation
- [ ] Publish to npm

---

### Phase 3: Standalone CLI (Optional)

If demand exists, provide standalone CLI for users without MCP-compatible tools.

```bash
# Install globally
npm install -g obora

# Interactive mode
obora ask "Should we migrate to microservices?"

# Batch mode
obora batch questions.json --output results/

# Configuration
obora config set participants claude,codex,gemini
obora config set rounds 2
```

#### Tasks

- [ ] Create `obora` CLI package
- [ ] Interactive mode with streaming
- [ ] Configuration file support
- [ ] Multiple output formats (markdown, json, html)

---

### Phase 4: Ecosystem (Future)

Based on community feedback:

| Extension | Description |
|-----------|-------------|
| VS Code Extension | Inline debate for code decisions |
| Web UI | Browser-based debate interface |
| API Server | Self-hosted debate service |
| Plugin System | Custom AI providers, prompt templates |

---

## Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| GitHub Stars | 100+ | 0 |
| npm Downloads (MCP) | 500+/month | - |
| Position Changes Rate | >30% of debates | ~40% |
| Community Contributors | 5+ | 1 |
| Research Questions Answered | 3+ | 1 |

---

## How to Contribute

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

### Quick Start

1. **Run experiments**: Add new benchmark cases
2. **Answer research questions**: Share findings with data
3. **Improve prompts**: Suggest better debate prompts
4. **Add AI providers**: Integrate new LLM APIs
5. **Build integrations**: VS Code, Web UI, etc.

---

## Experiment Log

| Date | Experiment | Result |
|------|------------|--------|
| 2025-01-01 | 20-case benchmark (strong debate) | 5x analysis, position changes validated |
| 2025-01-01 | Weak vs strong prompt comparison | Strong prompts essential for real debate |

---

## Timeline

```
2025 Q1: Phase 2 (MCP Server)
├── January: Core MCP implementation
├── February: Claude Code integration testing
└── March: npm publish + documentation

2025 Q2: Phase 3 (Standalone CLI) - if demand exists
├── April: CLI implementation
└── May: Configuration + batch mode

2025 Q3+: Phase 4 (Ecosystem) - based on feedback
```

---

## Contact

- GitHub Issues: Bug reports, feature requests
- Discussions: Research questions, ideas

---

*Last updated: 2025-01-01*
