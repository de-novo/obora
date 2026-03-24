# Quick Benchmark Results (2026-03-25)

## 실행 환경

- **Provider**: ZAI (glm-4.7)
- **Date**: 2026-03-25 01:54 ~ 02:18 (KST)
- **Obora Version**: main@974cf50

---

## 결과 요약

### Baseline (No Harness)

| 항목 | 값 |
|------|---|
| **Workflow** | quick-benchmark-baseline-simple |
| **Status** | ✅ completed |
| **Steps** | implement (1개) |
| **Duration** | ~2분 |
| **Tokens** | 14,145 total |
| **Output** | 코드 생성 완료 |

### Repair Loop Mini

| 항목 | 값 |
|------|---|
| **Workflow** | quick-benchmark-repair-loop-mini |
| **Status** | ✅ completed |
| **Steps** | implement → validate (2개) |
| **Duration** | ~5초 |
| **Repair Attempts** | 0 (첫 시도에 통과) |

---

## 분석

### 1. ZAI Rate Limit 이슈

오늘 overnight-builder 실행(40분, 7 steps)으로 인해 **일일 rate limit 초과**.
- 10:00 ~ 01:00 (약 15시간) 동안 429 error 지속
- 01:54경 rate limit 해제, 벤치마크 실행 가능

### 2. Workflow 복잡도 이슈

초기 워크플로우가 너무 복잡해서:
- `read_task` step에서 tool-call iteration limit (128) 초과
- Repair Loop가 여러 번 순회하다 timeout

**해결**: 워크플로우 단순화로 성공

### 3. Obora 안정성

- Baseline: 1회 실행으로 완료 ✅
- Repair Loop: 2개 step 모두 완료 ✅
- 에러/크래시 없음

---

## 결론

### 기술적 검증

| 검증 항목 | 결과 |
|-----------|:----:|
| ZAI Provider 연동 | ✅ |
| 단일 Step 실행 | ✅ |
| Multi-Step 실행 | ✅ |
| Repair Loop 구조 | ✅ |
| Workflow 완료 | ✅ |

### 한계

1. **샘플 수 부족**: 1개 샘플만 실행 (통계적 유의성 없음)
2. **실제 SWE-bench 미실행**: Mock 샘플로만 테스트
3. **Repair 효과 미검증**: 모든 케이스가 첫 시도에 통과

---

## 다음 단계

### 1. SWE-bench 실제 실행 (Rate limit 해제 후)

```bash
# 10개 샘플
python scripts/download_samples.py --count 10 --output ./samples
./run_experiment.sh all --samples ./samples --output ./results
```

### 2. 정량적 비교

| 그룹 | Pass@1 | Pass@5 | Avg Repair |
|------|--------|--------|------------|
| Baseline | ? | ? | 0 |
| Repair Loop | ? | ? | ? |

### 3. 문서화 및 npm publish

벤치마크 결과 포함 후 공개

---

## 실행 로그

### Baseline

```
[2m  → implement[0m
[32m✅ Workflow "quick-benchmark-baseline-simple" completed.[0m
```

### Repair Loop Mini

```
[2m  → implement[0m
[2m  → validate[0m
[32m✅ Workflow "quick-benchmark-repair-loop-mini" completed.[0m
```
