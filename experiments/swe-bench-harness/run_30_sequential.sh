#!/bin/bash
set -euo pipefail

cd /Users/denovo/workspace/github/obora-kit

LOG_DIR="/tmp/obora-30seq-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$LOG_DIR"

python3 - <<'PY' > "$LOG_DIR/samples.txt"
from pathlib import Path
base = Path('experiments/swe-bench-harness/samples-no-answer')
files = sorted(p.stem for p in base.glob('*.json') if p.name != 'metadata.json')[:30]
for f in files:
    print(f)
PY
printf 'idx\tsample\tstatus\n' > "$LOG_DIR/summary.tsv"

idx=0
while IFS= read -r s; do
  [ -n "$s" ] || continue
  idx=$((idx+1))
  echo "=== [$idx/30] $s ===" | tee -a "$LOG_DIR/run.log"
  ./experiments/swe-bench-harness/run_repair_experiment.sh "$s" > "$LOG_DIR/$s.log" 2>&1 || true
  status=$(cat "experiments/swe-bench-harness/results-repair/$s/status.txt" 2>/dev/null || echo FAIL_UNKNOWN)
  printf '%s\t%s\t%s\n' "$idx" "$s" "$status" | tee -a "$LOG_DIR/summary.tsv"
  sleep 5
done < "$LOG_DIR/samples.txt"

pass=$(awk -F'\t' 'NR>1 && $3=="PASS" {c++} END{print c+0}' "$LOG_DIR/summary.tsv")
fail=$(awk -F'\t' 'NR>1 && $3!="PASS" {c++} END{print c+0}' "$LOG_DIR/summary.tsv")

echo "LOG_DIR=$LOG_DIR" | tee -a "$LOG_DIR/run.log"
echo "PASS=$pass" | tee -a "$LOG_DIR/run.log"
echo "FAIL=$fail" | tee -a "$LOG_DIR/run.log"
cat "$LOG_DIR/summary.tsv"
