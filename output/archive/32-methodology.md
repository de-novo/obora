# Methodology

## 연구 목적
Obora 워크플로우가 GLM 기반 모델을 사용해 논문형 연구 루프를 자율 수행할 수 있는지 검증한다.

## 실험 구조
본 연구는 2단계로 진행되었다.

### Iteration 1: 기본 연구 루프 검증
구성 단계:
1. problem-frame
2. success-criteria
3. research-findings
4. questions-and-interim
5. review-final-decision
6. archive-or-deferral

검증 포인트:
- 컨텍스트 유지
- 문제정의와 결론의 정합성
- review / decision 일관성
- 연구 산출물 완성도

### Iteration 2: P0 remediation loop
구성 단계:
1. p0-analysis
2. define-quantitative-criteria
3. define-loop-rules
4. verify-hypotheses
5. remediation-review

검증 포인트:
- P0 이슈 해소 여부
- 종료 기준의 정량화
- 카운터 및 progress 규칙의 실행 가능성
- 핵심 가설 최종 상태 확정

## 사용한 평가 프레임
### 1. Review Decision
- PASS 또는 FAIL
- P0 / P1 / P2 이슈 분류

### 2. Loop Decision
- `decision: CONTINUE`
- `decision: STOP`

### 3. Remediation Success
- P0-001~P0-004 해결 여부

## 핵심 수정 사항
실험 중 다음과 같은 구조적 수정을 수행했다.
- 429 대응을 위한 retry/backoff runner 추가
- 긴 synthesis step 분해
- output 경로 정규화
- review FAIL 시 STOP 금지 규칙 추가

## 제한사항
- 실제 production implementation 검증은 수행하지 않음
- 외부 학술 검증이나 제3자 리뷰는 포함하지 않음
- runtime DB에 일부 running 상태가 잔존하는 정리 이슈가 있음

## 재현 방법
1. research loop 실행
2. review와 decision 산출 확인
3. FAIL + CONTINUE 상태에서 remediation loop 실행
4. remediation review 및 final decision 확인
5. archive 문서 생성
