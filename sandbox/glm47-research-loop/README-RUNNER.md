# Master Loop Runner

## 목적
`run-master-loop.sh` 는 `00-master-research-loop.yaml` 을 반복 실행하면서
`output/final/23-loop-decision.md` 의 `decision: CONTINUE|STOP` 값을 읽어 다음 iteration 진행 여부를 결정합니다.

## 동작 방식
1. loop state 파일 업데이트
2. master workflow 1회 실행
3. `23-loop-decision.md` 파싱
4. `STOP` 이면 종료
5. `CONTINUE` 이면 다음 iteration 실행
6. `MAX_ITERATIONS` 도달 시 bounded stop

## 실행 예시
```bash
cd /Users/denovo/workspace/github/obora-kit
bash sandbox/glm47-research-loop/run-master-loop.sh
```

환경변수:
- `MAX_ITERATIONS` 기본값: `5`
- `OBORA_TIMEOUT_MS` 기본값: `600000`
- `MAX_RUN_RETRIES` 기본값: `4`
- `INITIAL_RETRY_DELAY_SEC` 기본값: `20`

예시:
```bash
MAX_ITERATIONS=8 OBORA_TIMEOUT_MS=900000 bash sandbox/glm47-research-loop/run-master-loop.sh
```

429 overload 대응 예시:
```bash
MAX_ITERATIONS=5 MAX_RUN_RETRIES=6 INITIAL_RETRY_DELAY_SEC=30 bash sandbox/glm47-research-loop/run-master-loop.sh
```

## 출력 위치
- 상태: `output/final/00-loop-state.md`
- 판정: `output/final/23-loop-decision.md`
- 로그: `output/iterations/logs/`
- 실행 결과 스냅샷: `output/iterations/results/`

## 주의
이 스크립트는 반복 실행 제어만 담당합니다.
연구 논리와 문서 생성은 Obora workflow 본체가 담당합니다.
