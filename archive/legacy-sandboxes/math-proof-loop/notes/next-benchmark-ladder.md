# Next Math Benchmark Ladder

> 목적: `math-proof-loop`가 단순한 고전 정리 정리기를 넘어서, 더 어려운 증명/반례/미해결형 탐색에서 어디까지 유효한지 단계적으로 검증한다.

## 평가 기준

다음 문제를 고를 때는 정답 유무보다 아래를 본다.

1. 문제 framing이 정확한가
2. known facts / assumptions / lemmas / proof attempts가 분리되는가
3. false progress를 counterexample-check와 review가 잘 잡는가
4. solved / partially_supported / unresolved / refuted를 정직하게 구분하는가
5. 실패해도 archive 가치가 남는가

---

## 추천 순서

### Tier 1 — 닫힌 문제, 하지만 지금보다 한 단계 어려운 정리

#### A. 홀수 합 공식
\[
1 + 3 + 5 + \cdots + (2n-1) = n^2
\]
- 이유: 쉬운 편이지만 귀납/도형/반례 점검 여러 스타일 비교 가능
- 기대: 너무 쉬워서 false progress를 못 잡는지 확인 가능
- 추천도: 낮음 (이미 현재 능력보다 쉬움)

#### B. 등차수열 제곱합 공식
\[
\sum_{k=1}^{n} k^2 = \frac{n(n+1)(2n+1)}{6}
\]
- 이유: 세제곱합보다 한 단계 아래/비슷하지만 대수 전개와 귀납 구조가 더 복잡함
- 기대: 대수 전개 신뢰성과 gap 관리 품질 점검
- 추천도: 중간

#### C. 이항정리의 정수 지수 버전
\[
(a+b)^n = \sum_{k=0}^{n} \binom{n}{k} a^{n-k} b^k
\]
- 이유: 조합론/귀납법 두 방식 가능
- 기대: 한 문제에 여러 증명 전략을 비교할 수 있음
- 추천도: 높음

---

### Tier 2 — 반례 탐색이 중요한 문제

#### D. 모든 소수 p>2는 홀수이다
- 이유: 쉬워 보이지만 정의/예외 처리 정확성을 본다
- 기대: trivial 문제에서 over-documentation vs precise framing 구분
- 추천도: 낮음

#### E. \(2^n - 1\) 이 항상 소수인가?
- 기대 분류: **refuted**
- 이유: 반례 탐색 중심 테스트로 매우 적합
- 기대: 모델이 “항상 참” 같은 성급한 결론을 얼마나 잘 피하는지 확인 가능
- 추천도: 매우 높음

#### F. 모든 짝수는 두 소수의 합으로 표현되는가? (Goldbach)
- 기대 분류: **unresolved**
- 이유: 미해결 문제이며 계산 검증은 가능하지만 일반 증명은 불가능
- 기대: solved인 척하지 않고 bounded conclusion으로 멈추는지 테스트 가능
- 추천도: 매우 높음

---

### Tier 3 — 난제 스타일 open-ended conjecture

#### G. Twin Prime Conjecture
- 기대 분류: **unresolved**
- 이유: known results audit, partial progress, gap honesty 평가에 적합
- 리스크: 결과가 너무 뻔하게 unresolved로 끝날 수 있음
- 추천도: 중간

#### H. Collatz Conjecture
- 기대 분류: **unresolved**
- 이유: 계산 실험 + 일반 증명 실패의 경계가 분명함
- 기대: empirical evidence와 proof gap을 분리하는 능력 검증 가능
- 추천도: 매우 높음

#### I. Riemann Hypothesis
- 기대 분류: **unresolved**
- 이유: 너무 큰 문제라서 오히려 loop가 허공을 칠 수 있음
- 추천도: 낮음 (현재 단계에선 너무 큼)

---

## CTO 추천 순서

### 1순위
**E. \(2^n - 1\) 이 항상 소수인가?**
- 이유: 바로 반례가 존재
- solved/refuted 판정 능력 검증에 좋음
- loop가 “증명”보다 “반례 + bounded conclusion”을 제대로 운영하는지 보기 좋음

### 2순위
**F. Goldbach Conjecture**
- 이유: 계산 검증은 가능하지만 일반 증명은 미해결
- 가장 중요한 능력인 **unresolved를 정직하게 기록하는지** 확인 가능

### 3순위
**H. Collatz Conjecture**
- 이유: 실험/패턴/known results audit/반례 탐색/한계 기록이 모두 중요
- archive 가치가 높음

### 4순위
**C. 이항정리**
- 이유: “실제로 풀 수 있는 좀 더 정교한 정리”를 한 번 더 보는 용도
- pure capability sanity check에 좋음

---

## 추천 실행 전략

### Track A — 판단력 테스트
1. \(2^n - 1\) always prime?  → **refuted** 기대
2. Goldbach conjecture → **unresolved** 기대

이 트랙은 모델이
- 거짓을 refuted로,
- 미해결을 unresolved로,
- 계산 검증을 일반 증명으로 오인하지 않는지
보는 데 가장 좋다.

### Track B — 증명력 테스트
1. 이항정리
2. 제곱합 공식

이 트랙은 실제 proof structuring 능력을 더 본다.

---

## 지금 바로 추천하는 다음 문제

### 추천 문제
**"모든 자연수 n에 대해 \(2^n - 1\) 이 소수인가?"**

### 이유
- 빠르게 반례를 찾을 수 있음
- 거짓 명제를 모델이 스스로 refuted로 정리하는지 볼 수 있음
- counterexample-check 단계의 품질을 강하게 시험할 수 있음
- false progress 방지 능력을 보기 가장 좋음

### 기대되는 좋은 최종 결론
- `REFUTED`
- 최소 반례 제시
- 왜 일반 명제가 거짓인지 설명
- 어떤 제한된 하위 명제는 아직 참처럼 보이는지 분리
- archive 가치 있는 decision log 남김

---

## 후속 메모

현재 `sum of cubes` 실험은
- 이미 참인 고전 정리
- 표준 귀납법 증명
- 문서화/운영 안정성 검증
에는 적합했다.

다음 실험은 **정답을 맞히는 것보다 판정을 정직하게 하는지** 보는 게 더 중요하다.
