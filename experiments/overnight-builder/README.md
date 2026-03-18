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

## 실행

```bash
# 아이디어 넣고 하루 돌리기
experiments/overnight-builder/run.sh

# dry-run (실행 없이 계획만)
experiments/overnight-builder/run.sh --dry-run
```

## 성공 기준

- 기획이 구체화됨
- 설계가 구조적임
- 코드가 실제로 생성됨
- 테스트가 최소 1개 이상 통과
- 리뷰/개선이 한 번 이상 수행됨
- archive에 전체 과정이 기록됨
