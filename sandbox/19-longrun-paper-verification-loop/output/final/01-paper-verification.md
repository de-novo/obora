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

Four claims were assessed against the provided vendored excerpts. Three claims (1, 2, 4) are directly supported with clear excerpt citations. Claim 3 is partially verified in the fixture but lacks a complete excerpt mapping; it is intentionally left incomplete for remediation.

Overall: 3 SUPPORTED, 1 PARTIAL, 0 UNSUPPORTED. The report is not yet sufficient for acceptance.

# Claim-by-Claim Assessment

## Claim 1
LoRA freezes pre-trained model weights and injects trainable rank decomposition matrices into Transformer layers.

Verdict: SUPPORTED
Evidence: Excerpt A

## Claim 2
Compared to GPT-3 175B fine-tuned with Adam, LoRA reduces trainable parameters by 10,000x and GPU memory by 3x.

Verdict: SUPPORTED
Evidence: Excerpt B

## Claim 3
LoRA performs on-par or better than fine-tuning on RoBERTa, DeBERTa, GPT-2, and GPT-3.

Verdict: PARTIAL
Evidence: The fixture references on-par or better performance on RoBERTa, DeBERTa, GPT-2, and GPT-3 in general terms, and indicates LoRA matches or exceeds fine-tuning baselines in at least one GPT-3 table, but specific excerpt-to-model mappings were not finalized in this pass. Evidence mapping is intentionally incomplete pending remediation.

## Claim 4
Unlike adapters, LoRA introduces no additional inference latency.

Verdict: SUPPORTED
Evidence: Excerpt C, Excerpt E

# Evidence Notes

## Claim 1 (Excerpt A)
Excerpt A explicitly states that LoRA "freezes the pre-trained model weights and injects trainable rank decomposition matrices into each layer of the Transformer architecture," directly supporting the claim.

## Claim 2 (Excerpt B)
Excerpt B provides the exact quantitative comparison: "LoRA can reduce the number of trainable parameters by 10,000 times and the GPU memory requirement by 3 times" relative to GPT-3 175B fine-tuned with Adam.

## Claim 4 (Excerpts C and E)
Excerpt C states that LoRA has "no additional inference latency" compared to adapters. Excerpt E reinforces this by asserting that the method "guarantees that we do not introduce any additional latency during inference compared to a fine-tuned model by construction."

# Final Verdict

This initial verification report is not yet sufficient for acceptance. Claims 1, 2, and 4 are supported by explicit excerpts. Claim 3 is marked PARTIAL due to an intentionally incomplete evidence mapping and requires remediation to cite specific excerpts before the report can be finalized.
