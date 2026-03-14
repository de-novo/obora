# Math Proof Loop Brief

## 실험명
Obora 수학 난제급 증명 탐색 루프 검증

## 핵심 문제정의
Obora 워크플로우가 수학 난제급 문제에 대해 **증명 탐색 루프를 자율적으로 운영**할 수 있는지 검증한다.
이번 실험의 목표는 실제 난제를 해결했다고 주장하는 것이 아니라, 아래 능력을 검증하는 것이다.
- 문제를 정확히 구조화하는가
- 알려진 조건/정리/제약을 분리해 정리하는가
- lemma 수준으로 쪼개서 증명 시도를 축적하는가
- 반례/모순/증명 공백을 스스로 탐지하는가
- 실패 시 remediation을 통해 다음 시도를 더 나은 형태로 구성하는가
- bounded stop 시점에 유의미한 연구 아카이브를 남기는가

## 테스트 목적
1. 수학적 탐색을 일반 문서 생성과 구분해 운영할 수 있는지 본다.
2. proof attempt / gap analysis / counterexample check가 분리된 구조로 동작하는지 본다.
3. false progress(그럴듯하지만 틀린 진전)를 얼마나 잘 줄일 수 있는지 본다.
4. 최종적으로 해결 여부와 무관하게 재사용 가능한 탐색 기록을 남길 수 있는지 본다.

## 이번 1차 실험 범위
이번 실험은 "난제를 푼다"가 아니라 **난제급 증명 탐색 운영 가능성**을 본다.
범위는 아래와 같다.
- 문제 정의
- known results audit
- lemma 후보 생성
- proof attempt
- counterexample / consistency check
- review / remediation
- bounded final conclusion
- archive packaging

## 이번 실험의 추천 문제 유형
이번 sandbox에서는 진짜 미해결 난제보다 아래 순서가 권장된다.
1. 검증 가능한 고난도 정리
2. 반례 탐색이 중요한 문제
3. 난제 스타일 open-ended conjecture

## 성공 기준
- 문제정의와 final conclusion이 충돌하지 않는다.
- known results / assumptions / conjecture / lemma / proof gap 이 구분되어 기록된다.
- counterexample check가 독립 단계로 수행된다.
- 리뷰가 proof gap, 논리 비약, 숨은 가정, 반례 가능성을 명시한다.
- remediation이 단순 재서술이 아니라 gap 축소를 목표로 한다.
- archive 문서가 "해결 여부"와 무관하게 탐색 기록으로 유의미하다.

## 실패 신호
- 증명 시도와 알려진 사실이 섞여 기록된다.
- 반례 점검이 생략되거나 형식적으로만 수행된다.
- 근거 없이 해결된 것처럼 결론 난다.
- 같은 proof gap이 반복된다.
- final 문서가 증명 공백을 숨긴다.

## 평가 질문
1. proof loop가 자율적으로 반복 가능한가?
2. false progress를 review/remediation이 줄이는가?
3. bounded stop 시점에 남는 아카이브가 다음 시도에 유용한가?
4. 모델이 모르는 문제에서도 "모른다 / 공백이 있다"를 적절히 기록하는가?

## 필수 아카이브 산출물
- abstract
- executive summary
- methodology
- decision log
- proof-gap register
- archive bundle index

## 실행 원칙
- conjecture, known facts, assumptions, lemmas, proof attempts를 분리 기록한다.
- counterexample / consistency check는 독립 단계로 둔다.
- final conclusion은 solved / partially supported / unresolved / refuted 중 하나를 명시한다.
- 해결 실패도 유의미한 결과로 기록한다.
