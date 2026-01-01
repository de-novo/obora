# Contributing to Obora

Thank you for your interest in contributing to Obora! This project is a research-driven open source tool exploring Multi-AI Debate for better decision-making.

## Ways to Contribute

### 1. Run Experiments

The most valuable contribution is running experiments and sharing results.

```bash
# Clone the repo
git clone https://github.com/de-novo/obora.git
cd obora

# Install dependencies
bun install

# Set up API keys
cp .env.example .env
# Edit .env with your API keys

# Run a single debate
bun .dev/test-strong-debate.ts

# Run full benchmark
bun .dev/benchmark-all.ts
```

#### Adding New Benchmark Cases

1. Add cases to `.dev/benchmark-cases.ts` (technical) or `.dev/benchmark-cases-decision.ts` (decision-making)
2. Run the benchmark
3. Analyze and document results
4. Submit PR with findings

### 2. Answer Research Questions

We have open research questions that need investigation:

| Question | How to Contribute |
|----------|-------------------|
| What is the optimal AI combination? | Test different AI pairs/groups |
| Which question types benefit from debate? | Categorize cases by effectiveness |
| What is the optimal number of rounds? | Experiment with round counts |
| How do we measure "better" decisions? | Propose evaluation frameworks |

Share your findings via GitHub Issues or Discussions.

### 3. Improve Debate Prompts

The quality of debate depends heavily on prompts. Current prompts are in `.dev/benchmark-all.ts`.

Propose improvements by:
1. Creating a new prompt variant
2. Running A/B tests against current prompts
3. Documenting results
4. Submitting PR with evidence

### 4. Add AI Providers

Currently supported: Claude, Codex (OpenAI), Gemini (unstable)

To add a new provider:
1. Add provider config to `.dev/config.yaml`
2. Implement API call in `.dev/lib/`
3. Test with benchmark cases
4. Document any quirks or limitations

### 5. Build Integrations

Future integrations we'd love help with:
- VS Code Extension
- Web UI
- API Server mode
- MCP Server implementation

---

## Development Setup

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- API keys for AI providers (Claude, OpenAI, etc.)

### Project Structure

```
obora/
├── .dev/                    # Development tools
│   ├── benchmark-all.ts     # Main benchmark runner
│   ├── benchmark-cases.ts   # Technical cases
│   ├── benchmark-cases-decision.ts  # Decision cases
│   ├── test-strong-debate.ts        # Single case tester
│   ├── lib/                 # Core libraries
│   │   ├── claude.ts        # Claude API
│   │   ├── runner.ts        # Debate runner
│   │   └── types.ts         # Type definitions
│   └── benchmark/           # Benchmark results
├── docs/                    # Documentation
│   ├── ROADMAP.md
│   ├── PLANNING.md
│   └── BENCHMARK_ANALYSIS.md
└── README.md
```

### Running Tests

```bash
# Single debate test
bun .dev/test-strong-debate.ts

# Full benchmark (takes ~1 hour)
bun .dev/benchmark-all.ts
```

---

## Submitting Changes

### Commit Messages

Use conventional commits:

```
feat: add Gemini support
fix: handle API timeout gracefully
docs: update benchmark results
experiment: test 3-round debate
```

### Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make changes
4. Run tests if applicable
5. Commit with descriptive message
6. Push and create PR

### PR Template

```markdown
## What

Brief description of changes.

## Why

Motivation for this change.

## Evidence (for experiments)

- Cases tested: X
- Results: [summary]
- Data: [link to benchmark results]

## Checklist

- [ ] Code follows project style
- [ ] Documentation updated
- [ ] Tests pass (if applicable)
```

---

## Code Style

- Use TypeScript
- Follow existing patterns in the codebase
- Comments in English
- Use Bun APIs where applicable (see `CLAUDE.md`)

---

## Questions?

- **Bug reports**: GitHub Issues
- **Feature ideas**: GitHub Discussions
- **Research questions**: GitHub Discussions

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
