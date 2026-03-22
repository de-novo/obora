# Sandbox 22 — Shared Memory / TKG Loop

이 sandbox는 이번에 구현한 Shared Memory / TKG MVP 기능을 실제 워크플로우에서 검증하기 위한 예시입니다.

## 무엇을 검증하나
- 첫 실행에서 validation failure -> repair -> pass 루프가 발생하는지
- 실행 종료 후 shared memory / TKG staging / review queue / rollback 파일이 생성되는지
- 다음 실행에서 shared memory continuity를 프롬프트로 다시 주입받을 수 있는지

## 주요 파일
- `agents.yaml`
- `obora.config.yaml`
- `workflows/00-shared-memory-tkg-loop.yaml`
- `input/brief.md`

## 기대 동작
### 첫 실행
- 첫 draft는 `Next Action`을 일부러 빠뜨림
- validation 실패
- repair loop 진입
- repaired draft 생성 후 validation PASS
- persistence artifacts 생성

### 두 번째 실행
- 기존 project/workflow shared memory가 import 대상이 됨
- writer step은 shared memory context가 있으면 `Memory Signals Used`를 `Current Findings` 안에 반영하도록 유도됨
- `40-observability-report.md`에서 continuity 흔적을 확인 가능

## 관찰 포인트
- `data/.obora/shared-memory/...`
- `data/.obora/tkg-staging/...`
- `data/.obora/tkg-review-queue/...`
- `data/.obora/tkg-rollback/...`
- `output/archive/40-observability-report.md`
