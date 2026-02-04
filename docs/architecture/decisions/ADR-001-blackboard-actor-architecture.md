# ADR-001: Blackboard + Actor 아키텍처 선택

## 상태 (Status)

**Accepted** (2026-02-04)

## 컨텍스트 (Context)

obora-kit 프로젝트는 AI 에이전트 팀 협업 및 AI 이사회 의사결정 시스템을 구축하는 것을 목표로 합니다. 다음과 같은 요구사항이 있습니다:

1. **AI 에이전트 팀 협업**: 다수의 AI 에이전트가 협력하여 복잡한 문제를 해결
2. **AI 이사회 의사결정**: CEO, CTO, CFO 등 역할별 에이전트가 투표/합의로 결정 도출
3. **병렬 확장성**: 에이전트 수 증가 시 자연스러운 수평 확장
4. **빠른 개발**: MVP 단계에서 신속한 프로토타이핑 가능

초기에는 DAG(Directed Acyclic Graph) 기반 워크플로우를 고려했으나, AI 에이전트의 동적이고 비선형적인 토론 특성을 표현하기에 부적합하다는 문제가 발생했습니다. 이에 따라 대안 아키텍처를 연구하고 검토했습니다.

## 결정 (Decision)

**Blackboard 중심 + Actor 실행 레이어** 아키텍처를 선택합니다.

### 핵심 메타포

- **Blackboard = 뇌**: 공유 상태, 지식 베이스, 합의 기록 관리
- **Actor = 손발**: 병렬 실행, 에이전트 래퍼, 실제 행동 담당

## 대안 검토 (Alternatives Considered)

### 1. DAG (Directed Acyclic Graph)
**점수**: 6/10

**장점**:
- 정적 의존성 관리에 명확
- 워크플로우 시각화 용이

**단점**:
- **사이클 불가**: 토론의 본질적인 순환 구조(반박 → 재논의 → 수정) 표현 불가
- 동적 변경 어려움: 의제가 진행 중에 바뀌는 상황 대응 불가
- 과잉 제약: AI 에이전트 협업에 필요 이상의 구조화

### 2. Actor + Blackboard Hybrid (Opus 안)
**점수**: 8.5/10

**장점**:
- Actor Model의 자연스러운 병렬성
- Blackboard의 공유 상태 관리
- 명확한 관심사 분리

**단점**:
- Actor가 메인 패러다임 → Blackboard가 "부수적"으로 취급됨
- 실제로는 상태 공유가 핵심인 도메인에서 어울리지 않음
- Facilitator Actor가 사실상 중앙 조율자 → Choreography 비판과 모순

### 3. Actor + Choreography (GLM 안)
**점수**: 7.0/10

**장점**:
- 진정한 분산형 협업
- SPOF(Single Point of Failure) 없음
- 수평 확장성 최고

**단점**:
- **합의 도달 메커니즘 부재**: 투표 집계 주체가 없음
- 글로벌 상태 부재: "토론이 어디까지 왔는지" 파악 어려움
- 감사 추적(Audit Trail) 분산되어 복잡
- 데드락/무한 루프 위험

### 4. **Blackboard + Actor (Codex 안) ← 선택**
**점수**: 9.0/10

**장점**:
- **합의 단순화**: Blackboard가 SSOT(Single Source of Truth) 제공 → 분산 합의 불필요
- **상태 투명성**: 현재 상태가 항상 가시적 → 디버깅/모니터링 용이
- **진입장벽 낮음**: "보드에 쓰고 읽기"만 이해하면 됨
- **실제 이사회와 동형**: 회의실+화이트보드 구조와 자연스럽게 일치
- **빠른 개발**: MVP까지 가장 빠른 경로

**단점**:
- Blackboard 병목 가능성 (단, AI 이사회 규모에서는 문제 없음)
- 대규모 확장 시 샤딩 필요

## 근거 (Rationale)

### 1. 도메인 적합성

AI 이사회 의사결정은 **공유 상태**가 핵심입니다:

```
실제 이사회:
┌─────────────────────────────────────────┐
│ 1. 회의실(공간)에 모임  ← Blackboard     │
│ 2. 의제가 화이트보드에 적힘  ← Decisions │
│ 3. 각자 의견 발표  ← Actor 실행          │
│ 4. 발표 내용이 기록됨  ← Blackboard 기록 │
│ 5. 투표 진행  ← Voting system          │
│ 6. 결과 공표  ← Resolution              │
└─────────────────────────────────────────┘
```

이사회는 본질적으로 "조율된 절차"가 필요합니다. 완전 분산형 Choreography로는 합의 도달을 보장할 수 없습니다.

### 2. 합의 단순화

**Actor 중심**:
- N개 에이전트 간 상호작용 = O(N²) 복잡도
- 분산 합의 프로토콜 구현 필요 (Raft, Paxos 급 복잡성)

**Blackboard 중심**:
- 모든 에이전트가 동일한 보드 참조 = O(N) 통신 경로
- 보드가 자동으로 상태 동기화
- 투표 집계 = 단순 카운트

### 3. SSOT (Single Source of Truth)

Blackboard는 공유 상태의 단일 진실 소스를 제공합니다:

```typescript
// Blackboard가 관리하는 상태
{
  decisions: {
    'agenda-1': {
      status: 'in-progress',
      opinions: [
        { agent: 'ceo', vote: 'approve', reason: '...' },
        { agent: 'cto', vote: 'conditional', reason: '...' },
        { agent: 'cfo', vote: 'reject', reason: '...' }
      ],
      voteSummary: { approve: 1, conditional: 1, reject: 1 }
    }
  }
}
```

### 4. 감사 추적 (Audit Trail)

모든 결정 과정이 Blackboard에 기록되므로, "왜 이 결정이 났는가?"를 완전히 추적할 수 있습니다. 규제 환경에서 중요한 요구사항입니다.

## 결과 (Consequences)

### 긍정적 효과

1. **합의 단순화**: 분산 합의 프로토콜 불필요 → 코드 복잡도 감소
2. **SSOT 보장**: 공유 상태가 항상 일관성 있음
3. **빠른 개발**: 진입장벽 낮음 → MVP까지 8주 계획
4. **디버깅 용이**: 보드 스냅샷으로 상태 즉시 파악
5. **확장 가능**: 필요시 샤딩, 분산 저장 추가 가능

### 부정적 효과

1. **Blackboard 병목 가능성**: 대규모(100+ 에이전트) 시 성능 이슈 발생 가능
2. **SPOF 우려**: 단일 Blackboard 인스턴스는 장애점 (Redis Cluster로 해결)
3. **Actor 수동성**: Event-driven push가 아닌 poll 기반이 될 가능성 (Pub/Sub로 해결)

### 완화 전략 (Mitigation)

| 우려 | 완화 방안 |
|------|----------|
| Blackboard 병목 | Redis Cluster / 섹션별 샤딩 |
| SPOF | Redis Sentinel / 복제 |
| Actor 수동성 | Pub/Sub 이벤트 버스 |
| 확장성 | Actor Pool / 동적 확장 |

## 향후 고려사항

### Phase 1 (현재)
- Blackboard 중심 기본 구조
- 기본 Actor 래퍼
- 인메모리 저장소

### Phase 2 (필요시)
- Redis 분산 저장소
- Pub/Sub 이벤트 버스
- Actor Pool 관리

### Phase 3 (선택)
- Choreography 레이어 추가 (긴급 P2P 협상용)
- DAG 최적화 (정적 워크플로우 필요 시)

## 참고 문서

- `docs/architecture/decisions/architecture-debate-summary.md` - 전체 토론 요약
- `docs/architecture/blackboard-actor-design.md` - 상세 설계 문서

## 결정 일자

2026-02-04

## 결정자

준혁님 (Project Lead)

## 관련 문제

- [TASK-001](../tasks/P0-MVP/TASK-001-project-setup.md) - 프로젝트 설정
- [TASK-011](../tasks/P0-MVP/TASK-011-obora-plan.md) - 의사결정 계획
