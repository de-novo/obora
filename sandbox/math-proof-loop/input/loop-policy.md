# Math Proof Loop Policy

## 목표
증명 탐색 루프를 결론 도출 또는 bounded stop 시점까지 반복 수행하되, false progress와 무의미한 재시도를 줄인다.

## 종료 조건
아래 중 하나면 종료한다.
1. solved: 핵심 conjecture에 대한 일관된 증명 스케치와 review PASS가 존재한다.
2. refuted: 명확한 반례 또는 치명적 모순이 확인된다.
3. bounded stop: unresolved 상태지만 proof gap, failed attempt, next direction이 충분히 정리된다.

## 재진입 조건
아래 중 하나면 다음 loop로 재진입한다.
1. proof gap이 P0 수준으로 남아 있다.
2. 반례 가능성이 제거되지 않았다.
3. 숨은 가정 또는 논리 비약이 리뷰에서 지적되었다.
4. 새로운 lemma 후보가 남아 있다.
5. bounded stop에 필요한 기록 품질이 아직 부족하다.

## 안전 중단 조건
아래 중 하나면 bounded stop으로 전환한다.
1. 3회 연속 실질 개선 없음
2. 동일 proof gap 반복 2회 이상
3. 동일 반례 유형 반복 2회 이상
4. max iterations 도달
5. 시간/비용 예산 초과

## 기본 실험 파라미터
- max iterations: 5
- no-progress ceiling: 3
- repeated critical issue ceiling: 2

## 기록 원칙
각 iteration마다 아래를 남긴다.
- 현재 conjecture 상태
- 새 lemma 후보
- 제거된 반례 / 남은 반례 가능성
- 새로 드러난 proof gap
- 다음 iteration 필요 여부
