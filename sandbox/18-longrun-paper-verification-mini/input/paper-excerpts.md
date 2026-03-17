# Paper Excerpts

## Excerpt A - Abstract: method definition

"We propose Low-Rank Adaptation, or LoRA, which freezes the pre-trained model weights and injects trainable rank decomposition matrices into each layer of the Transformer architecture, greatly reducing the number of trainable parameters for downstream tasks."

Source: arXiv abstract for https://arxiv.org/abs/2106.09685

## Excerpt B - Abstract: parameter and memory claim

"Compared to GPT-3 175B fine-tuned with Adam, LoRA can reduce the number of trainable parameters by 10,000 times and the GPU memory requirement by 3 times."

Source: arXiv abstract for https://arxiv.org/abs/2106.09685

## Excerpt C - Abstract: performance and latency claim

"LoRA performs on-par or better than fine-tuning in model quality on RoBERTa, DeBERTa, GPT-2, and GPT-3, despite having fewer trainable parameters, a higher training throughput, and, unlike adapters, no additional inference latency."

Source: arXiv abstract for https://arxiv.org/abs/2106.09685

## Excerpt D - Introduction: why adapters are a latency baseline

"However, existing techniques often introduce inference latency ... by extending model depth ... More importantly, these method often fail to match the fine-tuning baselines, posing a trade-off between efficiency and model quality."

Source: Section 1 Introduction, https://arxiv.org/html/2106.09685v2

## Excerpt E - Method section: no additional inference latency by construction

"Critically, this guarantees that we do not introduce any additional latency during inference compared to a fine-tuned model by construction."

Source: Section 4.1 No Additional Inference Latency, https://arxiv.org/html/2106.09685v2

## Excerpt F - Empirical section: GPT-3 comparison

"As shown in Table 4, LoRA matches or exceeds the fine-tuning baseline on all three datasets."

Source: Section 5.5 Scaling up to GPT-3 175B, https://arxiv.org/html/2106.09685v2
