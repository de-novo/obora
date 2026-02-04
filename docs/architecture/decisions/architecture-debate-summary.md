# 아키텍처 토론 요약

> obora-kit AI 에이전트 오케스트레이션 아키텍처 선택을 위한 토론 결과

## 1. 배경

### 1.1 문제 정의

obora-kit는 AI 에이전트 팀 협업 및 AI 이사회 의사결정 시스템을 구축하는 프로젝트입니다. 초기에는 **DAG(Directed Acyclic Graph)** 기반 워크플로우를 고려했으나, 다음과 같은 한계가 발견되었습니다:

| DAG의 한계 | 설명 |
|------------|------|
| **사이클 불가** | 토론의 본질적인 순환 구조(반박 → 재논의 → 수정) 표현 불가 |
| **정적 구조** | 의제가 진행 중에 바뀌는 동적 상황 대응 불가 |
| **과잉 제약** | AI 에이전트 협업에 필요 이상의 구조화 |

### 1.2 대안 리서치

DAG의 한계를 극복하기 위해 4개 AI 모델에게 대안 아키텍처 리서치를 요청했습니다:

| 모델 | 리서치 주제 | 결과 파일 |
|------|------------|----------|
| **Opus** | Actor Model, Choreography | `/tmp/research-alt-opus.md` |
| **GLM** | Actor + Choreography | `/tmp/research-alt-glm.md` |
| **Kimi** | DAG + Actor + Blackboard | `/tmp/research-alt-kimi.md` |
| **Codex** | Blackboard + Actor | `/tmp/research-alt-codex.md` |

---

## 2. 4개 모델 리서치 결과

### 2.1 Opus: Actor + Blackboard Hybrid

**핵심 주장**: Actor Model을 메인 패러다임으로, Blackboard를 공유 상태 저장소로 사용

**강점**:
- 철학적 기반: "독립적 사고, 공유된 인식"
- 완전한 격리: 각 에이전트는 자신만의 상태와 mailbox
- 자연스러운 병렬성: 메시지 기반 비동기 통신
- 동적 확장: 런타임에 에이전트 추가/제거 가능

**구조**:
```
Actor(메인) + Blackboard(보조)
├── Facilitator Actor: 회의 진행자
├── Agent Actors: CEO, CTO, CFO (독립 mailbox)
└── Blackboard: 공유 상태 저장
```

**자체 점수**: 9.5/10

---

### 2.2 GLM: Actor + Choreography

**핵심 주장**: 중앙 조율자 없이 에이전트들이 P2P로 자율 협력

**강점**:
- 진정한 분산: SPOF(Single Point of Failure) 없음
- 수평 확장성: 에이전트 증가에도 병목 없음
- AI 에이전트 자율성: 독립적 의사결정 최대 보장

**구조**:
```
Actor + Choreography
├── Expert Actors: P2P 직접 통신
├── Board Actor: 이사회 세션 관리
├── Facilitator Actor: 합의 도출 (투표)
└── Message Bus: NATS/Kafka
```

**문제점**:
- 합의 도달 메커니즘 불명확
- 글로벌 상태 부재로 진행 상황 파악 어려움
- 감사 추적(Audit Trail) 분산되어 복잡

**자체 점수**: 미표기 (추정 7.0~8.0/10)

---

### 2.3 Kimi: DAG + Actor + Blackboard

**핵심 주장**: DAG로 워크플로우 정의, Actor가 실행, Blackboard가 상태 공유

**강점**:
- 워크플로우 명시성: DAG로 의존성 시각화
- 역할 분담 명확: 각 레이어 책임 분리
- 검증된 패턴 조합

**구조**:
```
DAG(워크플로우) + Actor(실행) + Blackboard(상태)
├── DAG Layer: 작업 의존성 그래프
├── Actor Layer: 실행 단위
└── Blackboard Layer: 공유 상태
```

**문제점**:
- 3개 패러다임 결합 → 복잡도 과잉
- DAG는 정적 → AI 토론의 동적 특성에 부적합
- 학습 곡선 급증

**자체 점수**: 미표기 (추정 6.5~7.5/10)

---

### 2.4 Codex: Blackboard + Actor

**핵심 주장**: Blackboard가 "뇌"로서 중심, Actor가 "손발"로서 실행

**강점**:
- **합의 단순화**: Blackboard가 SSOT → 분산 합의 불필요
- **상태 투명성**: 현재 상태가 항상 가시적
- **진입장벽 낮음**: "보드에 쓰고 읽기"만 이해하면 됨
- **실제 이사회와 동형**: 회의실+화이트보드 구조

**구조**:
```
Blackboard(중심) + Actor(실행)
├── Blackboard: State, Knowledge, Decisions
├── Event Bus: Pub/Sub 알림
└── Actor Pools: 분석, 실행, 검증팀
```

**자체 점수**: 9.0/10

---

## 3. 선택지 토론 과정

### 3.1 토론 구조

각 모델이 자신의 안을 옹호하고, 다른 안을 반박하는 형식으로 진행:

```
/tmp/debate3-opus.md  → Actor + Blackboard Hybrid 옹호
/tmp/debate3-glm.md   → Actor + Choreography 옹호
/tmp/debate3-codex.md → Blackboard + Actor 옹호
```

### 3.2 주요 반박 내용

#### Opus의 GLM 반박 (타당성: 4/5)

| 반박 | 판정 |
|------|------|
| "O(N²) 복잡도 폭발" | ✅ 타당 |
| "글로벌 상태 부재" | ✅ 타당 (가장 치명적) |
| "데드락 위험" | ⚠️ 부분 타당 |
| "토론 흐름 제어 불가" | ✅ 타당 |

#### Opus의 Codex 반박 (타당성: 2/5)

| 반박 | 판정 |
|------|------|
| "병렬 실행 조율 부족" | ⚠️ Pub/Sub으로 해결 가능 |
| "경쟁 조건" | ⚠️ Optimistic locking으로 해결 가능 |
| "능동적 조율 불가" | ❌ 과장 |

#### Codex의 Opus 반박 (타당성: 4/5)

| 반박 | 판정 |
|------|------|
| "Actor 중심이면 상태 공유 복잡" | ✅ 타당 |
| "Blackboard를 '보조'로 취급하면 결국 재발명" | ✅ 타당 |

#### Codex의 GLM 반박 (타당성: 5/5)

| 반박 | 판정 |
|------|------|
| "합의 도달 보장 없음" | ✅ 매우 타당 |
| "투표 집계 주체 부재" | ✅ 타당 |
| "감사 추적 불가" | ✅ 타당 |

### 3.3 핵심 논점 정리

```
┌─────────────────────────────────────────────────────────────────┐
│                        핵심 논점                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Q1: 공유 상태를 어디서 관리할 것인가?                           │
│                                                                 │
│      Actor 중심: 메시지로 상태 전파 → O(N²) 복잡도              │
│      Blackboard 중심: 중앙 상태 → O(N) 복잡도 ✅                │
│                                                                 │
│  Q2: 합의는 어떻게 도달하는가?                                   │
│                                                                 │
│      Choreography: 자율 합의 → 수렴 보장 없음                   │
│      Blackboard: 투표 집계 → 명확한 결과 ✅                     │
│                                                                 │
│  Q3: 이사회 도메인에 가장 자연스러운 모델은?                     │
│                                                                 │
│      실제 이사회 = 회의실(공간) + 화이트보드(기록)               │
│      → Blackboard 중심이 가장 동형 ✅                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. 최종 결론 및 점수

### 4.1 최종 평가표

| 기준 | Codex (BB+Act) | Opus (Act+BB) | GLM (Choreo) | Kimi (DAG) | 가중치 |
|------|----------------|---------------|--------------|------------|--------|
| **AI 이사회 적합성** | 10 | 9 | 5 | 7 | 30% |
| **합의 단순성** | 10 | 7 | 5 | 7 | 25% |
| **개발 속도** | 10 | 8 | 8 | 6 | 25% |
| **확장성** | 7 | 8 | 10 | 9 | 10% |
| **디버깅 용이성** | 10 | 7 | 5 | 6 | 10% |
| **가중 평균** | **9.55** | **7.85** | **6.10** | **6.80** | 100% |

### 4.2 최종 순위

| 순위 | 옵션 | 점수 | 추천도 |
|------|------|------|--------|
| **🏆 1위** | **Blackboard + Actor (Codex)** | **9.0/10** | ⭐⭐⭐⭐⭐ |
| 2위 | Actor + Blackboard (Opus) | 8.5/10 | ⭐⭐⭐⭐ |
| 3위 | Actor + Choreography (GLM) | 7.0/10 | ⭐⭐⭐ |
| 4위 | DAG + Actor + Blackboard (Kimi) | 6.5/10 | ⭐⭐ |
| 5위 | Pure DAG | 6.0/10 | ⭐⭐ |

### 4.3 선택 근거 요약

```
┌─────────────────────────────────────────────────────────────────┐
│                      최종 선택: Blackboard + Actor               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📊 점수: 9.0/10                                                │
│                                                                 │
│  📝 핵심 근거:                                                   │
│                                                                 │
│  1. 도메인 적합성                                                │
│     AI 이사회 = 회의실 + 화이트보드                              │
│     → Blackboard 중심이 자연스러움                              │
│                                                                 │
│  2. 합의 단순화                                                  │
│     Blackboard가 SSOT                                           │
│     → 분산 합의 프로토콜 불필요                                  │
│                                                                 │
│  3. 개발 속도                                                    │
│     "보드에 쓰고 읽기"만 이해하면 됨                             │
│     → MVP까지 가장 빠른 경로                                    │
│                                                                 │
│  4. 감사 추적                                                    │
│     모든 결정 과정이 Blackboard에 기록                          │
│     → 규제 환경 대응 가능                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.4 Opus vs Codex 차이점

두 안 모두 Actor + Blackboard를 사용하지만 관점이 다릅니다:

| 관점 | Opus (Actor 중심) | Codex (Blackboard 중심) |
|------|-------------------|-------------------------|
| 주인공 | Actor | Blackboard |
| 메타포 | "회의 참석자들" | "뇌와 손발" |
| 흐름 제어 | Actor 메시지 중심 | Blackboard 상태 전이 중심 |
| 상태 공유 | 보조적 | 핵심적 |
| 복잡도 | 약간 높음 | 약간 낮음 |

**Codex 안이 더 나은 이유**: 
- 이사회 의사결정에서 **공유 상태**가 **개별 행동**보다 더 중심적
- Blackboard를 명시적으로 중심에 두는 것이 도메인에 더 부합

---

## 5. 결론

### 최종 결정

**Blackboard + Actor (Codex 안)** 아키텍처를 채택합니다.

### 핵심 원칙

> **"Blackboard가 뇌, Actor가 손발."**
> 
> 공유 상태를 중심에 두고, 실행을 분산시켜라.
> 이것이 AI 에이전트 팀 협업의 자연스러운 구조다.

### 향후 계획

1. **Phase 1**: Blackboard 코어 구현 (Week 1-2)
2. **Phase 2**: Actor 시스템 구현 (Week 3-4)
3. **Phase 3**: AI 에이전트 통합 (Week 5-6)
4. **Phase 4**: 이사회 시스템 구현 (Week 7-8)

---

## 참고 자료

### 토론 원본 파일

| 파일 | 내용 |
|------|------|
| `/tmp/debate3-opus.md` | Actor + Blackboard Hybrid 옹호 |
| `/tmp/debate3-glm.md` | Actor + Choreography 옹호 |
| `/tmp/debate3-codex.md` | Blackboard + Actor 옹호 |
| `/tmp/debate3-codex-review.md` | 최종 리뷰 |

### 리서치 원본 파일

| 파일 | 내용 |
|------|------|
| `/tmp/research-alt-opus.md` | Opus 리서치 결과 |
| `/tmp/research-alt-glm.md` | GLM 리서치 결과 |
| `/tmp/research-alt-kimi.md` | Kimi 리서치 결과 |
| `/tmp/research-alt-codex.md` | Codex 리서치 결과 |
| `/tmp/research-alt-codex-v2.md` | Codex 상세 리서치 |

### 관련 문서

- [ADR-001: Blackboard + Actor 아키텍처 선택](./ADR-001-blackboard-actor-architecture.md)
- [Blackboard + Actor 설계 문서](../blackboard-actor-design.md)

---

*문서 작성일: 2026-02-04*
*토론 참여: Claude Opus 4.5, GLM 4.7, Kimi K2.5, Codex 5.2*
