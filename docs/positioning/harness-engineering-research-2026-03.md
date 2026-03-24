# 하네스 엔지니어링 리서치 (2026-03)

## 1. "하네스 엔지니어링"이란

AI 에이전트를 프로덕션에 배포할 때, 에이전트 자체의 능력(추론, 코딩, 분석)이 아니라 **에이전트를 감싸는 실행/검증/복구 인프라**를 설계하는 분야.

> "The gap between a demo agent and a production agent isn't the model, the prompt, or the tools — it's the orchestration layer."
> — AI Workflow Lab, 2026

### 핵심 질문
- 에이전트가 실패하면 어떻게 되는가?
- 중간 결과는 보존되는가?
- 실패 유형에 따라 다른 복구 경로를 탈 수 있는가?
- 사람 없이 밤새 돌려도 안전한가?
- 이전 실행에서 배운 것을 다음 실행에 쓸 수 있는가?

---

## 2. 시장 현황 (2026)

### 2.1 시장 규모
- AI 에이전트 오케스트레이션 시장: **$7.38B** (2023년 $3.7B에서 2배)
- 엔터프라이즈 코파일럿 지출의 86%가 에이전트 기반 시스템에 집중
- 2030년 전망: $35~45B
- **리스크**: 2027년까지 에이전트 프로젝트의 40%+ 이상이 비용/복잡도로 취소될 수 있음

### 2.2 시장의 구조적 문제

> "Pilots succeed in controlled environments, value is demonstrated, but scaling to production reveals architectural gaps."
> — Thread AI, 2026

**세 가지 병목**:
1. **사일로화된 이니셔티브** — 각 AI 프로젝트가 독립적으로 진행되어 재사용 불가
2. **인프라 복잡도** — 다양한 도구 조합이 깨지기 쉬운 스택 생성
3. **가드레일 부재** — 제어/거버넌스/감사 없이는 엔터프라이즈가 신뢰하지 않음

→ 이 세 문제 모두 "하네스 엔지니어링" 영역

---

## 3. 경쟁 도구별 하네스 역량 분석

### 3.1 분류 체계

하네스 엔지니어링의 5가지 축:

| 축 | 설명 |
|---|---|
| **Durability** | 실행 상태 보존, 크래시 복구, checkpoint |
| **Validation** | 결과물의 정확성을 자동 검증 |
| **Repair** | 실패 시 자동 수정 시도 |
| **Learning** | 실행 간 지식 축적 및 재활용 |
| **Governance** | 감사 추적, 정책 제어, 비용 관리 |

### 3.2 도구별 하네스 역량 매핑

| | Durability | Validation | Repair | Learning | Governance |
|---|:-:|:-:|:-:|:-:|:-:|
| **LangGraph** | ⬛⬛⬛⬜ | ⬛⬜⬜⬜ | ⬛⬜⬜⬜ | ⬛⬜⬜⬜ | ⬛⬛⬜⬜ |
| **LangGraph + Temporal** | ⬛⬛⬛⬛ | ⬛⬜⬜⬜ | ⬛⬛⬜⬜ | ⬛⬜⬜⬜ | ⬛⬛⬛⬜ |
| **CrewAI** | ⬛⬜⬜⬜ | ⬛⬜⬜⬜ | ⬜⬜⬜⬜ | ⬛⬜⬜⬜ | ⬜⬜⬜⬜ |
| **AutoGen** | ⬛⬛⬜⬜ | ⬛⬜⬜⬜ | ⬛⬜⬜⬜ | ⬜⬜⬜⬜ | ⬛⬜⬜⬜ |
| **Thread AI (Lemma)** | ⬛⬛⬛⬜ | ⬛⬛⬜⬜ | ⬛⬜⬜⬜ | ⬜⬜⬜⬜ | ⬛⬛⬛⬛ |
| **Rasa** | ⬛⬛⬛⬜ | ⬛⬛⬜⬜ | ⬛⬜⬜⬜ | ⬜⬜⬜⬜ | ⬛⬛⬛⬜ |
| **Temporal (단독)** | ⬛⬛⬛⬛ | ⬜⬜⬜⬜ | ⬛⬛⬛⬜ | ⬜⬜⬜⬜ | ⬛⬛⬛⬜ |
| **Obora** | ⬛⬛⬛⬛ | ⬛⬛⬛⬛ | ⬛⬛⬛⬛ | ⬛⬛⬛⬛ | ⬛⬛⬛⬛ |

### 3.3 상세 비교

#### LangGraph (+ Temporal)
**하네스 수준: 중간**

- **Durability**: Checkpoint 기반. PostgreSQL/Redis backend. 크래시 복구 가능.
- **Validation**: 없음. 개발자가 conditional edge로 직접 구현해야 함.
- **Repair**: Retry만 있음. "실패 유형별 다른 수정 경로" 없음.
- **Learning**: 없음. 각 실행이 독립적.
- **Governance**: LangSmith(유료)로 trace 가능. 정책 엔진 없음.

Temporal과 결합하면 Durability/Repair가 강화되지만, Validation/Learning은 여전히 없음.

> "LangGraph + Temporal: 2-layer architecture. LangGraph handles agent logic, Temporal handles durability."
> — AI Workflow Lab

**핵심 갭**: 에이전트가 실패했을 때 "왜 실패했는지" 자동 분류하는 기능 없음. Retry는 있지만 "진단 → 처방"은 없음.

#### CrewAI
**하네스 수준: 낮음**

- Role-based metaphor는 직관적이지만, 하네스 인프라가 거의 없음
- Sequential 실행 중심. Parallel은 미성숙.
- 실패 시 전체 재시작 (중간 상태 보존 없음)
- "Fast to demo, fragile in production"

**핵심 갭**: 프로덕션 안전장치 전무. 프로토타이핑 도구.

#### AutoGen (→ Microsoft Agent Framework)
**하네스 수준: 중간**

- Conversation-first이라 대화 기반 repair는 자연스러움
- Human-in-the-loop이 가장 강함
- 하지만 대화 흐름이 비결정적이라 예측/감사가 어려움
- Token 소비가 높음 (대화 오버헤드)

**핵심 갭**: "결정론적 검증" 없음. 에이전트끼리 대화하면서 자연스럽게 수정하지만, 빌드/테스트 같은 결정론적 검증을 Shell로 돌리는 구조가 없음.

#### Thread AI (Lemma)
**하네스 수준: 높음 (Governance 중심)**

- "Controlled Autonomy" 컨셉으로 Obora와 가장 유사한 포지셔닝
- 엔터프라이즈 거버넌스 (audit trail, compliance, RBAC) 강조
- 하지만 Validation-Repair Loop 같은 자동 수렴 메커니즘은 없음

**핵심 갭**: 거버넌스는 강하지만 "AI가 실패했을 때 자동으로 고치는" 기능은 약함.

#### Rasa
**하네스 수준: 높음 (대화 AI 한정)**

- 대화 AI 오케스트레이션에 최적화
- 명시적 규칙/정책으로 다음 액션 결정
- Structured state tracking

**핵심 갭**: 대화 AI 전용. 코딩/빌드/문서 생성 같은 범용 워크플로우에는 적용 불가.

#### Temporal (단독)
**하네스 수준: 높음 (인프라 레벨)**

- Durable execution의 산업 표준
- Retry + Saga pattern (compensation) + Activity heartbeat
- AI에 특화되지 않음 — 범용 워크플로우 엔진

**핵심 갭**: AI-aware 기능 없음. LLM 실패 유형 분류, validation, cross-execution learning 모두 없음. "AI 하네스"가 아니라 "범용 하네스".

---

## 4. Obora의 하네스 엔지니어링 위치

### 4.1 Obora가 유일하게 제공하는 것

| 기능 | 설명 | 다른 도구에서의 상태 |
|------|------|---------------------|
| **Validation-Repair Loop** | Shell hook으로 실제 빌드/테스트 실행 → 실패 자동 분류 → 조건부 라우팅 → 수렴까지 반복 | 없음. 모두 수동 구현 필요 |
| **Structured Failure Classification** | `test_code_bug` / `implementation_bug` / `design_issue`로 분류하고 각각 다른 step으로 라우팅 | 없음 |
| **Reflector v2** | Pluggable analyzer + rule engine + action system | 없음 |
| **Cross-Execution Learning (TKG)** | 이전 실행에서 배운 패턴을 다음 실행에 자동 적용 | 없음. 모든 경쟁자는 단일 실행 범위 |
| **Shell Hooks** | Pre/post step에서 결정론적 명령 실행 (npm test, tsc) | LangGraph: tool call로 가능하지만 비결정론적 |

### 4.2 하네스 엔지니어링 축에서의 비교

```
                    Validation ──────────────────→
                    │
                    │               Obora ●
                    │              (유일하게 모든 축 커버)
                    │
                    │
    Durability      │     LangGraph+Temporal ●
         │          │
         │   Thread AI ●
         │          │        AutoGen ●
         │    Rasa ●│
         │          │
         ▼          │  CrewAI ●
                    │
                    └──────────── Repair ──────────→
```

### 4.3 "하네스 엔지니어링 플랫폼"으로서의 Obora

Obora는 **"AI Control Runtime"**으로 포지셔닝하고 있지만, 하네스 엔지니어링 관점에서 더 구체적으로 말하면:

> **"에이전트가 실패했을 때, 실패를 진단하고, 적절한 수정 경로를 선택하고, 수정을 시도하고, 다시 검증하고, 성공할 때까지 반복하며, 이 과정에서 배운 것을 다음 실행에 적용하는 — 완전 자동화된 AI 하네스."**

이건 다른 어떤 도구도 제공하지 않는 조합이다.

---

## 5. 경쟁 위협 분석

### 5.1 단기 위협 (6개월 내)
- **LangGraph + Temporal 2-layer**: Durability는 강하지만 Validation/Learning 없음. Obora의 핵심 영역은 안전.
- **CrewAI Enterprise**: 프로토타이핑에서 프로덕션으로 진출 시도. 하지만 하네스 인프라 부족은 근본적.
- **Microsoft Agent Framework**: AutoGen + Semantic Kernel 통합. Human-in-the-loop 강하지만 결정론적 검증 없음.

### 5.2 중기 위협 (6~12개월)
- **Google A2A Protocol**: 에이전트 간 상호운용 표준. 150+ 조직 참여. Obora도 지원해야 할 수 있음.
- **Thread AI (Lemma)**: Governance 중심 경쟁자. "Controlled Autonomy"는 Obora의 철학과 겹침. 하지만 Validation-Repair는 없음.
- **Temporal이 AI 기능 추가**: Temporal이 직접 LLM-aware retry, validation 추가하면 Obora의 영역과 겹침.

### 5.3 장기 위협 (12개월+)
- **LLM 자체가 하네스를 내재화**: 모델이 충분히 똑똑해져서 외부 검증 없이도 정확한 결과를 내면 하네스의 가치가 줄어듦. **하지만**: 현재 추세는 반대. 모델 능력이 올라가도 프로덕션 신뢰성 요구는 더 올라감.
- **Cloud Provider 통합**: AWS/Azure/GCP가 자체 AI 오케스트레이션 + 하네스를 제공하면 독립 도구의 시장이 좁아짐.

---

## 6. 기회 분석

### 6.1 하네스 엔지니어링 시장 크기 추정
- 전체 AI Agent 오케스트레이션 시장 $7.38B 중
- "프로덕션 안전장치/검증/복구" 영역은 약 15~20% → **$1.1~1.5B**
- 2030년 $35~45B 기준으로 → **$5.25~9B**

### 6.2 TAM/SAM/SOM
- **TAM**: AI 에이전트를 프로덕션에 배포하는 모든 엔터프라이즈 (~$7.38B)
- **SAM**: "에이전트 실패 시 자동 복구가 필요한" 미션 크리티컬 AI 운영 (~$1.5B)
- **SOM**: TypeScript 생태계 + 코딩/빌드 자동화 도메인 (~$150M)

### 6.3 가장 유망한 초기 시장
1. **AI 코딩 에이전트 하네스** — Devin, Codex, Claude Code 등의 결과물을 검증/수정하는 인프라
2. **CI/CD AI 파이프라인** — AI가 생성한 코드를 빌드/테스트/배포하는 자동화 파이프라인
3. **문서 생성 품질 관리** — AI가 생성한 문서의 정확성을 자동 검증하는 시스템

---

## 7. 전략적 시사점

### 7.1 핵심 메시지
> "다른 도구는 AI를 쉽게 만든다. Obora는 AI가 실패해도 괜찮게 만든다."

### 7.2 하네스 엔지니어링에서의 포지셔닝

| 경쟁자의 질문 | Obora의 답변 |
|---|---|
| "에이전트가 실패하면?" | Auto-rollback + DLQ + Auto-recovery |
| "같은 실수를 반복하면?" | Reflector v2 + TKG cross-execution learning |
| "실패 유형에 따라 다르게 대응하려면?" | Structured failure classification + conditional routing |
| "사람 없이 밤새 돌리려면?" | Execution lock + Health check + Alerting + Circuit breaker |
| "결과물이 정확한지 어떻게 아나?" | Shell hooks로 실제 빌드/테스트 실행 |

### 7.3 다음 단계
1. **"Harness Engineering" 용어 정립** — 블로그/발표를 통해 카테고리 창출
2. **SWE-bench에서 Obora 하네스 효과 정량화** — "하네스 없이 vs 하네스 있으면" 비교
3. **LangGraph → Obora 마이그레이션 가이드** — "LangGraph에서 2시간 만에 Validation-Repair Loop 추가하기"
4. **Temporal 연동** — Temporal의 durability + Obora의 AI-aware harness = 최강 조합
