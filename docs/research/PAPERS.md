# Key Papers on Multi-Agent Debate

A curated list of academic papers foundational to Obora's design.

## Foundational Papers

### 1. Improving Factuality and Reasoning through Multiagent Debate (2023)

**Authors:** Yilun Du, Shuang Li, Antonio Torralba, Joshua B. Tenenbaum, Igor Mordatch

**Link:** [arXiv:2305.14325](https://arxiv.org/abs/2305.14325)

**Key Contribution:**
- Introduced "Society of Mind" concept for LLMs
- Multiple LLM instances debate to reach consensus
- Showed improved factuality on reasoning benchmarks

**Relevance to Obora:**
- Core inspiration for multi-AI debate architecture
- Validates that debate improves reasoning accuracy
- Foundation for strong debate mode design

**Citation:**
```bibtex
@article{du2023improving,
  title={Improving Factuality and Reasoning in Language Models through Multiagent Debate},
  author={Du, Yilun and Li, Shuang and Torralba, Antonio and Tenenbaum, Joshua B and Mordatch, Igor},
  journal={arXiv preprint arXiv:2305.14325},
  year={2023}
}
```

---

### 2. Large Language Models Cannot Self-Correct Reasoning Yet (2023)

**Authors:** Jie Huang, Xinyun Chen, Swaroop Mishra, Huaixiu Steven Zheng, Adams Wei Yu, Xinying Song, Denny Zhou

**Link:** [arXiv:2310.01798](https://arxiv.org/abs/2310.01798)

**Key Contribution:**
- Demonstrated that single LLMs struggle to self-correct without external feedback
- Showed that self-correction can actually harm performance
- Established need for external verification

**Relevance to Obora:**
- Justifies multi-AI approach over single AI self-reflection
- Supports design of external rebuttal phase
- Explains why "strong debate" with criticism is necessary

**Citation:**
```bibtex
@article{huang2023large,
  title={Large Language Models Cannot Self-Correct Reasoning Yet},
  author={Huang, Jie and Chen, Xinyun and Mishra, Swaroop and Zheng, Huaixiu Steven and Yu, Adams Wei and Song, Xinying and Zhou, Denny},
  journal={arXiv preprint arXiv:2310.01798},
  year={2023}
}
```

---

### 3. Encouraging Divergent Thinking in Large Language Models through Multi-Agent Debate (2024)

**Authors:** Tian Liang, Zhiwei He, Wenxiang Jiao, Xing Wang, Yan Wang, Rui Wang, Yujiu Yang, Zhaopeng Tu, Shuming Shi

**Link:** [EMNLP 2024](https://aclanthology.org/2024.emnlp-main.992/)

**Key Contribution:**
- "Tit for tat" debate strategy
- Showed debate encourages divergent thinking
- Published at top NLP venue (EMNLP)

**Relevance to Obora:**
- Validates structured rebuttal approach
- Supports adversarial prompting in strong debate
- Academic validation of debate methodology

---

### 4. Can LLM Agents Really Debate? (2025)

**Authors:** Various

**Link:** [arXiv:2511.07784](https://arxiv.org/abs/2511.07784)

**Key Contribution:**
- Distinguishes true debate from simple ensemble
- Raises quality bar for debate systems
- Proposes evaluation criteria

**Relevance to Obora:**
- Informs distinction between weak/strong debate
- Supports tracking position changes as proof of real debate
- Guides evaluation methodology

---

## Related Research Areas

### Multi-Agent Collaboration

| Paper | Year | Key Insight |
|-------|------|-------------|
| [ChatDev](https://arxiv.org/abs/2307.07924) | 2023 | Role-based multi-agent software development |
| [AutoGen](https://arxiv.org/abs/2308.08155) | 2023 | Conversational agent framework |
| [AgentVerse](https://arxiv.org/abs/2308.10848) | 2023 | Multi-agent task solving |
| [MetaGPT](https://arxiv.org/abs/2308.00352) | 2023 | Meta-programming for multi-agent |

### LLM Reasoning

| Paper | Year | Key Insight |
|-------|------|-------------|
| [Chain-of-Thought](https://arxiv.org/abs/2201.11903) | 2022 | Step-by-step reasoning |
| [Self-Consistency](https://arxiv.org/abs/2203.11171) | 2022 | Sample multiple reasoning paths |
| [Tree of Thoughts](https://arxiv.org/abs/2305.10601) | 2023 | Deliberate problem solving |
| [Reflexion](https://arxiv.org/abs/2303.11366) | 2023 | Verbal reinforcement learning |

### Ensemble & Verification

| Paper | Year | Key Insight |
|-------|------|-------------|
| [LLM-Blender](https://arxiv.org/abs/2306.02561) | 2023 | Ensemble LLM outputs |
| [Verify-and-Edit](https://arxiv.org/abs/2305.03268) | 2023 | External verification for LLMs |
| [Self-Refine](https://arxiv.org/abs/2303.17651) | 2023 | Iterative refinement |

---

## Research Gaps Obora Addresses

Based on literature review, Obora addresses these gaps:

| Gap | Paper Source | Obora's Solution |
|-----|--------------|------------------|
| Same model lacks perspective diversity | [arXiv:2503.16814](https://arxiv.org/abs/2503.16814) | Heterogeneous models (Claude + OpenAI + Gemini) |
| Strong consensus reduces accuracy | [arXiv:2509.11035](https://arxiv.org/abs/2509.11035) | Explicitly preserve unresolved disagreements |
| Unclear debate vs ensemble distinction | [arXiv:2511.07784](https://arxiv.org/abs/2511.07784) | Track position changes as proof of debate |
| Lack of systematic evaluation | [arXiv:2502.08788](https://arxiv.org/abs/2502.08788) | Benchmark with real-world decision cases |

---

## How to Find More Papers

### arXiv Search
```
https://arxiv.org/search/?query=multi-agent+debate+LLM&searchtype=all
```

### Google Scholar Alerts
Set up alerts for:
- "multi-agent debate language model"
- "LLM reasoning collaboration"
- "AI agent debate"

### Conference Proceedings
Check recent proceedings of:
- NeurIPS (December)
- ICML (July)
- ACL/EMNLP (May/November)
- ICLR (May)

---

## Contributing

Found a relevant paper? Add it here with:
1. Full citation
2. Link to paper
3. Key contribution summary
4. Relevance to Obora
