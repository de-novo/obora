# Pi + GLM-5 출력 완결성 재테스트 (2026-02-13)

## 실행 조건
- Provider/Model: `zai / glm-5`
- API Key: 환경변수 `ZAI_API_KEY` 주입
- 실행 모드: `pi ... -p` (비대화형), PTY 사용
- 형식 강제: `SCORE / P0 / P1 / DECISION` 4라인

## 1) TASK-036 결과
- 명령: `pi --provider zai --model glm-5 -p @docs/tasks/P1/TASK-036-agenda-management.md "<4라인 강제 프롬프트>"`
- 종료 코드: `0` (정상 종료)
- 출력:
  - SCORE: 9.2
  - P0: 없음
  - P1: barrel export completeness 미흡; 이벤트 불변성/날짜 뮤테이션 검증 보강 필요
  - DECISION: FAIL
- 완결성 검증:
  - 4라인 모두 생성: **Yes**
  - 빌드 로그 혼입: **No**
  - 정상 종료: **Yes**

## 2) TASK-042c 추가 테스트
- 조건(036 성공 시 추가 1회) 충족으로 실행 시도
- 결과: **실패(미완료)**
  - 다회 시도에서 출력 없이 프로세스가 장시간 지속되어 수동 종료
  - 로그 파일은 0 bytes

## 3) OpenCode 대비 차이
- 기존 OpenCode 산출물(예: `.automation/single-loop-20260213/results/result-036-glm.md`)에는
  `> build · glm-5`, `Read ...` 같은 **빌드/툴 로그 혼입** 확인됨.
- 본 Pi TASK-036 결과는 **순수 4라인만 출력**되어 형식 강제 준수성이 우수함.
- 다만 TASK-042c에서 **무출력 행(hang) 재현**되어 안정성은 미확보.

## 4) Pi 전환 권장 여부
- **조건부 보류(현 시점 전면 전환 비권장)**
  - 장점: TASK-036에서 형식 완결성/로그 비혼입 달성
  - 리스크: TASK-042c에서 무출력 장기 실행(완료 불능) 발생
- 권장: Pi는 `TASK-036류 형식 고정 평가`에 한정 pilot 유지,
  전면 전환은 `TASK-042c 재현 성공(최소 3회 연속)` 후 결정.

## 산출물 경로
- 프롬프트: `.automation/pi-glm5-test-20260213/prompts/`
- 로그: `.automation/pi-glm5-test-20260213/logs/`
- 결과: `.automation/pi-glm5-test-20260213/results/`
- 메타 검증: `.automation/pi-glm5-test-20260213/meta/`
