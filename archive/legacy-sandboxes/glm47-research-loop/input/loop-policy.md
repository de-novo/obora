# Loop Policy

## 목표
연구 워크플로우를 결론 도출 시점까지 반복 수행하되, 무한 발산이나 무의미한 재시도를 방지한다.

## 종료 조건
아래를 모두 만족하면 종료한다.
1. `output/final/22-final-conclusion.md` 가 존재한다.
2. 핵심 연구 질문에 대한 답변이 final 문서에 포함된다.
3. `output/final/20-review-report.md` 기준으로 치명적 P0 이슈가 없다.
4. archive 패키지 생성이 가능하다.
5. final 문서에 결론 / 한계 / 후속 연구가 포함된다.

## 재진입 조건
아래 중 하나라도 참이면 research loop로 재진입한다.
1. 리뷰 결과가 FAIL 이다.
2. P0 이슈가 1개 이상 존재한다.
3. 결론 대비 근거 부족이 명시된다.
4. 문제정의와 결론 불일치가 지적된다.
5. unresolved questions가 과도하게 남아 있다.

## 안전 중단 조건
아래 중 하나면 루프를 중단하고 bounded conclusion을 남긴다.
1. 3회 연속 실질 개선 없음
2. 동일 핵심 이슈가 2회 이상 반복
3. 최대 iteration 수 도달
4. 시간/비용 예산 초과

## 기본 실험 파라미터
- max iterations: 5
- no-progress ceiling: 3
- repeated critical issue ceiling: 2

## 기록 원칙
각 iteration마다 아래를 남긴다.
- 이번 iteration 목적
- 새 인사이트
- 해결된 이슈
- 남은 이슈
- 다음 iteration 필요 여부
