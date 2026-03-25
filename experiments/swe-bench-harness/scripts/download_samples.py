#!/usr/bin/env python3
"""
SWE-bench 샘플 다운로드 스크립트

Usage:
    python scripts/download_samples.py --count 10 --output ./samples
    python scripts/download_samples.py --dataset lite --output ./samples-lite
"""

import argparse
import json
import os
import sys
from pathlib import Path


def download_samples(count: int, dataset: str, output_dir: Path):
    """SWE-bench 샘플 다운로드"""

    try:
        from datasets import load_dataset
    except ImportError:
        print("Installing datasets...")
        import subprocess
        subprocess.run([sys.executable, "-m", "pip", "install", "datasets"], check=True)
        from datasets import load_dataset

    print(f"Loading {dataset} dataset...")
    if dataset == "verified":
        ds = load_dataset("princeton-nlp/SWE-bench_Verified", split="test")
    elif dataset == "lite":
        ds = load_dataset("princeton-nlp/SWE-bench_Lite", split="test")
    else:
        ds = load_dataset("princeton-nlp/SWE-bench", split="test")

    output_dir.mkdir(parents=True, exist_ok=True)

    samples = []
    for i, item in enumerate(ds):
        if i >= count:
            break

        sample = {
            "id": item["instance_id"],
            "problem_statement": item["problem_statement"],
            "repo": item["repo"],
            "base_commit": item["base_commit"],
            "patch": item["patch"],
            "test_patch": item.get("test_patch", ""),
            "version": item.get("version", ""),
        }

        sample_file = output_dir / f"{sample['id'].replace('/', '__')}.json"
        with open(sample_file, "w") as f:
            json.dump(sample, f, indent=2)

        samples.append(sample)
        print(f"  [{i+1}/{count}] Downloaded: {sample['id']}")

    # 메타데이터 저장
    metadata = {
        "dataset": dataset,
        "count": len(samples),
        "samples": [s["id"] for s in samples]
    }
    with open(output_dir / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"\nDownloaded {len(samples)} samples to {output_dir}")
    return samples


def main():
    parser = argparse.ArgumentParser(description="Download SWE-bench samples")
    parser.add_argument("--count", type=int, default=10, help="Number of samples to download")
    parser.add_argument("--dataset", choices=["verified", "lite", "full"], default="verified", help="Dataset to use")
    parser.add_argument("--output", type=str, default="./samples", help="Output directory")

    args = parser.parse_args()

    download_samples(args.count, args.dataset, Path(args.output))


if __name__ == "__main__":
    main()
