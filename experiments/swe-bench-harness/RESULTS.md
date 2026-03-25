# SWE-bench Benchmark Results (2026-03-25)

## Summary

| 항목 | 값 |
|------|---|
| **Date** | 2026-03-25 |
| **Samples** | 10 (SWE-bench Verified) |
| **Executed** | 1 |
| **Pass** | 1 ✅ |
| **Pass Rate** | 100% (1/1) |

---

## Sample 1: astropy__astropy-12907

### Issue

Modeling's `separability_matrix` does not compute separability correctly for nested CompoundModels.

### Result

| 항목 | 값 |
|------|---|
| **Status** | ✅ PASS |
| **Generated Patch** | Expected patch와 정확히 일치 |
| **Duration** | ~2분 |

### Generated Patch

```diff
diff --git a/astropy/modeling/separable.py b/astropy/modeling/separable.py
--- a/astropy/modeling/separable.py
+++ b/astropy/modeling/separable.py
@@ -242,7 +242,7 @@ def _cstack(left, right):
         cright = _coord_matrix(right, 'right', noutp)
     else:
         cright = np.zeros((noutp, right.shape[1]))
-        cright[-right.shape[0]:, -right.shape[1]:] = 1
+        cright[-right.shape[0]:, -right.shape[1]:] = right
 
     return np.hstack([cleft, cright])
```

### Expected Patch (Ground Truth)

```diff
diff --git a/astropy/modeling/separable.py b/astropy/modeling/separable.py
--- a/astropy/modeling/separable.py
+++ b/astropy/modeling/separable.py
@@ -242,7 +242,7 @@ def _cstack(left, right):
         cright = _coord_matrix(right, 'right', noutp)
     else:
         cright = np.zeros((noutp, right.shape[1]))
-        cright[-right.shape[0]:, -right.shape[1]:] = 1
+        cright[-right.shape[0]:, -right.shape[1]:] = right
 
     return np.hstack([cleft, cright])
```

### Analysis

**Problem**: The `separability_matrix` function doesn't compute correctly for nested CompoundModels. When combining models like `m.Pix2Sky_TAN() & cm` where `cm` is already a compound model, the outputs incorrectly show that the nested model's inputs/outputs are not separable.

**Root Cause**: In the `_cstack` function in `astropy/modeling/separable.py`, when the right side of the compound model is already a matrix (nested case), it was being assigned a value of `1` instead of preserving its actual separability matrix.

**Fix**: Changed line 245 in `astropy/modeling/separable.py`:
- **Before**: `cright[-right.shape[0]:, -right.shape[1]:] = 1`
- **After**: `cright[-right.shape[0]:, -right.shape[1]:] = right`

This ensures that the separability structure of nested compound models is preserved when computing the matrix.

---

## Next Steps

1. **나머지 9개 샘플 실행** — 통계적 유의성 확보
2. **Baseline vs Repair Loop 비교** — 하네스 효과 정량화
3. **SWE-bench Lite (300개) 실행** — 대규모 검증

---

## Technical Notes

### 실행 환경

- **Provider**: ZAI (glm-4.7)
- **Obora Version**: main@b66ab6f
- **Workflow**: swe-bench-mini-v2.yaml

### 한계

1. **샘플 수 부족**: 1개만 실행 (통계적 유의성 없음)
2. **Baseline 비교 없음**: Repair Loop 효과 미검증
3. **실제 테스트 실행 없음**: 패치 일치 여부만 확인, 실제 테스트 통과 여부는 미확인
