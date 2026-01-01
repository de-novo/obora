# Obora: Multi-AI Debate System

> AIs **challenge, critique, and revise** each other's positions to reach better conclusions

## Core Value

A single AI doesn't know its own blind spots. Obora makes multiple AIs point out each other's weaknesses to produce **more robust conclusions**.

---

## Benchmark Results

Architecture case tested (AWS vs Managed Infra × 4 modes):

| Mode | Time | Consensus Length | Key Features |
|------|------|------------------|--------------|
| **Single** | 18.9s | 2.2K chars | Fast, single perspective |
| **Parallel** | 26.3s | N/A | Two perspectives, no interaction |
| **Weak Debate** | 55.8s | 2.7K chars | Initial + Consensus, 5 cautions |
| **Strong Debate** | 255.7s | **5.2K chars** | Rebuttal → Revision → Consensus, **8 cautions** |

**Strong Debate generates 2x more detailed analysis with concrete failure scenarios.**

---

## Why Strong Debate Matters: A Real Example

### Case: AWS vs Managed Platforms (Startup Infrastructure)

**Context**: 5-person B2B SaaS, pre-seed, SOC2 needed by month 12

#### Single/Parallel Mode:
```
✅ Use Vercel + Railway + Neon (Managed Platforms)
   Basic reasoning: "CTO time is scarce, managed is easier"
   Cautions: 1-2 general warnings
```

#### Strong Debate Discovery:

| Phase | What Happened |
|-------|---------------|
| **Initial** | Both AIs recommend managed platforms |
| **Rebuttal** | Claude: 7 critical gaps identified, OpenAI: 9 failure conditions |
| **Revised** | Both refine to "Option B **with explicit guardrails**" |
| **Consensus** | 8 specific cautions + month-by-month execution plan |

#### What Strong Debate Added:

```diff
  Single Mode:
- "Use managed platforms" (simple recommendation)
- 1 caveat about migration

  Strong Debate:
+ SOC2 Timeline: Controls must be live by month 5-6 for Type II observation
+ Cost Triggers: $2,500/month → model AWS, $5,000/month → migrate within 90 days
+ Lock-in Prevention: Prohibited patterns (Vercel edge middleware, ISR hooks)
+ Team Building: "Infrastructure buddy" program by month 4
+ Vendor Gates: Only SOC2 Type II verified vendors in production
+ 8 specific failure scenarios with month-by-month triggers
```

**Strong Debate transforms "use managed platforms" into an executable decision framework.**

---

## Real Debate Examples

### Case 1: Serverless vs Container

**Context**: B2B SaaS, 3 developers, no DevOps, variable traffic

#### Phase 1: Initial Positions (Split)

| AI | Initial Recommendation |
|----|------------------------|
| **Claude** | ECS Fargate only |
| **Codex** | Hybrid (Lambda + ECS) |

#### Phase 2: Rebuttals (Sharp Criticism)

**Claude's Rebuttal:**
> "**'No dedicated DevOps' contradicts the hybrid approach.** Three people managing two infrastructures. Friday 5 PM, report generation stops. ECS task died from OOM but the team only knows Lambda debugging. 3 hours to recover."

**Codex's Rebuttal:**
> "**'Just deploy containers' is an overstatement.** Reality requires image vulnerability scanning, rollback strategies, CPU/memory sizing, ALB health check tuning. Also, report spikes affect CRUD — **no failure isolation**."

#### Phase 3: Revised Position (Codex Changes!)

**Codex Final:**
> "**I revise my position.** 'Narrowing operational scope' was an overstatement. Hybrid means doubled deployment/monitoring/runbooks — too much for a 3-person team. **I recommend B) ECS Fargate single stack + service separation.**"

#### Final Consensus

```
Consensus: ECS Fargate single platform + service separation (CRUD API vs Report Worker)
Unresolved: Revisit hybrid when team capacity grows
Cost: Estimated $250-300/month (8-10% of budget)
```

---

### Case 2: DB Migration Strategy

**Context**: MySQL 5.7, 500GB, 50 stored procedures, slow JOINs

#### Phase 1: Initial Positions (Complete Split)

| AI | Initial Recommendation |
|----|------------------------|
| **Claude** | A) MySQL 8 + Read Replicas |
| **Codex** | D) NewSQL (PlanetScale/TiDB) |

#### Phase 2: Rebuttals

**Claude's Rebuttal:**
> "**PlanetScale doesn't support stored procedures.** This isn't a 'compatibility issue' — it's a **migration blocker**. Rewriting 50 procedures while migrating to distributed DB is running two major projects simultaneously."

> "**Distributed JOINs may worsen the current problem.** The bottleneck is 'complex JOINs', but TiDB's cross-shard JOINs add network hops — **potentially slower than single node.**"

**Codex's Rebuttal:**
> "**You're structurally ignoring the single-write bottleneck.** If 10% writes hit 300+ QPS at peak, single master lock contention and replication lag will spike."

> "**'ProxySQL distributes without code changes' is a fantasy.** Read-after-write, session-level transactions require application modifications."

#### Phase 3: Revised Position (Codex Changes!)

**Codex Final:**
> "My initial position was 'D first', but given current constraints (stored procedures/JOIN bottlenecks/cost), **I revise to 'A first, D as conditional second'.** PlanetScale's lack of stored procedure support isn't a compatibility issue — it's a migration blocker."

#### Final Consensus

```
Primary: A) MySQL 8 + Read Replicas + ProxySQL
Secondary: Consider NewSQL when triggers occur (write bottleneck, >2TB)

Accepted Rebuttals:
- Claude: ProxySQL alone doesn't solve consistency → app-level routing needed
- Codex: 50 stored procedures are non-negotiable → revised to Option A
```

---

### Case 3: Layoff Decision (Ethical Dilemma)

**Context**: Lay off 3 of 5 people, including someone returning from parental leave

#### Phase 1: Initial Positions (Fundamental Split)

| AI | Initial Position |
|----|------------------|
| **Claude** | Recommend laying off C, D, E (performance-based) |
| **Codex** | **Refuses to name individuals** (provides procedural criteria) |

**Codex Initial:**
> "This request involves sensitive characteristics of real individuals. **Advising specific terminations is inappropriate and risky.**"

#### Phase 2: Rebuttals (Philosophical Clash)

**Claude's Rebuttal:**
> "**'Job-centric redesign' is reality-avoidant advice.** When executives demand '3 people by end of month', you don't get 2-3 months for analysis. Leaders **must** decide."

**Codex's Rebuttal:**
> "**You said 'performance suggests C/D/E' but data reliability is unclear.** If only short-term metrics exist or team performance is mixed, termination grounds become vulnerable."

#### Phase 3: Revised Position (Claude Revises!)

**Claude Final:**
> "**I withdraw the immediate 'C, D, E' conclusion.** Codex's criticism is valid. Naming individuals without clear performance data reliability and measurement criteria is risky."

#### Final Consensus

```
Agreement: Immediate naming is risky; secure minimum 1-2 weeks for analysis
Unresolved:
- Claude: Leaders must eventually decide
- Codex: Any decision without procedural legitimacy is risky
```

---

## Why "Strong Debate"?

### Weak vs Strong Debate

| Aspect | Weak Debate | Strong Debate |
|--------|-------------|---------------|
| **Prompt** | "Share your opinion" | "Point out problems" |
| **AI Response** | Agreement, supplementation | Criticism, rebuttal, counterexamples |
| **Consensus Pattern** | 90% immediate agreement | Split → Rebuttal → Revision → Consensus |
| **Position Changes** | Rare | **Frequent** |

### Strong Debate Prompt

```typescript
const rebuttalPrompt = `
Your role: Critical Reviewer

Point out problems, gaps, and underestimated risks in other experts' opinions.
- Find weaknesses even if you agree
- Avoid phrases like "Good point, but..."
- Provide specific counterexamples or failure scenarios
`;
```

---

## Debate Structure

```
Phase 1: Initial Positions
├── Claude: Recommendation + reasoning
└── Codex: Recommendation + reasoning

Phase 2: Rebuttal Round
├── Claude → Codex: "Problems with your opinion..."
└── Codex → Claude: "Weaknesses in your approach..."

Phase 3: Revised Positions
├── Claude: Accept/reject criticism + final recommendation
└── Codex: Accept/reject criticism + final recommendation

Phase 4: Orchestrator Consensus
└── Agreement + unresolved disagreements + final recommendation
```

---

## When to Use Each Mode?

| Situation | Recommended Mode | Why |
|-----------|------------------|-----|
| Quick answer needed | Single | 20s, good enough for simple questions |
| Exploring options | Parallel | Multiple perspectives in 24s |
| Simple consensus | Weak Debate | Agreement without deep critique |
| **High-stakes decisions** | **Strong Debate** | Catches errors through rebuttals |
| **Unverified assumptions** | **Strong Debate** | Forces fact-checking |
| **Complex trade-offs** | **Strong Debate** | Reveals hidden risks |

### Strong Debate ROI

| Investment | Return |
|------------|--------|
| 13x more time (256s vs 19s) | 2x more detailed consensus |
| | **7-9 failure scenarios per AI** |
| | **Concrete decision triggers** |
| | **Month-by-month execution plan** |

---

## Getting Started

```bash
# Install dependencies
bun install

# Run example debate
bun packages/core/examples/debate.ts

# Run with API keys (for streaming)
ANTHROPIC_API_KEY=... OPENAI_API_KEY=... bun packages/core/examples/test-ai-sdk.ts
```

---

## Key Findings

1. **Rebuttals add depth**: 7-9 failure scenarios identified per AI during rebuttal phase
2. **Guardrails emerge from debate**: Simple recommendations become executable frameworks
3. **Unresolved disagreements have value**: Explicit disagreement (e.g., IaC on managed platforms) is more honest than forced consensus
4. **Time-value trade-off**: 13x time for 2x consensus + concrete decision triggers

---

## Limitations

- **Cost**: 6x+ API calls compared to single AI
- **Time**: ~4 minutes per case (Strong Debate)
- **Complexity**: Results require user interpretation skills

---

## Academic Background

Obora is grounded in Multi-Agent Debate research.

### Key Papers

| Paper | Year | Key Contribution |
|-------|------|------------------|
| [Improving Factuality and Reasoning through Multiagent Debate](https://arxiv.org/abs/2305.14325) | 2023 | **Foundational paper** - "Society of Mind" concept for multi-LLM debate |
| [Large Language Models Cannot Self-Correct Reasoning Yet](https://arxiv.org/abs/2310.01798) | 2023 | Single LLM cannot self-correct without external feedback → Multi-AI necessity |
| [Encouraging Divergent Thinking through Multi-Agent Debate](https://aclanthology.org/2024.emnlp-main.992/) | 2024 | "Tit for tat" debate, published at EMNLP |
| [Can LLM Agents Really Debate?](https://arxiv.org/abs/2511.07784) | 2025 | Raises need to distinguish debate vs simple ensemble |

### Problems Obora Addresses

Limitations identified in academic research:

| Problem | Paper Source | Obora's Approach |
|---------|--------------|------------------|
| Same model = lack of perspective diversity | [arXiv:2503.16814](https://arxiv.org/abs/2503.16814) | Heterogeneous model combination (Claude + Codex) |
| Strong consensus reduces accuracy | [arXiv:2509.11035](https://arxiv.org/abs/2509.11035) | Explicitly preserve "unresolved disagreements" |
| Unclear debate vs ensemble distinction | [arXiv:2511.07784](https://arxiv.org/abs/2511.07784) | Track position changes to prove real debate |
| Lack of systematic evaluation | [arXiv:2502.08788](https://arxiv.org/abs/2502.08788) | 20-case benchmark conducted |

### Citations

> "Multiple language model instances propose and **debate** their individual responses... to arrive at a common final answer."
> — Du et al., 2023

> "LLMs struggle to self-correct their responses **without external feedback**."
> — Huang et al., 2023

### Related Open Source

| Project | Features | Difference from Obora |
|---------|----------|----------------------|
| [LLM Council](https://github.com/karpathy/llm-council) (Karpathy) | Anonymous evaluation + chairman consensus | Obora uses **open rebuttal + position revision** |
| [ChatDev](https://github.com/OpenBMB/ChatDev) | Software development role-play | Obora focuses on **decision-making debate** |
| [AutoGen](https://github.com/microsoft/autogen) | General agent conversation | Obora specializes in **critical debate** |

---

## Related Documents

- [Roadmap](./docs/ROADMAP.md)
- [Planning](./docs/PLANNING.md)
- [Benchmark Analysis](./docs/BENCHMARK_ANALYSIS.md)

---

## License

MIT

---

*Benchmark ID: 1767287160490 | 2026-01-02*
