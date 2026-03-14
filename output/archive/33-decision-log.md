# Decision Log

## Decision 1 — 연구 목표 정의
- 결정: 논문급 연구를 자율 수행할 수 있는가를 상위 문제정의로 설정
- 이유: 단순 문서 생성이 아니라 연구 운영 능력을 검증하기 위함

## Decision 2 — 완전 무한 루프 대신 bounded loop 채택
- 결정: 종료 조건 / 재진입 조건 / 안전 중단 조건을 가진 수렴 루프 구조 채택
- 이유: 무한 반복은 운영 불가능하며 품질 수렴 검증이 어려움

## Decision 3 — 429 대응 runner 도입
- 결정: retry + exponential backoff를 가진 실행 드라이버 추가
- 이유: provider overload가 반복적으로 발생했기 때문

## Decision 4 — compact / semi-compact / semifine으로 점진 분해
- 결정: 큰 step을 여러 차례 분해해 timeout 병목을 뒤로 이동
- 이유: 초기 workflow는 과도하게 무거워 step timeout을 유발했음

## Decision 5 — review / decision 계약 수정
- 결정: review가 FAIL이면 loop decision은 반드시 CONTINUE
- 이유: FAIL + STOP 충돌은 연구 종료 의미론을 무너뜨림

## Decision 6 — output 경로 repo root로 정규화
- 결정: output 산출 경로를 repo root 기준으로 명시
- 이유: sandbox/output 과 root/output 불일치를 제거하기 위함

## Decision 7 — Iteration 2를 remediation 전용 루프로 분리
- 결정: 일반 연구 루프가 아니라 P0 remediation-focused loop 별도 구성
- 이유: Iteration 1 이후 핵심 병목은 탐색이 아니라 P0 해소였기 때문

## Decision 8 — GLM-5 비교 실행
- 결정: remediation loop를 GLM-5로 실행
- 이유: GLM-4.7에서 반복된 429/timeout 제약을 줄이고, iteration 2를 더 안정적으로 마무리하기 위함

## Decision 9 — 연구 종료 판정
- 결정: P0 4개 해결 이후 STOP 판정
- 이유: P0-001~P0-004가 모두 resolved 되었고 종료 차단 요소가 사라졌기 때문
