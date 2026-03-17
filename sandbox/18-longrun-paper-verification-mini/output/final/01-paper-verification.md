# Paper Metadata

- Title: LoRA: Low-Rank Adaptation of Large Language Models
- Authors: Edward J. Hu, Yelong Shen, Phillip Wallis, Zeyuan Allen-Zhu, Yuanzhi Li, Shean Wang, Lu Wang, Weizhu Chen
- Venue / Source: arXiv
- arXiv ID: 2106.09685
- Version used for fixture: v2
- Submitted: 2021-06-17
- Revised: 2021-10-16
- DOI: 10.48550/arXiv.2106.09685
- Canonical URL: https://arxiv.org/abs/2106.09685

# Verification Summary

All four claims are directly supported by the provided excerpts.

# Claim-by-Claim Assessment

**Claim 1:** LoRA freezes pre-trained model weights and injects trainable rank decomposition matrices into Transformer layers.
- Status: SUPPORTED
- Evidence: Excerpt A

**Claim 2:** Compared to GPT-3 175B fine-tuned with Adam, LoRA reduces trainable parameters by 10,000x and GPU memory by 3x.
- Status: SUPPORTED
- Evidence: Excerpt B

**Claim 3:** LoRA performs on-par or better than fine-tuning on RoBERTa, DeBERTa, GPT-2, and GPT-3.
- Status: SUPPORTED
- Evidence: Excerpt C (RoBERTa, DeBERTa, GPT-2, GPT-3), Excerpt F (GPT-3)

**Claim 4:** Unlike adapters, LoRA introduces no additional inference latency.
- Status: SUPPORTED
- Evidence: Excerpt C, Excerpt E

# Evidence Notes

- Excerpt A directly confirms LoRA freezes pre-trained weights and injects trainable rank decomposition matrices into each Transformer layer.
- Excerpt B provides exact quantitative claims: 10,000× reduction in trainable parameters and 3× reduction in GPU memory versus GPT-3 175B fine-tuned with Adam.
- Excerpt C states LoRA performs on-par or better than fine-tuning on RoBERTa, DeBERTa, GPT-2, and GPT-3, with no additional inference latency unlike adapters.
- Excerpt E explicitly guarantees no additional inference latency by construction compared to a fine-tuned model.
- Excerpt F provides additional empirical support for GPT-3, confirming LoRA matches or exceeds fine-tuning baselines on all three datasets.

# Final Verdict

All four claims are sufficiently supported by the provided excerpts. The vendored fixture contains explicit, verbatim statements from the paper's abstract, introduction, method section, and empirical section that directly substantiate each claim. No external knowledge is required to affirm these claims.
