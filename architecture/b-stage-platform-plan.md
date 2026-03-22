# B Stage Platform Plan

> 상태: 초안
> 목적: Obora를 "좋은 엔진"에서 "믿고 돌릴 수 있는 개발자용 플랫폼"으로 올리기 위한 실행 계획

## 한줄 정의

B 단계의 목표는 **기능 추가 자체보다 실행 일관성, 관측 가능성, 정책 안정성, 운영 가능성**을 확보하는 것입니다.

즉, 아래가 가능해야 합니다.

- source / dist / CLI 실행 경로가 예측 가능하다
- long-running workflow에서도 중간 checkpoint가 설명 가능하게 동작한다
- Shared Memory / TKG / review queue / rollback이 정책적으로 일관된다
- 문제가 생기면 디버그 로그와 산출물만으로 원인을 좁힐 수 있다
- 다른 개발자가 문서와 예시만 보고 재현할 수 있다

---

## B 단계에서 완료로 볼 기준

아래가 만족되면 B 단계 완료로 본다.

1. `obora run`의 실행 경로가 명확하다
2. canonical workflow 2개 이상에서 아래가 재현 가능하다
   - Shared Memory
   - TKG staging
   - review queue
   - rollback
3. long-running workflow에서 trigger checkpoint가 실제로 useful memory를 남긴다
4. review queue approve / reject / re-apply / restore 운영 루프가 있다
5. 관련 문서 / 예시 / troubleshooting 가이드가 있다
6. core package 게이트(typecheck / tests / build)가 안정적이다

---

## 현재 기준선

### 이미 확보된 것
- Shared Memory MVP
- TKG staging / projector
- promotion / conflict evaluation
- review queue / approve / reject
- rollback snapshot
- approved review item re-apply helper
- runtime public API
- trigger 기반 checkpoint 초안
- sdk typecheck / 관련 테스트 / push 경험 확보

### 현재 병목
- source 수정과 dist 실행의 괴리
- checkpoint / promotion / no-op reason이 기본적으로 잘 안 보임
- long-running workflow에서 누적 이력 때문에 promotion이 과도하게 보수적일 수 있음
- review queue / rollback restore 운영 UX가 아직 거침
- 문서와 실사용 예시가 부족함

### 최근 확인된 진전
- 짧은 sandbox에서 trigger 기반 checkpoint가 실제로 동작함을 확인
  - `workflow.repair_completed` / `workflow.validation_passed` 시점에
  - shared memory / review queue / rollback 파일 생성 확인
- overnight-builder에서도 trigger checkpoint / shared memory apply / rollback이 실제로 동작하는 것을 확인
- long-running workflow에서 과거 누적 이력 때문에 `promotable=0`이 되던 문제를 줄이기 위해
  `latest effective state` 기준 평가를 중간 trigger 경로에 적용
- rollback snapshot을 실제 shared memory로 복원하는 runtime / helper API 추가

---

# 실행 백로그

## P0 — 반드시 먼저 해야 하는 것

### P0-1. 실행 일관성 정리
**목표:** 고친 코드가 실제 실행에 반영되는지 항상 예측 가능하게 만든다.

#### 작업
- [ ] source / dist / CLI 실행 전략 명시
- [ ] dev mode와 prod mode 분리
- [ ] stale dist 감지 또는 경고 추가
- [ ] `obora run`이 source를 타는지 dist를 타는지 명확히 문서화
- [ ] canonical local 개발 루프 문서화 (`typecheck -> build -> run`)

#### 완료 기준
- dist 미빌드 때문에 잘못된 실행 결과를 보는 일이 없어야 함

---

### P0-2. Checkpoint Observability 표준화
**목표:** checkpoint가 왜 실행/skip/no-op 됐는지 바로 보여야 한다.

#### 작업
- [ ] `tkg.checkpoint` debug 이벤트 표준화
- [ ] `tkg.apply` debug 이벤트 표준화
- [ ] `tkg.review_queue` debug 이벤트 표준화
- [ ] `tkg.rollback` debug 이벤트 표준화
- [ ] 최소 출력 필드 정의
  - `trigger`
  - `scope`
  - `candidateCount`
  - `promotableCount`
  - `reviewQueueCount`
  - `appliedFactCount`
  - `skipReason`
- [ ] no-op / skip도 정상 이벤트로 남기기

#### 완료 기준
- 긴 workflow에서 산출 파일과 debug trace만으로 checkpoint 판단이 가능해야 함

---

### P0-3. Latest Effective State 정책 일반화
**목표:** long-run 누적 이력 때문에 항상 `promotable=0`이 되는 문제를 줄인다.

#### 작업
- [ ] `latestEffectiveOnly`를 정책 옵션으로 정식 승격
- [ ] execution/window/step 단위 평가 전략 정리
- [ ] `execution_end` 평가와 중간 trigger 평가를 구분
- [ ] contradiction/version/confidence conflict가 언제 review queue로 가는지 명시
- [ ] overnight-builder에서 실제로 useful shared memory가 남는지 재검증

#### 완료 기준
- 긴 workflow에서도 중간 trigger 이후 shared memory가 유의미하게 남아야 함

---

## P1 — B를 실사용 수준으로 올리는 것

### P1-1. Review Queue 운영 루프 정리
**목표:** review queue가 데이터 구조가 아니라 실제 운영 가능한 루프가 되게 한다.

#### 작업
- [ ] open item list helper
- [ ] approve / reject helper
- [ ] approved item re-apply helper 문서화
- [ ] duplicate apply / idempotency 정리
- [ ] review note / actor / resolution audit 정리

#### 완료 기준
- 운영자가 CLI 또는 runtime API만으로 review queue를 처리할 수 있어야 함

---

### P1-2. Rollback Restore 구현
**목표:** rollback snapshot을 저장하는 수준에서 끝내지 않고 실제 복원이 가능해야 한다.

#### 작업
- [ ] rollback entry list helper
- [ ] rollback restore apply helper
- [ ] restore 이후 summary / audit trail 기록
- [ ] restore safety rule 정리
  - restore scope
  - overwrite policy
  - dry-run 가능 여부

#### 완료 기준
- 기존 snapshot으로 실제 shared memory 복원이 가능해야 함

---

### P1-3. Canonical Verification Workflow 정리
**목표:** B 단계 기능을 빠르게 검증하는 표준 workflow 묶음을 만든다.

#### 작업
- [ ] 짧은 sandbox workflow 유지/정리
- [ ] overnight-builder를 long-run 검증용 canonical workflow로 유지
- [ ] 각 workflow의 기대 산출물 문서화
- [ ] smoke check 명령 정리

#### 완료 기준
- 누구나 동일한 예시로 B 단계 기능을 검증할 수 있어야 함

---

## P2 — 마감/운영화

### P2-1. 문서/예시/트러블슈팅
#### 작업
- [ ] Shared Memory 설정 가이드
- [ ] TKG 설정 가이드
- [ ] trigger checkpoint 가이드
- [ ] review queue 운영 가이드
- [ ] rollback restore 가이드
- [ ] source/dist mismatch troubleshooting
- [ ] no-op / review queue only / apply skipped case guide

### P2-2. Repo Gate 분리
#### 작업
- [ ] feature gate와 repo hygiene gate 분리
- [ ] package별 안정성 기준 정의
- [ ] push 전에 어떤 게이트를 기대해야 하는지 문서화

### P2-3. 커밋/릴리즈 정리
#### 작업
- [ ] Shared Memory / TKG 변경 이력 정리
- [ ] migration note 정리
- [ ] release note 초안 작성

---

# 추천 순서

## 1차 사이클
- P0-1 실행 일관성
- P0-2 observability
- P0-3 latest effective policy

## 2차 사이클
- P1-1 review queue 운영 루프
- P1-2 rollback restore
- P1-3 canonical verification workflow

## 3차 사이클
- P2 전반

---

# 즉시 다음 액션

다음 턴부터 바로 진행할 우선순위:

1. **P0-2 checkpoint observability 표준화 마무리**
2. **P0-3 latest effective policy를 long-run 기준으로 검증/보정**
3. **overnight-builder를 canonical long-run verification workflow로 안정화**

현재 기준으로 가장 큰 value는 새로운 기능 추가보다,
**왜 그렇게 동작했는지 항상 설명 가능한 상태**를 만드는 데 있다.
�� 그렇게 동작했는지 항상 설명 가능한 상태**를 만드는 데 있다.
