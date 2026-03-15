# Sandbox Next Additions

## 목적
현재 `glm47-research-loop` sandbox는 연구 루프 검증과 remediation iteration까지 수행했다.
다음 단계에서는 이 sandbox를 단순 실험 폴더가 아니라 **반복 검증 가능한 validation-repair playground**로 확장하는 것이 목표다.

---

## 추가 우선순위

### P0 — 현재 sandbox를 더 재현 가능하게 만들기

#### 1. archive step을 sandbox workflow에 다시 연결
- 현재 연구 결과는 archive 문서 세트까지 생성됐지만, runtime timeout/경로 이슈로 workflow 상 완전 자동 마감은 덜 깔끔했다.
- sandbox에 아래를 반영할 것:
  - archive-only workflow
  - remediation 종료 후 archive 자동 연결 경로

#### 2. repo root / sandbox output 경로 차이를 명시한 README 보강
- 상대경로와 runtime cwd 차이로 산출물이 root `output/`에 저장되는 문제가 있었다.
- sandbox README에 아래를 명시:
  - 어떤 실행은 sandbox 기준 경로를 쓰는지
  - 어떤 실행은 repo root output을 쓰는지
  - path normalization 원칙

#### 3. final successful path를 재현하는 canonical runner 1개만 남기기
- 현재 runner가 여러 버전(`compact`, `semicompact`, `semifine`)으로 남아 있다.
- sandbox에서 장기적으로 유지할 canonical path를 정리할 것:
  - 추천: `semifine` 기반을 canonical로 승격
  - 나머지는 references or legacy notes로 이동 고려

---

### P1 — sandbox를 제품 기능 검증용으로 강화

#### 4. validation-repair SDK example과 연결되는 sandbox scenario 추가
- 현재 SDK example은 문서/fixture 수준이다.
- sandbox에 실제 실행 가능한 end-to-end scenario를 추가하면 좋다.
- 예시:
  - `sdk-validation-repair-poc/`
  - build → validate → repair → stop category 확인

#### 5. stop category 시나리오별 샘플 workflow 추가
아래 케이스를 각각 별도 workflow로 분리하면 좋다.
- `stop-by-no-progress.yaml`
- `stop-by-repeated-critical-issue.yaml`
- `stop-by-exhaustion.yaml`
- `stop-by-success.yaml`

목적:
- runtime semantics를 sandbox에서 눈으로 검증 가능하게 만들기
- docs/examples와 실제 런타임 동작을 연결하기

#### 6. structured ValidationResult generator 예제 추가
- validator가 어떤 JSON을 내야 안정적으로 parsing 되는지 예제 prompt를 별도 파일로 제공
- 추천 파일:
  - `prompts/validator-structured-result.md`
  - `prompts/repair-agent-guidance.md`

---

### P2 — 연구 확장 실험

#### 7. multi-model comparison sandbox
- 이번엔 GLM-4.7 / GLM-5 비교가 사실상 remediation 단계에서 의미 있게 드러났다.
- sandbox에 모델 비교 시나리오 추가 고려:
  - same workflow, different model
  - latency / stop outcome / artifact quality 비교 기록

#### 8. semantic progress detector 실험
- 현재 no-progress는 stable signature 반복에 크게 의존한다.
- 후속 sandbox 실험으로 semantic progress detector를 시도할 수 있다.
- 예:
  - failedChecks delta
  - summary similarity threshold
  - evidence count change

#### 9. external-validation workflow
- 현재 연구는 내부 운영 가능성 검증까지다.
- 다음 sandbox 실험은 외부 검증 단계를 붙일 수 있다.
  - generated code execution
  - test suite result ingestion
  - human review gate

---

## 추천 다음 작업 순서
1. canonical runner/README/path normalization 정리
2. archive-only workflow 추가
3. stop category scenario 4종 분리
4. sdk validation-repair poc sandbox 추가
5. semantic progress / external validation 실험 확장

---

## CTO 코멘트
지금 sandbox는 이미 의미 있는 연구 결과를 냈다.
다음 단계는 "더 많은 파일을 만드는 것"이 아니라,
**같은 결론을 더 짧게, 더 재현 가능하게, 더 명확한 종료 의미론으로 다시 얻을 수 있게 만드는 것**이다.
