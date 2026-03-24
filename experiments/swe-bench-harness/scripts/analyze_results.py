#!/usr/bin/env python3
"""
SWE-bench 실험 결과 분석 스크립트

Usage:
    python scripts/analyze_results.py --results ./results
"""

import argparse
import json
import os
from pathlib import Path
from collections import defaultdict


def load_results(results_dir: Path):
    """실험 결과 로드"""

    results = defaultdict(list)

    for mode_dir in results_dir.iterdir():
        if not mode_dir.is_dir():
            continue

        mode = mode_dir.name
        if mode in ["analysis", "charts"]:
            continue

        for sample_dir in mode_dir.iterdir():
            if not sample_dir.is_dir():
                continue

            result_file = sample_dir / "result.json"
            if not result_file.exists():
                continue

            with open(result_file) as f:
                result = json.load(f)

            # execution.log에서 추가 정보 추출
            log_file = sample_dir / "execution.log"
            if log_file.exists():
                with open(log_file) as f:
                    log = f.read()
                    result["log"] = log

                    # Pass/Fail 추정 (간단한 휴리스틱)
                    if "PASS" in log or "passed" in log.lower():
                        result["status"] = "pass"
                    elif "FAIL" in log or "failed" in log.lower():
                        result["status"] = "fail"
                    else:
                        result["status"] = "unknown"

            results[mode].append(result)

    return results


def analyze_mode(mode: str, samples: list):
    """단일 모드 분석"""

    total = len(samples)
    passed = sum(1 for s in samples if s.get("status") == "pass")
    failed = sum(1 for s in samples if s.get("status") == "fail")
    unknown = sum(1 for s in samples if s.get("status") == "unknown")

    durations = [s.get("duration_ms", 0) for s in samples]
    avg_duration = sum(durations) / len(durations) if durations else 0

    return {
        "mode": mode,
        "total": total,
        "passed": passed,
        "failed": failed,
        "unknown": unknown,
        "pass_rate": (passed / total * 100) if total > 0 else 0,
        "avg_duration_ms": avg_duration,
        "avg_duration_s": avg_duration / 1000,
    }


def generate_report(results: dict, output_dir: Path):
    """분석 보고서 생성"""

    output_dir.mkdir(parents=True, exist_ok=True)

    # 각 모드 분석
    analysis = {}
    for mode, samples in results.items():
        analysis[mode] = analyze_mode(mode, samples)

    # 요약 보고서 (Markdown)
    summary_md = output_dir / "summary.md"
    with open(summary_md, "w") as f:
        f.write("# SWE-bench Harness Experiment Results\n\n")
        f.write("## Summary\n\n")
        f.write("| Mode | Total | Passed | Pass Rate | Avg Duration |\n")
        f.write("|------|-------|--------|-----------|-------------|\n")

        for mode, data in analysis.items():
            f.write(
                f"| {mode} | {data['total']} | {data['passed']} | "
                f"{data['pass_rate']:.1f}% | {data['avg_duration_s']:.1f}s |\n"
            )

        f.write("\n## Detailed Results\n\n")

        for mode, samples in results.items():
            f.write(f"### {mode}\n\n")
            for sample in samples:
                status = sample.get("status", "unknown")
                duration = sample.get("duration_ms", 0) / 1000
                f.write(f"- **{sample.get('sample', 'unknown')}**: {status} ({duration:.1f}s)\n")
            f.write("\n")

        # 개선율 계산 (baseline 대비)
        if "baseline" in analysis and "repair-loop" in analysis:
            baseline_rate = analysis["baseline"]["pass_rate"]
            repair_rate = analysis["repair-loop"]["pass_rate"]
            improvement = repair_rate - baseline_rate

            f.write("## Improvement Analysis\n\n")
            f.write(f"- **Baseline Pass Rate**: {baseline_rate:.1f}%\n")
            f.write(f"- **Repair Loop Pass Rate**: {repair_rate:.1f}%\n")
            f.write(f"- **Improvement**: +{improvement:.1f}pp\n")

            if improvement >= 20:
                f.write(f"\n✅ **H1 Confirmed**: Improvement ≥ 20pp\n")
            else:
                f.write(f"\n❌ **H1 Not Confirmed**: Improvement < 20pp\n")

    print(f"Summary written to: {summary_md}")

    # 상세 JSON
    detailed_json = output_dir / "detailed.json"
    with open(detailed_json, "w") as f:
        json.dump({
            "analysis": analysis,
            "raw_results": {k: v for k, v in results.items()}
        }, f, indent=2)

    print(f"Detailed results written to: {detailed_json}")

    # 콘솔 출력
    print("\n" + "=" * 60)
    print("RESULTS SUMMARY")
    print("=" * 60)
    for mode, data in analysis.items():
        print(f"\n{mode}:")
        print(f"  Pass Rate: {data['pass_rate']:.1f}% ({data['passed']}/{data['total']})")
        print(f"  Avg Duration: {data['avg_duration_s']:.1f}s")

    if "baseline" in analysis and "repair-loop" in analysis:
        improvement = analysis["repair-loop"]["pass_rate"] - analysis["baseline"]["pass_rate"]
        print(f"\nImprovement (Repair Loop vs Baseline): +{improvement:.1f}pp")


def main():
    parser = argparse.ArgumentParser(description="Analyze SWE-bench experiment results")
    parser.add_argument("--results", type=str, required=True, help="Results directory")
    parser.add_argument("--output", type=str, default=None, help="Output directory (default: results/analysis)")

    args = parser.parse_args()

    results_dir = Path(args.results)
    output_dir = Path(args.output) if args.output else results_dir / "analysis"

    results = load_results(results_dir)
    generate_report(results, output_dir)


if __name__ == "__main__":
    main()
