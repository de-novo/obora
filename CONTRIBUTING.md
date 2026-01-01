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

# Set up API keys (optional - CLI mode works without them)
export ANTHROPIC_API_KEY=your_key
export OPENAI_API_KEY=your_key
export GOOGLE_API_KEY=your_key

# Run example debate
bun packages/core/examples/debate.ts

# Run benchmark
bun benchmark/run.ts
```

#### Adding New Benchmark Cases

1. Add cases to `benchmark/cases/`
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

The quality of debate depends heavily on prompts. Current prompts are in `packages/core/src/engine/`.

Propose improvements by:
1. Creating a new prompt variant
2. Running A/B tests against current prompts
3. Documenting results
4. Submitting PR with evidence

### 4. Add AI Providers

Currently supported: Claude, OpenAI (Codex), Gemini

To add a new provider:
1. Create provider in `packages/core/src/providers/`
2. Implement the `ProviderBackend` interface
3. Test with example debates
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

- [Bun](https://bun.sh/) >= 1.3
- API keys for AI providers (Claude, OpenAI, etc.) or CLI tools installed

### Project Structure

```
obora/
├── packages/
│   └── core/                  # Core library
│       ├── src/
│       │   ├── providers/     # AI provider implementations
│       │   │   ├── ai-sdk/    # Vercel AI SDK backend
│       │   │   ├── claude/    # Claude provider
│       │   │   ├── openai/    # OpenAI provider
│       │   │   └── gemini/    # Gemini provider
│       │   ├── engine/        # Debate engine
│       │   └── auth/          # Authentication
│       └── examples/          # Example scripts
├── benchmark/                 # Benchmark tools
│   ├── cases/                 # Test cases
│   ├── results/               # Output (gitignored)
│   ├── run.ts                 # Runner script
│   └── runner.ts              # Benchmark runner
├── docs/                      # Documentation
├── biome.json                 # Linting & formatting
└── README.md
```

### Running Tests

```bash
# Lint check
bun run lint

# Auto-fix lint issues
bun run lint:fix

# Type check
bun run typecheck

# Full check (lint + typecheck)
bun run check
```

---

## Submitting Changes

### Commit Convention

모든 커밋은 관련 이슈와 연결되어야 합니다.

#### Format

```
<type>(<scope>): <subject> (#<issue>)

<body>
```

#### Types

| Type | Description |
|------|-------------|
| `feat` | 새로운 기능 |
| `fix` | 버그 수정 |
| `docs` | 문서 변경 |
| `refactor` | 리팩토링 (기능 변경 없음) |
| `test` | 테스트 추가/수정 |
| `chore` | 빌드, 설정 등 기타 변경 |

#### Scopes

| Scope | Description |
|-------|-------------|
| `engine` | 토론 엔진 (DebateEngine) |
| `providers` | AI Provider (Claude, OpenAI, Gemini) |
| `tools` | 도구 (WebSearch 등) |
| `cli` | CLI 도구 |
| `auth` | 인증 |
| `config` | 설정 |

#### Examples

```bash
# 기능 추가 (Issue #2)
feat(engine): add streaming support (#2)

# 버그 수정 (Issue #15)
fix(providers): fix Claude CLI timeout (#15)

# 리팩토링 (Issue #1)
refactor(tools): make custom tools optional (#1)

# 이슈 없는 경우 (문서, 린터 등)
docs: update README with benchmark results
chore: apply linter formatting
```

#### Issue Linking

- `#N` - 이슈 참조 (자동 링크)
- `Closes #N` - 커밋 머지 시 이슈 자동 종료
- `Fixes #N` - 버그 수정 시 이슈 자동 종료
- `Refs #N` - 관련 이슈 참조 (종료하지 않음)

#### Branch Naming (Optional)

```
<type>/<issue>-<short-description>

feat/2-streaming-support
fix/15-claude-timeout
```

### Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make changes
4. Run `bun run check` to ensure lint and types pass
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

- [ ] `bun run check` passes
- [ ] Documentation updated
- [ ] Tests pass (if applicable)
```

---

## Code Style

- Use TypeScript
- Biome for linting and formatting (auto-fixed on commit)
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
