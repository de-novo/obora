#!/bin/bash
#
# SWE-bench Harness Experiment Runner
#
# Usage:
#   ./run_experiment.sh baseline --samples ./samples --output ./results/baseline
#   ./run_experiment.sh shell-hooks --samples ./samples --output ./results/shell-hooks
#   ./run_experiment.sh repair-loop --samples ./samples --output ./results/repair-loop
#   ./run_experiment.sh all --samples ./samples --output ./results
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OBORA_BIN="$PROJECT_ROOT/bin/obora.js"

# 기본값
SAMPLES_DIR=""
OUTPUT_DIR=""
MODEL="glm-4.7"
PROVIDER="zai"
TIMEOUT=600000  # 10분

usage() {
    echo "Usage: $0 <mode> --samples <dir> --output <dir>"
    echo ""
    echo "Modes:"
    echo "  baseline      No harness (LLM only)"
    echo "  shell-hooks   With Shell Hooks (validation only)"
    echo "  repair-loop   With full Validation-Repair Loop"
    echo "  all           Run all three modes"
    echo ""
    echo "Options:"
    echo "  --samples     Directory containing sample JSON files"
    echo "  --output      Output directory for results"
    echo "  --model       Model to use (default: glm-4.7)"
    echo "  --provider    Provider to use (default: zai)"
    echo "  --timeout     Timeout per sample in ms (default: 600000)"
    exit 1
}

# 인자 파싱
MODE=""
while [[ $# -gt 0 ]]; do
    case $1 in
        baseline|shell-hooks|repair-loop|all)
            MODE="$1"
            shift
            ;;
        --samples)
            SAMPLES_DIR="$2"
            shift 2
            ;;
        --output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --model)
            MODEL="$2"
            shift 2
            ;;
        --provider)
            PROVIDER="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

if [[ -z "$MODE" || -z "$SAMPLES_DIR" || -z "$OUTPUT_DIR" ]]; then
    usage
fi

# API Key 확인
if [[ "$PROVIDER" == "zai" && -z "$ZAI_API_KEY" ]]; then
    echo "Error: ZAI_API_KEY not set"
    exit 1
fi
if [[ "$PROVIDER" == "openai" && -z "$OPENAI_API_KEY" ]]; then
    echo "Error: OPENAI_API_KEY not set"
    exit 1
fi
if [[ "$PROVIDER" == "anthropic" && -z "$ANTHROPIC_API_KEY" ]]; then
    echo "Error: ANTHROPIC_API_KEY not set"
    exit 1
fi

# 샘플 목록 가져오기
SAMPLES=($(ls "$SAMPLES_DIR"/*.json 2>/dev/null | grep -v metadata || true))
if [[ ${#SAMPLES[@]} -eq 0 ]]; then
    echo "Error: No sample files found in $SAMPLES_DIR"
    exit 1
fi

echo "=========================================="
echo "SWE-bench Harness Experiment"
echo "=========================================="
echo "Mode:      $MODE"
echo "Samples:   ${#SAMPLES[@]} files"
echo "Output:    $OUTPUT_DIR"
echo "Model:     $MODEL"
echo "Provider:  $PROVIDER"
echo "=========================================="
echo

# 결과 디렉토리 생성
mkdir -p "$OUTPUT_DIR"

run_single_sample() {
    local SAMPLE_FILE="$1"
    local WORKFLOW="$2"
    local SAMPLE_NAME=$(basename "$SAMPLE_FILE" .json)

    echo "[$(date +%H:%M:%S)] Running: $SAMPLE_NAME"

    # 샘플별 작업 디렉토리
    local WORK_DIR="$OUTPUT_DIR/$SAMPLE_NAME"
    mkdir -p "$WORK_DIR"

    # 실행
    local START_TIME=$(date +%s%3N)

    node "$OBORA_BIN" run "$SCRIPT_DIR/workflows/$WORKFLOW.yaml" \
        --config "$SCRIPT_DIR/configs/experiment.yaml" \
        --agents "$SCRIPT_DIR/agents.yaml" \
        --var "issue_file=$SAMPLE_FILE" \
        --var "sample_name=$SAMPLE_NAME" \
        --var "output_dir=$WORK_DIR" \
        --output-dir "$WORK_DIR/obora-output" \
        --timeout "$TIMEOUT" \
        2>&1 | tee "$WORK_DIR/execution.log" || true

    local END_TIME=$(date +%s%3N)
    local DURATION=$((END_TIME - START_TIME))

    # 결과 수집
    local RESULT_FILE="$WORK_DIR/result.json"
    echo "{\"sample\": \"$SAMPLE_NAME\", \"duration_ms\": $DURATION, \"mode\": \"$MODE\"}" > "$RESULT_FILE"

    echo "[$(date +%H:%M:%S)] Completed: $SAMPLE_NAME (${DURATION}ms)"
    echo
}

run_mode() {
    local WORKFLOW="$1"
    local MODE_NAME="$2"

    echo "========== Running: $MODE_NAME =========="
    echo

    local COUNT=0
    local SUCCESS=0
    local FAILED=0

    for SAMPLE in "${SAMPLES[@]}"; do
        COUNT=$((COUNT + 1))
        echo "[$COUNT/${#SAMPLES[@]}] $(basename $SAMPLE .json)"

        if run_single_sample "$SAMPLE" "$WORKFLOW"; then
            SUCCESS=$((SUCCESS + 1))
        else
            FAILED=$((FAILED + 1))
        fi
    done

    echo
    echo "========== $MODE_NAME Complete =========="
    echo "Total:   $COUNT"
    echo "Success: $SUCCESS"
    echo "Failed:  $FAILED"
    echo
}

# 메인 실행
case "$MODE" in
    baseline)
        run_mode "baseline" "Baseline (No Harness)"
        ;;
    shell-hooks)
        run_mode "shell-hooks" "With Shell Hooks"
        ;;
    repair-loop)
        run_mode "repair-loop" "With Repair Loop"
        ;;
    all)
        run_mode "baseline" "Baseline (No Harness)"
        run_mode "shell-hooks" "With Shell Hooks"
        run_mode "repair-loop" "With Repair Loop"
        ;;
esac

echo "=========================================="
echo "Experiment Complete"
echo "Results: $OUTPUT_DIR"
echo "=========================================="
