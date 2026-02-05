# P1: Blackboard + Actor 아키텍처 구현

## 🎯 목표

P1의 목표는 **AI 이사회 의사결정 시스템**의 핵심 인프라를 구현하는 것입니다.

"Blackboard = 뇌, Actor = 손발" 메타포를 기반으로, 다수의 AI 에이전트가 협업하여 의사결정을 내리는 시스템을 만듭니다.

## 🚀 P1 완료 시 가능한 것들

### 1. AI 이사회 의사결정
- 다수의 AI 에이전트(CEO, CTO, CFO 등)가 안건을 토론
- 투표를 통한 합의 도출 (다수결, 만장일치, 가중치)
- 조건부 승인, 재토론, 에스컬레이션 지원

### 2. 에이전트 팀 협업
- 분석팀, 실행팀, 검증팀으로 역할 분담
- 병렬 작업 수행 및 결과 종합
- 장애 격리 및 자동 복구 (Supervision)

### 3. 공유 지식 기반 협업
- Blackboard를 통한 실시간 상태 공유
- 이벤트 기반 반응형 협업
- 의사결정 히스토리 추적

## 📦 구현되는 패키지

| 패키지 | 설명 | Phase |
|--------|------|-------|
| @obora-kit/blackboard | 공유 상태 관리, 이벤트 버스 | Phase 1 |
| @obora-kit/actor | Actor 런타임, 풀 관리, Supervision | Phase 2 |
| @obora-kit/agents | Pi Mono 어댑터, 역할별 에이전트 | Phase 3 |
| @obora-kit/board | 안건 관리, 투표, 합의 알고리즘 | Phase 4 |

## 🎮 사용 예시

### AI 이사회 회의 실행
```typescript
import { Board, Blackboard, ActorPool } from '@obora-kit/board';
import { AnalystAgent, DirectorAgent } from '@obora-kit/agents';

// 이사회 구성
const board = new Board({
  blackboard: new Blackboard(),
  agents: [
    new AnalystAgent({ role: 'CEO', model: 'pi-mono' }),
    new AnalystAgent({ role: 'CTO', model: 'pi-mono' }),
    new AnalystAgent({ role: 'CFO', model: 'pi-mono' }),
  ],
  director: new DirectorAgent(),
});

// 안건 제출 및 의사결정
const result = await board.submitAgenda({
  title: '신규 AI 모델 도입 검토',
  description: '...',
  votingMethod: 'majority',
});

console.log(result.decision); // 'approved' | 'rejected' | 'deferred'
console.log(result.voteSummary); // { approve: 2, reject: 1, abstain: 0 }
```

## 📊 P1 진행 상황

| Phase | 태스크 | 예상 시간 | 상태 |
|-------|--------|:---------:|:----:|
| Phase 1 | TASK-018~023 | 30h | 📋 대기 |
| Phase 2 | TASK-024~029 | 34h | 📋 대기 |
| Phase 3 | TASK-030~035 | 40h | 📋 대기 |
| Phase 4 | TASK-036~041 | 38h | 📋 대기 |
| **총계** | **24개 태스크** | **142h** | - |

### Phase별 태스크 상세

#### Phase 1: Blackboard Core (TASK-018~023)
| 태스크 | 제목 | 예상 시간 | 상태 |
|--------|------|:---------:|:----:|
| TASK-018 | Blackboard 상태 스키마 정의 | 4h | 📋 대기 |
| TASK-019 | Blackboard 핵심 기능 구현 | 5h | 📋 대기 |
| TASK-020 | 이벤트 버스 구현 | 5h | 📋 대기 |
| TASK-021 | 스냅샷/복원 기능 | 4h | 📋 대기 |
| TASK-022 | Blackboard 패키지 구성 | 4h | 📋 대기 |
| TASK-023 | Blackboard 테스트 작성 | 8h | 📋 대기 |

#### Phase 2: Actor System (TASK-024~029)
| 태스크 | 제목 | 예상 시간 | 상태 |
|--------|------|:---------:|:----:|
| TASK-024 | Actor 인터페이스 정의 | 5h | 📋 대기 |
| TASK-025 | Actor 런타임 구현 | 6h | 📋 대기 |
| TASK-026 | Actor 풀 관리 구현 | 7h | 📋 대기 |
| TASK-027 | Supervision(재시작 전략) 구현 | 6h | 📋 대기 |
| TASK-028 | Actor 패키지 구성 | 4h | 📋 대기 |
| TASK-029 | Actor 테스트 작성 | 6h | 📋 대기 |

#### Phase 3: AI Integration (TASK-030~035)
| 태스크 | 제목 | 예상 시간 | 상태 |
|--------|------|:---------:|:----:|
| TASK-030 | LLM 어댑터 구현 (Pi Mono) | 5h | 📋 대기 |
| TASK-031 | 역할별 에이전트 정의 | 7h | 📋 대기 |
| TASK-032 | 프롬프트 템플릿 시스템 | 7h | 📋 대기 |
| TASK-033 | 도구 통합 (Function Calling) | 7h | 📋 대기 |
| TASK-034 | Agents 패키지 구성 | 4h | 📋 대기 |
| TASK-035 | Agents 테스트 작성 | 10h | 📋 대기 |

#### Phase 4: Board System (TASK-036~041)
| 태스크 | 제목 | 예상 시간 | 상태 |
|--------|------|:---------:|:----:|
| TASK-036 | 안건 관리 구현 | 5h | 📋 대기 |
| TASK-037 | 투표 시스템 구현 | 7h | 📋 대기 |
| TASK-038 | 합의 알고리즘 구현 | 8h | 📋 대기 |
| TASK-039 | 상태 기계 (State Machine) 구현 | 7h | 📋 대기 |
| TASK-040 | Board 패키지 구성 | 5h | 📋 대기 |
| TASK-041 | E2E 테스트 작성 | 6h | 📋 대기 |

## 🔮 P1 이후 (P2 계획)

- CLI 통합 (`obora board start`, `obora board submit`)
- 웹 대시보드 (실시간 이사회 상황 모니터링)
- 다중 프로젝트 지원
- 플러그인 시스템

## 📚 참조 문서

- [[../architecture/blackboard-actor-design|Blackboard + Actor 아키텍처 설계]]
- [[TASK-018-blackboard-schema|TASK-018]] ~ [[TASK-041-board-e2e-tests|TASK-041]]

---

*P1 완료 예상: 8주 (풀타임 기준)*
