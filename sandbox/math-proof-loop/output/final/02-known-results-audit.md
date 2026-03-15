# Known Results Audit — 02-known-results-audit

---

## Overview

본 문서는 문제 $P(n): \sum_{k=1}^{n} k^3 = \left(\frac{n(n+1)}{2}\right)^2$의 증명을 위해 알려진 사실(known facts), 허용 가능한 가정(permissible assumptions), 미지 사항(unknowns), 예상되는 난이도 포인트(likely difficulty points)를 체계적으로 정리한다.

---

## 1. Known Facts

### 1.1 기본 산술 및 대수학

| Fact | Statement | Status |
|------|-----------|--------|
| **F1** | 덧셈/곱셈의 교환법칙, 결합법칙, 분배법칙 | Standard arithmetic |
| **F2** | 자연수에서 덧셈/곱셈에 대한 닫힘성 | Closure property |
| **F3** | 합동식: $\sum_{k=1}^{n} f(k) + g(k) = \sum_{k=1}^{n} f(k) + \sum_{k=1}^{n} g(k)$ | Linearity of sum |
| **F4** | 상수 인수 분리: $\sum_{k=1}^{n} c \cdot f(k) = c \cdot \sum_{k=1}^{n} f(k)$ | Scalar multiplication |

### 1.2 자연수 합 공식 (Already Established)

| Fact | Statement | Source |
|------|-----------|--------|
| **F5** | $\sum_{k=1}^{n} k = \frac{n(n+1)}{2}$ | Classical formula (assumed in problem frame) |
| **F6** | $1 + 2 + \cdots + n = \frac{n(n+1)}{2}$ | Equivalent to F5 |

**Note**: F5/F6은 본 증명에서 **가정**으로 사용하며 재증명하지 않음.

### 1.3 수학적 귀납법

| Fact | Statement | Status |
|------|-----------|--------|
| **F7** | 수학적 귀납법 원리: $P(1)$이 참이고 $P(k) \Rightarrow P(k+1)$이면 $\forall n \in \mathbb{Z}^+, P(n)$ | Proof technique |
| **F8** | 귀납법은 자연수 전체에 대한 명제 증명에 유효 | Applicability confirmed |

### 1.4 합 공식 관련 Known Results

| Fact | Statement | Relevance |
|------|-----------|-----------|
| **F9** | $\sum_{k=1}^{n} k^2 = \frac{n(n+1)(2n+1)}{6}$ | Related but not directly needed |
| **F10** | $\sum_{k=1}^{n} 1 = n$ | Trivial but may be used |

### 1.5 대수적 항등식

| Fact | Statement | Use Case |
|------|-----------|----------|
| **F11** | $(a+b)^2 = a^2 + 2ab + b^2$ | Expansion of RHS |
| **F12** | $n^2(n+1)^2 = (n(n+1))^2$ | Factorization |

---

## 2. Permissible Assumptions

### 2.1 Core Assumptions (From Problem Frame)

| ID | Assumption | Justification |
|----|------------|---------------|
| **A1** | $\sum_{k=1}^{n} k = \frac{n(n+1)}{2}$ | Given as established theorem |
| **A2** | 수학적 귀납법 사용 가능 | Standard proof technique |
| **A3** | 대수적 동치 변형 허용 | Logical equivalence preserved |
| **A4** | 유한 $n$에 대해 좌변/우변 계산 가능 | Computational verification possible |

### 2.2 Contextual Assumptions

| ID | Assumption | Notes |
|----|------------|-------|
| **A5** | 자연수 $\mathbb{Z}^+$만 고려 | 정수/유리수/실수 확장 제외 |
| **A6** | $n \ge 1$ | $n=0$은 정의에 따라 다를 수 있음 |

### 2.3 Assumptions NOT Made

- **Not assuming**: $\sum_{k=1}^{n} k^3$의 closed form을 이미 안다
- **Not assuming**: 일반적인 멱합 공식 $\sum k^m$
- **Not assuming**: 생성 함수 방법의 결과

---

## 3. Unknowns

### 3.1 Direct Unknowns (To Be Proven)

| ID | Unknown | Target |
|----|---------|--------|
| **U1** | $\sum_{k=1}^{n} k^3$의 closed form | Prove equals $\left(\frac{n(n+1)}{2}\right)^2$ |
| **U2** | 귀납 단계에서 필요한 항등식 | To be derived |

### 3.2 Strategic Unknowns

| ID | Unknown | Decision Needed |
|----|---------|-----------------|
| **U3** | 귀납법 vs 직접 전개 중 어느 것이 더 효율적인가? | Proof strategy selection |
| **U4** | 보조 lemma가 필요한가? | Lemma candidate generation |
| **U5** | 조합론적 해석이 도움이 되는가? | Alternative approach |

### 3.3 Verification Unknowns

| ID | Unknown | Method |
|----|---------|--------|
| **U6** | $n = 1, 2, 3, 4, 5$에서 실제로 일치하는가? | Direct computation |
| **U7** | 반례가 존재할 가능성이 있는가? | Counterexample search |

---

## 4. Likely Difficulty Points

### 4.1 Proof Construction Difficulties

| Difficulty | Description | Severity | Mitigation |
|------------|-------------|----------|------------|
| **D1** | 귀납 단계 전개의 복잡성 | Medium | 체계적인 대수 전개 |
| **D2** | $(n+1)^3$ 추가 후 항 정리 | Medium | 명시적 단계 기록 |
| **D3** | RHS의 제곱 전개: $\left(\frac{(n+1)(n+2)}{2}\right)^2$ | Medium | Factorization 사용 |
| **D4** | 귀납 가정과 목표식 간의 연결 | High | 항등식 증명 필요 |

### 4.2 Conceptual Difficulties

| Difficulty | Description | Severity | Mitigation |
|------------|-------------|----------|------------|
| **D5** | "자명하다"는 표현의 오용 | High | 모든 단계 명시적 근거 |
| **D6** | 합 공식의 의존 관계 혼동 | Medium | Assumption 명확화 |
| **D7** | 귀납법 기저 단계 생략 | Medium | $n=1$ 명시적 검증 |

### 4.3 False Progress Risks

| Risk | Description | Detection Method |
|------|-------------|------------------|
| **R1** | 대수 전개에서 항 누락 | 재계산 및 검증 |
| **R2** | 귀납 단계에서 순환 논증 | 논리 의존성 점검 |
| **R3** | "쉽게 확인할 수 있다" 생략 | 모든 계산 명시 |
| **R4** | 반례 점검 생략 | 소규모 $n$ 필수 검증 |

---

## 5. Gap Analysis

### 5.1 Current Knowledge State

```
Known: F1-F12, A1-A6
Unknown: U1-U7
To Prove: U1
Strategy: Induction (F7, F8) + Algebraic manipulation (F11, F12)
```

### 5.2 Gap Between Known and Target

| Gap | From | To | Required Action |
|-----|------|----|--------------------|
| **G1** | F5 (sum formula) | U1 (cubic sum formula) | Inductive proof or direct derivation |
| **G2** | Induction hypothesis | Inductive step conclusion | Algebraic identity proof |
| **G3** | Small $n$ verification | General $n$ proof | Induction principle application |

### 5.3 Critical Dependencies

```
Target U1
  ├─ Requires: A1 (sum formula as RHS)
  ├─ Requires: A2 (induction allowed)
  ├─ Requires: F7, F8 (induction principle)
  └─ Requires: G2 resolution (inductive step identity)
```

---

## 6. Proof Strategy Recommendations

### 6.1 Primary Strategy: Mathematical Induction

**Rationale**: 
- 문제가 "모든 양의 정수 $n$"에 대한 명제
- 귀납법은 자연수에 대한 보편적 증명 기법
- 기저 단계와 귀납 단계로 명확히 분리 가능

**Structure**:
1. Base case: $n = 1$
   - LHS: $1^3 = 1$
   - RHS: $\left(\frac{1 \cdot 2}{2}\right)^2 = 1$
   - Verified ✓

2. Inductive hypothesis: Assume for $n = k$
   $$\sum_{i=1}^{k} i^3 = \left(\frac{k(k+1)}{2}\right)^2$$

3. Inductive step: Prove for $n = k+1$
   $$\sum_{i=1}^{k+1} i^3 = \left(\frac{(k+1)(k+2)}{2}\right)^2$$

**Challenge**: G2 - Connecting hypothesis to conclusion

### 6.2 Alternative Strategy: Direct Algebraic Manipulation

**Rationale**: 
- RHS를 전개하여 LHS와 비교
- 귀납법 없이 직접 증명 가능할 수 있음

**Structure**:
1. Start with RHS: $\left(\frac{n(n+1)}{2}\right)^2 = \frac{n^2(n+1)^2}{4}$
2. Find expression for LHS: $\sum_{k=1}^{n} k^3$
3. Prove equality via known sum formulas

**Challenge**: LHS closed form 유도 필요

---

## 7. Next Steps

1. **Lemma Candidate Generation**:
   - L1: $(k+1)^3 = k^3 + 3k^2 + 3k + 1$
   - L2: $\sum_{k=1}^{n} k^2$ formula (if needed)
   - L3: Algebraic identity for inductive step

2. **Proof Attempt**:
   - Base case verification
   - Inductive step derivation
   - Gap identification

3. **Counterexample Check**:
   - $n = 1, 2, 3, 4, 5$ computation
   - Consistency verification

---

## 8. Summary

| Category | Count | Status |
|----------|-------|--------|
| Known Facts | 12 (F1-F12) | Available |
| Permissible Assumptions | 6 (A1-A6) | Defined |
| Unknowns | 7 (U1-U7) | To be resolved |
| Difficulty Points | 7 (D1-D7) | Identified |
| False Progress Risks | 4 (R1-R4) | To be monitored |
| Gaps | 3 (G1-G3) | To be bridged |

---

## Metadata

- **Document**: 02-known-results-audit.md
- **Created**: 2026-03-15
- **Purpose**: Establish knowledge boundary for proof construction
- **Next Document**: 03-lemma-candidates.md
- **Iteration**: 1

---

## Appendix: Key Formulas Reference

```
Sum of first n natural numbers:
  S₁(n) = 1 + 2 + ... + n = n(n+1)/2

Sum of squares:
  S₂(n) = 1² + 2² + ... + n² = n(n+1)(2n+1)/6

Target (to prove):
  S₃(n) = 1³ + 2³ + ... + n³ = [n(n+1)/2]² = S₁(n)²

Inductive step target:
  S₃(k+1) = S₃(k) + (k+1)³
          = [k(k+1)/2]² + (k+1)³
          = [(k+1)(k+2)/2]²
```
