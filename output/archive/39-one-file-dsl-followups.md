# One-File DSL Follow-ups

## 바로 다음에 할 것

### 1. DSL schema 초안 만들기
- `mode`
- `problem`
- `model`
- `loop`
- `review`
- `archive`
- `output`
- `overrides`

### 2. validation-repair를 첫 타깃으로 구현
- 가장 작은 mode부터 productize
- 현재 구현 자산 재사용 가능

### 3. compiler-like expander 설계
입력:
- one-file DSL
출력:
- internal WorkflowDef
- internal stop semantics policy
- archive plan

### 4. CLI/SDK API 결정
후보:
- `obora run onefile.yaml`
- 내부적으로 template expansion 수행
- debug mode에서 expanded graph dump 가능

### 5. debug/inspect UX 추가
- `--dump-expanded-workflow`
- `--show-stop-semantics`
- `--show-loop-summary`

---

## sandbox에 추가할 실험
- one-file DSL을 내부 step graph로 expansion하는 mock compiler
- validation-repair mode mock expander
- proof-loop mode mock expander
- expanded graph 시각화 스냅샷

---

## 제품화 리스크
- mode abstraction이 너무 약하면 결국 raw workflow보다 불편해질 수 있음
- mode abstraction이 너무 강하면 advanced user override가 막힐 수 있음
- stop semantics를 느슨하게 두면 다시 FAIL/STOP 충돌이 반복될 수 있음

---

## 권장 구현 순서
1. one-file validation-repair expander
2. stop outcome structured model
3. expanded graph debug dump
4. research-loop mode
5. proof-loop mode
