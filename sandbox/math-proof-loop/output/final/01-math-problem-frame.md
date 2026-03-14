# 01. 수학 문제 정의 (Problem Frame)

## 1. 문제 정의

양의 정수 \( n \)에 대해 다음 합을 고려합니다.

\[
S(n) = \sum_{k=1}^{n} k^3 = 1^3 + 2^3 + \cdots + n^3
\]

이 값이 \( 1 \)부터 \( n \)까지의 합의 제곱과 항상 같음을 증명해야 합니다.

\[
\left( \sum_{k=1}^{n} k \right)^2 = \left( \frac{n(n+1)}{2} \right)^2
\]

따라서 명제는 다음과 같습니다.

\[
\sum_{k=1}^{n} k^3 = \left( \frac{n(n+1)}{2} \right)^2
\]

이 명제는 모든 양의 정수 \( n \ge 1 \)에 대해 성립해야 합니다.

---

## 2. Conjecture / Target Statement

> **Conjecture (귀납적 표현):**
> 
> - \( n = 1 \)일 때 성립한다.
> - \( n = m \)일 때 성립한다고 가정하면 \( n = m+1 \)일 때도 성립한다.
>
> 따라서 모든 양의 정수 \( n \)에 대해 다음이 성립한다.
> 
> \[
> \sum_{k=1}^{n} k^3 = \left( \frac{n(n+1)}{2} \right)^2
> \]

Target statement는 위 등식이 모든 양의 정수 \( n \)에 대해 참임을 **수학적 귀납법을 통해 증명**하는 것입니다.

---

## 3. Assumptions (전제)

1. **정의 영역:** \( n \)은 양의 정수, 즉 \( n \in \mathbb{Z}^+ \)입니다.
2. **알려진 사실(known facts):**
   - \( 1 \)부터 \( n \)까지의 합 공식: \( \sum_{k=1}^{n} k = \frac{n(n+1)}{2} \)
   - 세제곱의 합 공식이 미리 알려져 있지 않다고 가정합니다. 즉, 이 등식을 증명해야 합니다.
   - 자연수의 기본 성질(가환성, 결합성, 분배법칙 등)을 사용합니다.
3. **증명 방법:** 수학적 귀납법(기본 단계 + 귀납 단계)을 사용합니다.
4. **대수적 조작:** 다항식 전개, 인수분해, 등식 변형이 유효하다고 가정합니다.

---

## 4. Non-Goals (이 증명에서 다루지 않는 것)

- 세제곱의 합을 **다른 방법**(예: 조합론적 해석, 적분 근사 등)으로 유도하는 것.
- 일반화된 거듭제곱 합(예: \( \sum k^p \), \( p \ge 4 \))에 대한 논의.
- 복소수, 음수, 실수 등 다른 정의 영역으로의 확장.
- 계산 복잡도나 알고리즘적 효율성에 대한 분석.
- "어떻게 이 공식을 발견했는지"에 대한 역사적/발견적 논의.

---

## 5. 이번 Iteration의 성공 조건

이번 iteration은 **난제급 증명 탐색 루프를 구조화하는 것**이 핵심 목표입니다. 다음 조건이 모두 충족되어야 합니다.

1. **문제 정의와 Target Statement가 명확히 분리**되어야 한다.
   - Conjecture가 귀납적 형태로 명시된다.
   - 사용하는 전제(assumptions)가 명확히 나열된다.
   - Non-goals가 명시되어 scope 초과를 방지한다.

2. **Lemma 후보가 적절히 쪼개져야 한다.**
   - 기본 단계(base case) 검증
   - 귀납 단계(inductive step)에서 사용될 보조 정리(예: \( (m+1)^3 \) 전개, \( \frac{(m+1)(m+2)}{2} \) 제곱 전개)

3. **Proof attempt가 단계별로 작성되어야 한다.**
   - 귀납적 증명 구조를 따른다.
   - 각 단계의 계산이 명시적으로 기록된다.

4. **Counterexample/Consistency check가 독립 단계로 수행되어야 한다.**
   - \( n = 1, 2, 3 \) 등에 대해 직접 검증한다.
   - 귀납 가정 하에서 \( n = m+1 \)에 대한 식이 모순 없이 전개되는지 확인한다.

5. **Proof gap이 명시되어야 한다.**
   - 단순히 "자명하다"고 넘어가지 않고, 전개 과정에서 사용된 사실/보조 정리를 기록한다.
   - 만약 어느 단계에서 가정이 추가되었다면 그것을 명시한다.

6. **Final conclusion이 `solved / partially supported / unresolved / refuted` 중 하나로 명시된다.**
   - 이번 문제에서는 `solved`가 기대되지만, 과정에서 발생한 gap이나 불확실성을 정확히 기록해야 한다.

7. **Archive 문서가 탐색 기록으로 유의미해야 한다.**
   - 문제 정의, known facts, lemma, proof attempt, counterexample check, review, remediation이 분리되어 기록된다.
   - 다음 iteration이나 다른 문제에서 재사용 가능한 형태로 정리된다.

---

## 6. 다음 단계

- **Step 2:** Known results 및 필요한 lemma를 식별하고 정리합니다.
- **Step 3:** Proof attempt(수학적 귀납법)를 작성합니다.
- **Step 4:** Counterexample/Consistency check를 수행합니다.
- **Step 5:** Review 및 remediation을 통해 proof gap을 식별하고 보완합니다.
- **Step 6:** Final conclusion과 archive를 작성합니다.
