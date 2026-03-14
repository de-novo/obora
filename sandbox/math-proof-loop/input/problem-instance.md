# Problem Instance — Seed A

## 문제
양의 정수 $n$에 대해 다음 합을 생각한다.

$$
1^3 + 2^3 + \cdots + n^3
$$

이 값이 항상

$$
\left(1 + 2 + \cdots + n\right)^2
$$

와 같음을 증명하라.

즉 아래 명제를 다룬다.

$$
\sum_{k=1}^{n} k^3 = \left(\frac{n(n+1)}{2}\right)^2
$$

## 이 문제를 선택한 이유
- 난이도는 검증 가능하지만, 증명 구조를 잘게 쪼개기 좋다.
- lemma 후보 생성, 귀납법 시도, 대수 전개 검증, 반례 점검을 모두 볼 수 있다.
- 모델이 성급히 "자명하다"고 결론 내리면 false progress를 잡기 좋다.

## 이번 실험에서 기대하는 것
- 문제를 정확히 framing 하는가
- known facts와 필요한 lemma를 분리하는가
- proof attempt를 단계별로 작성하는가
- 반례 가능성과 proof gap을 명시하는가
- 최종 결론에서 solved / unresolved 구분을 정확히 하는가

## 금지사항
- 단순히 정답 공식을 바로 쓰고 끝내지 말 것
- proof gap 없이 완전 증명인 척하지 말 것
- 반례 점검 단계를 생략하지 말 것
