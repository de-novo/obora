# GLM-4.7 Research Loop Sandbox

> 운영 규칙과 회귀 포인트는 `docs/operations/research-sandbox-runbook.md`를 기준으로 봅니다.

## 목적
이 샌드박스는 **Obora 워크플로우가 GLM-4.7 단일 모델만으로도** 다음을 일관되게 수행하는지 검증하기 위한 실험 공간입니다.

1. 이전 단계 산출물을 다음 단계 컨텍스트로 잘 계승하는가
2. Obora의 워크플로우/합의/복구/아카이브 구조를 제대로 활용하는가
3. 결론 도출부터 아카이브용 문서 패키지 생성까지 닫힌 루프로 운영 가능한가
4. 장기 반복 루프에서도 품질 저하/문맥 붕괴/불필요한 발산 없이 수렴하는가

---

## 이번 테스트의 핵심 질문

### Q1. 컨텍스트 계승
- planning → architecture → research synthesis → archive 문서로 갈수록
  이전 산출물의 핵심 결정이 보존되는가?
- 후행 단계가 선행 단계의 결론을 임의로 바꾸거나 잃어버리지 않는가?

### Q2. Obora 아키텍처 활용도
- 단순한 프롬프트 체이닝이 아니라
  **workflow step, depends_on, consensus/review, repair loop, output artifact**를 제대로 쓰고 있는가?
- 실패/불일치 발생 시 back-edge 또는 remediation 단계로 재진입하는 구조가 자연스러운가?

### Q3. GLM-4.7 단일 모델 한계 관리
- 동일 모델 다중 참여자(consensus)가 실제로 의미 있는 품질 게이트 역할을 하는가?
- 완전한 무한 루프 대신, **장기 반복 가능한 준-무한 루프**를 비용/품질/수렴 조건으로 통제할 수 있는가?

---

## 권장 테스트 구조

이번 테스트는 아래 4계층으로 나눕니다.

### 1) L0 — 문제 정의
입력:
- 연구 주제
- 평가 목표
- 성공 조건
- 아카이브 산출물 종류

출력:
- `01-problem-frame.md`
- `02-success-criteria.md`

### 2) L1 — 연구/해석 루프
역할:
- researcher
- analyst
- synthesizer
- reviewer-x3 (모두 GLM-4.7)

핵심 산출물:
- `10-research-notes.md`
- `11-findings.md`
- `12-open-questions.md`
- `13-interim-conclusion.md`

### 3) L2 — 수렴/검증 루프
목표:
- 결론의 누락/충돌/근거 부족을 검출
- 필요 시 remediation 계획 생성 후 재실행

핵심 산출물:
- `20-review-report.md`
- `21-remediation-plan.md`
- `22-final-conclusion.md`

### 4) L3 — 아카이브 패키징
목표:
- 외부 아카이브에 바로 올릴 수 있는 문서 세트 생성

권장 산출물:
- `30-abstract.md`
- `31-executive-summary.md`
- `32-methodology.md`
- `33-decision-log.md`
- `34-archive-bundle-index.md`

---

## 추천 워크플로우 형태

### A. 1차 검증: 선형 + 리뷰 게이트
가장 먼저 검증할 최소 구조입니다.

`define-problem -> research -> synthesize -> review -> finalize -> archive`

이 단계에서 확인할 것:
- 각 step output이 다음 step input으로 자연스럽게 연결되는지
- 최종 문서가 초기 문제 정의와 충돌하지 않는지

### B. 2차 검증: remediation 포함 루프
리뷰 실패 시 아래처럼 되돌아갑니다.

`research/synthesize -> review -> remediation-plan -> remediation-apply -> re-review -> finalize`

이 단계에서 확인할 것:
- 수정 루프가 실제로 품질을 올리는지
- 같은 이유로 무한 재실패하지 않는지

### C. 3차 검증: 장기 반복형 연구 루프
준-무한 테스트는 이 구조로 갑니다.

`hypothesis -> evidence-pass -> synthesis -> contradiction-check -> review -> next-iteration`

단, 아래 종료 규칙을 반드시 둡니다.

---

## 준-무한 루프 운영 규칙

완전 무한 루프는 권장하지 않습니다. 대신 **긴 루프를 안전하게 운용**하는 방식으로 갑니다.

### 필수 종료/중단 조건
1. **3회 연속 실질 개선 없음**
   - review score 개선 없음
   - 신규 핵심 인사이트 없음
   - 결론 구조 변화 없음

2. **동일 결함 반복**
   - reviewer가 같은 지적을 2회 이상 반복

3. **아카이브 readiness 충족**
   - 필수 문서 세트 완성
   - 핵심 질문에 대한 결론 존재
   - open questions가 제한된 범위로 축소됨

4. **비용/시간 ceiling 도달**
   - iteration cap
   - step cap
   - total token or cost budget

### 루프에서 기록해야 할 메트릭
- iteration 번호
- 새로 추가된 인사이트 수
- unresolved issue 수
- reviewer reject 사유 목록
- remediation 이후 해결된 항목 수
- 최종 문서 세트 completeness

---

## 이번 테스트의 평가 기준

### 1. Context Fidelity
질문:
- 후행 문서가 선행 단계 결정을 유지하는가?
- 용어/판단/범위가 중간에 흔들리지 않는가?

평가 기준:
- 핵심 결정 유지율
- 용어 일관성
- 문서 간 충돌 수

### 2. Workflow Leverage
질문:
- Obora 고유 구조를 활용했는가, 아니면 그냥 긴 프롬프트였는가?

평가 기준:
- step 분리 적절성
- review/gate 사용 여부
- remediation/back-edge 사용 여부
- artifact 기반 연결 명확성

### 3. Convergence Quality
질문:
- 반복할수록 문서 품질이 좋아지는가?

평가 기준:
- reject -> approve 전환 여부
- open question 감소 추세
- 최종 conclusion 명확도

### 4. Archive Readiness
질문:
- 결과물이 외부 공유/보관 가능한 수준인가?

평가 기준:
- 요약 문서 존재
- 방법론 문서 존재
- 결정 로그 존재
- 최종 결론 문서 존재
- bundle index 존재

---

## 권장 폴더 구조

```text
sandbox/glm47-research-loop/
├── README.md
├── input/
│   └── research-brief.md
├── workflows/
│   ├── 01-problem-framing.yaml
│   ├── 02-research-loop.yaml
│   ├── 03-convergence-review.yaml
│   └── 04-archive-packaging.yaml
├── output/
│   ├── iterations/
│   ├── final/
│   └── archive/
└── notes/
    └── evaluation.md
```

---

## CTO 권장안

이번 테스트는 한 번에 거대한 마스터 워크플로우를 만들기보다 아래 순서가 맞습니다.

1. **선형 최소 워크플로우**로 context 계승 검증
2. **review/remediation loop** 추가
3. 마지막에 **archive packaging** 분리
4. 그 다음에야 장기 반복형 루프를 붙여서 수렴성 테스트

즉, 이번 테스트의 1차 성공 기준은
**"GLM-4.7 단일 모델 + Obora step 구조만으로 결론 문서와 아카이브 문서 세트를 안정적으로 만든다"** 입니다.

장기 루프 테스트는 그 다음 단계가 맞습니다.
