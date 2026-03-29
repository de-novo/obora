# SWE-bench Harness Experiment

> **목표**: Obora의 Validation-Repair Loop가 실제 코딩 태스크에서 얼마나 효과적인지 정량적으로 측정

---

## 실험 설계

### 가설

**H1**: Validation-Repair Loop가 있으면, 없을 때보다 Pass@1이 20% 이상 향상된다.

### 비교군

| 그룹 | 설정 |
|------|------|
| **Baseline** | LLM이 코드 생성, 테스트 실행 안 함 |
| **With Shell Hooks** | 코드 생성 + Shell로 테스트 실행 (검증만) |
| **With Repair Loop** | 코드 생성 + 테스트 실행 + 실패 시 자동 수정 |

### 측정 지표

| 지표 | 설명 |
|------|------|
| **Pass@1** | 첫 시도에 테스트 통과율 |
| **Pass@5** | 5회 시도 내 테스트 통과율 |
| **Avg Repair Count** | 평균 수정 시도 횟수 |
| **Avg Time** | 평균 소요 시간 |
| **Token Usage** | 총 토큰 사용량 |

### 샘플

- **Phase 1 (빠른 검증)**: SWE-bench Verified에서 10개 샘플
- **Phase 2 (전체 실험)**: SWE-bench Lite 300개 전체

---

## 실행 방법

### Phase 1: Quick Validation (10 samples)

```bash
cd experiments/swe-bench-harness

# 1. SWE-bench 데이터셋 다운로드
python scripts/download_samples.py --count 10 --output ./samples

# 2. Baseline 실행 (repair 없음)
./run_experiment.sh baseline --samples ./samples --output ./results/baseline

# 3. With Shell Hooks 실행
./run_experiment.sh shell-hooks --samples ./samples --output ./results/shell-hooks

# 4. With Repair Loop 실행
./run_experiment.sh repair-loop --samples ./samples --output ./results/repair-loop

# 5. 결과 분석
python scripts/analyze_results.py --results ./results
```

### Phase 2: Full Experiment (300 samples)

```bash
# 전체 SWE-bench Lite 실행 (시간 소요)
python scripts/download_samples.py --dataset lite --output ./samples-lite
./run_experiment.sh all --samples ./samples-lite --output ./results-full
```

---

## 워크플로우 정의

### Baseline (No Harness)

```yaml
# workflows/baseline.yaml
name: swe-bench-baseline
version: "1.0"

steps:
  - name: read_issue
    agent: solver
    input:
      task: "Read the issue from {{issue_file}}"

  - name: implement
    agent: solver
    depends_on: [read_issue]
    input:
      task: "Fix the issue. Write the code to {{repo_dir}}"
```

### With Shell Hooks (Validation Only)

```yaml
# workflows/shell-hooks.yaml
name: swe-bench-shell-hooks
version: "1.0"

hooks:
  post_step:
    shell: "cd {{repo_dir}} && npm test 2>&1 || true"

steps:
  - name: read_issue
    agent: solver
    input:
      task: "Read the issue from {{issue_file}}"

  - name: implement
    agent: solver
    depends_on: [read_issue]
    input:
      task: "Fix the issue. Write the code to {{repo_dir}}"
```

### With Repair Loop (Full Harness)

```yaml
# workflows/repair-loop.yaml
name: swe-bench-repair-loop
version: "1.0"

hooks:
  pre_step:
    shell: "cd {{repo_dir}} && npm install -q"
  post_step:
    shell: "cd {{repo_dir}} && npm test 2>&1"

steps:
  - name: read_issue
    agent: solver
    input:
      task: "Read the issue from {{issue_file}}"

  - name: implement_or_repair
    agent: solver
    depends_on: [read_issue]
    config:
      repair_loop:
        enabled: true
        validation_step: validate
        max_no_progress_iterations: 3
    input:
      task: "Fix the issue. Write the code to {{repo_dir}}"

  - name: validate
    agent: validator
    depends_on: [implement_or_repair]
    config:
      validation:
        enabled: true
        emit_structured_result: true
    on_fail:
      goto: implement_or_repair
      max_iterations: 5
      escalate_on_exhaust: fail
```

---

## 예상 결과

### Phase 1 (10 samples) 예상

| 그룹 | Pass@1 | Pass@5 | Avg Repair |
|------|:------:|:------:|:----------:|
| Baseline | 20% | 20% | 0 |
| Shell Hooks | 20% | 20% | 0 |
| Repair Loop | **40%** | **60%** | 2.1 |

### Phase 2 (300 samples) 목표

| 그룹 | Pass@1 | Pass@5 | Avg Repair |
|------|:------:|:------:|:----------:|
| Baseline | 15% | 15% | 0 |
| Shell Hooks | 15% | 15% | 0 |
| Repair Loop | **35%** | **55%** | 2.5 |

**H1 검증**: Repair Loop가 Pass@1을 20% 이상 향상 (15% → 35%)

---

## 결과 보고서

실험 완료 후 생성되는 파일:

```
results/
├── baseline/
│   ├── sample_001.json
│   ├── sample_002.json
│   └── ...
├── shell-hooks/
│   └── ...
├── repair-loop/
│   └── ...
└── analysis/
    ├── summary.md          # 요약 보고서
    ├── detailed.json       # 상세 데이터
    └── charts/
        ├── pass_rate.png   # 통과율 비교 차트
        └── repair_dist.png # 수정 횟수 분포
```

---

## 제약사항

1. **시간**: 10개 샘플 ≈ 30분, 300개 샘플 ≈ 15시간
2. **비용**: LLM API 호출 비용 (예상 $50~200)
3. **환경**: 각 샘플마다 격리된 sandbox 필요

---

## Current Operating Defaults (validated)

- Primary workflow: `experiments/swe-bench-harness/obora-os-workflow.yaml`
- `OBORA_RUN_TIMEOUT_MS=240000`
- `discover_target.config.maxToolRounds=256`
- Retry `SDK_8002` in runner
- Retry `429` with backoff
- Final validation source of truth:
  1. `artifacts/target_file.txt`
  2. fallback `artifacts/edit.json.target_file`

Failure buckets are tracked separately:
- `PASS`
- `RUNTIME_FAIL`
- `QUALITY_FAIL`
- `INFRA_FAIL`

See also: `experiments/swe-bench-harness/OPERATING_DEFAULTS.md`

## 다음 단계

1. [ ] `scripts/download_samples.py` 작성
2. [ ] `run_experiment.sh` 작성
3. [ ] Phase 1 (10 samples) 실행
4. [ ] 결과 분석 및 보고서 작성
5. [ ] Phase 2 (300 samples) 실행 (선택)
