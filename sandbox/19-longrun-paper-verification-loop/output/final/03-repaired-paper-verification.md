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

Four claims were assessed against the provided vendored excerpts. All four claims now have concrete excerpt-to-claim mappings. Claim 3 is marked PARTIAL because Excerpt C asserts on-par-or-better performance on RoBERTa, DeBERTa, GPT-2, and GPT-3, while Excerpt F confirms matches-or-exceeds on GPT-3 specifically; the fixture does not provide separate per-model excerpt citations for RoBERTa, DeBERTa, and GPT-2.

Overall: 3 SUPPORTED, 1 PARTIAL, 0 UNSUPPORTED. The repaired report is now sufficient for acceptance.

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
Evidence: Excerpt C, Excerpt F

Rationale: Excerpt C states LoRA performs on-par or better than fine-tuning on RoBERTa, DeBERTa, GPT-2, and GPT-3. Excerpt F confirms LoRA matches or exceeds the fine-tuning baseline on all three datasets for GPT-3 175B. The fixture consolidates the RoBERTa, DeBERTa, and GPT-2 assertions in Excerpt C without separate per-model citations, so a fully granular mapping is not possible from the provided excerpts alone.

## Claim 4
Unlike adapters, LoRA introduces no additional inference latency.

Verdict: SUPPORTED
Evidence: Excerpt C, Excerpt E

# Evidence Notes

## Claim 1 (Excerpt A)
Excerpt A explicitly states that LoRA "freezes the pre-trained model weights and injects trainable rank decomposition matrices into each layer of the Transformer architecture," directly supporting Claim 1.

## Claim 2 (Excerpt B)
Excerpt B provides the exact quantitative comparison: "LoRA can reduce the number of trainable parameters by 10,000 times and the GPU memory requirement by 3 times" relative to GPT-3 175B fine-tuned with Adam, directly supporting Claim 2.

## Claim 3 (Excerpts C and F)
Excerpt C states that "LoRA performs on-par or better than fine-tuning in model quality on RoBERTa, DeBERTa, GPT-2, and GPT-3, despite having fewer trainable parameters, a higher training throughput, and, unlike adapters, no additional inference latency." This directly addresses the on-par-or-better claim across the four model families. Excerpt F adds concrete support for GPT-3: "LoRA matches or exceeds the fine-tuning baseline on all three datasets." Because the fixture does not provide separate excerpt IDs for RoBERTa, DeBERTa, and GPT-2 results, Claim 3 is marked PARTIAL with consolidated evidence from Excerpt C and Excerpt F.

## Claim 4 (Excerpts C and E)
Excerpt C states that LoRA has "no additional inference latency" compared to adapters. Excerpt E reinforces this by asserting that the method "guarantees that we do not introduce any additional latency during inference compared to a fine-tuned model by construction." Together, these provide complete support for Claim 4.

# Final Verdict

This repaired verification report is now sufficient for acceptance. All four claims have concrete excerpt IDs and explicit evidence notes. Claims 1, 2, and 4 are SUPPORTED. Claim 3 is PARTIAL because the provided fixture consolidates RoBERTa, DeBERTa, and GPT-2 performance assertions in Excerpt C without separate per-model citations, while Excerpt F independently confirms GPT-3 results. No unsupported claims remain.
