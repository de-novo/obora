# Canonical Sandbox ASCII Flows

> Last updated: 2026-03-17

이 문서는 현재 canonical sandbox `01~20`의 workflow 흐름을 **ASCII 다이어그램**으로 빠르게 이해하기 위한 보조 문서다.

## 읽는 법

- `[]` : step 또는 artifact
- `->` : 순차 흐름
- `=>` : repair / retry / re-validation 같은 상태 전이
- 여러 줄이 합쳐지는 곳은 merge/comparison/judge 지점을 뜻한다

---

## 01 — simple native

```text
[input]
  -> [native step]
  -> [output]
```

## 02 — simple review

```text
[input]
  -> [draft]
  -> [review]
  -> [final output]
```

## 03 — simple validation

```text
[input]
  -> [draft]
  -> [validation]
  -> [validation report]
```

## 04 — simple loop

```text
[input]
  -> [draft]
  -> [validation: FAIL]
  => [repair]
  => [validation: PASS]
```

## 05 — simple archive

```text
[input]
  -> [final result]
  -> [archive note]
```

## 06 — project mini

```text
[brief]
  -> [draft]
  -> [review]
  -> [final]
  -> [validation]
  -> [archive]
```

## 07 — project loop

```text
[brief]
  -> [build_or_repair]
  -> [review_project]
  -> [validate_project]
       | FAIL
       => [runtime back-edge to build_or_repair]
       | PASS
       -> [archive_project]
```

## 08 — benchmark mini

```text
[problem]
  -> [solve]
  -> [judge]
  -> [archive]
```

## 09 — benchmark loop

```text
[problem]
  -> [solve_or_repair]
  -> [judge]
       | FAIL
       => [runtime back-edge to solve_or_repair]
       | PASS
       -> [archive]
```

---

## 10 — longrun mini

```text
[run-with-watchdog]
  -> [plan]
  -> [refine]
  -> [archive]
```

## 11 — longrun loop

```text
[run-with-watchdog]
  -> [attempt]
  -> [validation: FAIL]
  => [repair]
  => [final validation: PASS]
  -> [archive]
```

## 12 — longrun benchmark mini

```text
[run-with-watchdog]
  -> [solve]
  -> [judge]
  -> [archive]
```

## 13 — longrun benchmark loop

```text
[run-with-watchdog]
  -> [solve_or_repair]
  -> [judge]
       | FAIL
       => [runtime back-edge to solve_or_repair]
       | PASS
       -> [archive]
```

## 14 — longrun project mini

```text
[run-with-watchdog]
  -> [draft]
  -> [review]
  -> [final]
  -> [validation: PASS]
  -> [archive]
```

## 15 — longrun project loop

```text
[run-with-watchdog]
  -> [build_or_repair]
  -> [review_project]
  -> [validate_project]
       | FAIL
       => [runtime back-edge to build_or_repair]
       | PASS
       -> [archive_project]
```

---

## 16 — multi-run comparison mini

```text
                 -> [run-1 result] --\
[run-with-watchdog] -> [run-2 result] ----> [comparison summary] -> [archive]
                 -> [run-3 result] --/
```

## 17 — multi-run comparison loop

```text
[run-with-watchdog]
  -> [run-1 result]
  -> [run-2 result: FAIL]
  -> [run-3 result]
  -> [compare_or_repair]
  -> [validate_comparison]
       | FAIL
       => [runtime back-edge to compare_or_repair]
       => [repair only the failing run named by validation]
       | PASS
       -> [archive]
```

---

## 18 — longrun paper verification mini

```text
[run-with-watchdog]
  -> [paper metadata + excerpts + claims]
  -> [paper verification report]
  -> [archive]
```

## 19 — longrun paper verification loop

```text
[run-with-watchdog]
  -> [verify_or_repair]
  -> [validate_paper_verification]
       | FAIL
       => [runtime back-edge to verify_or_repair]
       => [repair same report with same vendored fixture]
       | PASS
       -> [archive]
```

## 20 — longrun feedback convergence loop

```text
[run-with-watchdog]
  -> [build_or_repair]
  -> [validate: score N/10]
       | FAIL / threshold not reached
       => [runtime back-edge via on_fail.goto]
       => [build_or_repair using latest validation]
       => [validate again]
       | PASS / threshold reached
       -> [archive]

loop invariant:
  validator emits structured result for runtime control
  builder consumes actual latest validation feedback
  iteration continues until threshold or loop stop guard is hit
```

---

## Family summary

### Foundation (01~09)

```text
native -> review -> validation -> repair -> archive
                     \-> project lifecycle
                     \-> benchmark lifecycle
```

### Longrun family (10~20)

```text
watchdog runner
  -> direct flow (mini)
  -> fail/repair/pass flow (loop)
  -> benchmark flow
  -> project flow
  -> multi-run comparison flow
  -> real-paper verification flow
  -> feedback convergence flow
```

### Current ladder intuition

```text
small single-run primitives
  -> lifecycle combinations
  -> longrun runner contract
  -> comparison / aggregation
  -> real-paper verification
  -> threshold-driven feedback convergence
```
