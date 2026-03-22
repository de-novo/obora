# Overnight Builder

> "사람은 아이디어만 주고, AI가 밤새 기획 → TDD 설계 → 구현 → 테스트 → 리뷰 → 개선까지 프로덕션 수준으로 돌린다."

## 목적

이 실험은 Obora workflow가 **기획 고도화부터 프로덕션 수준의 코드 구현/테스트까지**를 하루(overnight) 동안 자율적으로 돌릴 수 있는지를 검증한다.

MVP가 아니라 **실제 배포 가능한 프로덕션 품질**이 목표다.
- 에러 핸들링, 입력 검증, 엣지 케이스 커버
- TDD 기반 테스트 (happy + error + edge)
- 코드 품질 리뷰 + 리팩터링
- 문서화 (README, JSDoc)
- cycle마다 기능 추가 → 프로덕션 완성도까지 반복

## 워크플로우 그래프 (ASCII)

```text
+-------------------+
| run-with-watchdog |
+-------------------+
          |
          v
  +----------------+
  | refine_idea    |
  | (기획 고도화)   |
  +----------------+
          |
          v
  +----------------------+
  | design_and_write_tests|
  | (설계 + 테스트 작성)   |
  | TDD: 테스트 먼저!     |
  +----------------------+
          |
          v
  +---------------------+
  | implement_or_repair |
  | (구현: 테스트 통과)   |
  +---------------------+
          |
          v
  +---------------------+
  | run_tests_and_judge |
  | (테스트 실행 + 판정)  |
  +---------------------+
      |         |
      | FAIL    | PASS
      v         v
+---------------------+   +-------------------+
| goto                |   | review_and_decide |
| implement_or_repair |   | (리뷰 + 다음 판단) |
+---------------------+   +-------------------+
                               |          |
                               | 미완성    | MVP 완성
                               v          v
                      +----------------+  +---------+
                      | goto           |  | archive |
                      | refine_idea    |  +---------+
                      | (다음 cycle)    |
                      +----------------+

inner loop: implement <-> test (테스트 통과까지)
outer loop: refine -> design -> TDD -> review -> commit -> refine (MVP 완성까지)
전체: watchdog timeout 안에서 동작
```

## 입력

사용자가 제공하는 것:
- `input/idea.md` — 아이디어/요구사항 (자연어)
- `input/constraints.md` — 기술 제약/선호 (선택)

## 출력

- `workspace/` — 실제 생성된 프로젝트
- `artifacts/01-refined-idea.md` — 고도화된 기획
- `artifacts/02-system-design.md` — 설계 문서
- `artifacts/03-implementation-notes.md` — 구현 기록
- `artifacts/04-test-report.md` — 테스트 결과
- `artifacts/05-review-notes.md` — 리뷰/개선 기록
- `artifacts/06-archive-summary.md` — 최종 요약
- `data/.obora/shared-memory/` — cycle 간 재사용 가능한 persistent memory
- `data/.obora/tkg-staging/` — validation/repair/back-edge 이벤트의 temporal projection
- `data/.obora/tkg-review-queue/` — promotion conflict review queue
- `data/.obora/tkg-rollback/` — promotion apply 이전 rollback snapshot

> `artifacts/`, `data/`, `output/`는 실험 실행 시 생성되는 산출물이며, 기본적으로 versioned source-of-truth가 아니라 generated output으로 취급한다.

## 실행

```bash
# 아이디어 넣고 하루 돌리기
experiments/overnight-builder/run.sh

# dry-run (실행 없이 계획만)
experiments/overnight-builder/run.sh --dry-run
```

## Shared Memory / TKG 적용

이 실험에는 이제 Shared Memory / TKG MVP가 연결되어 있습니다.

의도:
- cycle이 길어질수록 validator/reviewer가 남긴 고신호 사실을 다음 실행에서 다시 활용
- validation 실패/repair/pass 흐름을 TKG staging에 projection
- promotion conflict가 생기면 review queue로 분리
- promotion apply 전에 rollback snapshot 저장

관찰 포인트:
- `data/.obora/shared-memory/project/overnight-builder.json`
- `data/.obora/tkg-staging/project/overnight-builder.json`
- `data/.obora/tkg-review-queue/project/overnight-builder.json`
- `data/.obora/tkg-rollback/project/overnight-builder.json`

현재 설정에서는 promotion flush trigger를 다음 시점에 건다:
- `workflow.validation_passed`
- `workflow.repair_completed`
- `execution_end`

즉, 긴 overnight run이 마지막 문서 step에서 실패해도,
핵심 validation/repair loop를 통과한 시점의 TKG promotion/shared memory apply는 먼저 남길 수 있다.

실제 검증 결과(2026-03-22 기준):
- `workflow.validation_passed` 시점에 trigger checkpoint 동작 확인
- `shared-memory` project snapshot 생성 확인
- `tkg-rollback` project snapshot 생성 확인
- conflict가 없던 run에서는 `tkg-review-queue`는 비어 있거나 생성되지 않는 것이 정상

## 성공 기준

- 기획이 구체화됨
- 설계가 구조적임
- 코드가 실제로 생성됨
- 테스트가 최소 1개 이상 통과
- 리뷰/개선이 한 번 이상 수행됨
- archive에 전체 과정이 기록됨
- Shared Memory / TKG persistence 산출물이 생성됨
