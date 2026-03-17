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
  -> [draft]
  -> [review]
  -> [validation: FAIL]
  => [repair]
  => [final validation: PASS]
  -> [archive]
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
  -> [solve initial]
  -> [judge: FAIL]
  => [repair]
  => [re-judge: PASS]
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
  -> [solve initial]
  -> [judge initial: FAIL]
  => [repair]
  => [judge repaired: PASS]
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
  -> [draft]
  -> [review]
  -> [validation: FAIL]
  => [repair]
  => [final validation: PASS]
  -> [archive]
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
                 -> [run-1 result] -----------------------\
[run-with-watchdog] -> [run-2 result: FAIL] ---------------> [initial comparison]
                 -> [run-3 result] -----------------------/          |
                                                                    v
                                                         [comparison validation: FAIL]
                                                                    |
                                                                    v
                                                           [repair failed run]
                                                                    |
                                                                    v
                 -> [run-1 result] -----------------------\
                 -> [run-2 repaired result] ---------------> [final comparison]
                 -> [run-3 result] -----------------------/          |
                                                                    v
                                                         [final validation: PASS]
                                                                    |
                                                                    v
                                                                 [archive]
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
  -> [paper metadata + excerpts + claims]
  -> [initial verification report]
  -> [validation: FAIL]
  => [repair using same paper fixture]
  => [repaired verification report]
  => [final validation: PASS]
  -> [archive]
```

## 20 — longrun paper reproduction mini

```text
[run-with-watchdog]
  -> [paper metadata + reproduction task + source values + reported claim]
  -> [recompute paper-derived result]
  -> [compare with reported claim]
  -> [archive]
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
  -> real-paper reproduction flow
```

### Current ladder intuition

```text
small single-run primitives
  -> lifecycle combinations
  -> longrun runner contract
  -> comparison / aggregation
  -> real-paper verification
  -> paper-derived reproduction
```
