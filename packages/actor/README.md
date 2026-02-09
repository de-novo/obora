# @obora-kit/actor

Actor 시스템 패키지 - Blackboard 패턴과 함께 사용하는 Actor 모델 기반의 동시성 처리 시스템입니다.

## 설치

```bash
pnpm add @obora-kit/actor
```

## 주요 기능

- **Actor 런타임**: Actor의 생명주기 관리 (spawn, stop, restart)
- **Actor Pool**: 동적 확장/축소, 작업 분배, 로드 밸런싱
- **Supervision**: 재시작 전략, 백오프 정책, Dead Letter Queue

## 사용법

### 기본 Actor 생성

```typescript
import { ActorRuntime, DefaultActorFactory, ActorRole } from "@obora-kit/actor";
import { Blackboard } from "@obora-kit/blackboard";

// Blackboard 인스턴스 (별도 생성)
const blackboard = new Blackboard();

// Factory 설정
const factory = new DefaultActorFactory();
factory.register("analyst", AnalystActor);

// Runtime 생성 및 시작
const runtime = new ActorRuntime(blackboard, factory);
await runtime.start();

// Actor 생성
const actor = await runtime.spawn({
  role: ActorRole.ANALYST,
  type: "analyst",
});

// Actor 사용
const observation = await actor.observe();
const action = await actor.think(observation);
const result = await actor.act(action);
await actor.report(result);

// 정리
await runtime.stop();
```

### Actor Pool 사용

```typescript
import { ActorPool, PoolManager, ActorRole } from "@obora-kit/actor";

// Pool 설정
const poolConfig = {
  name: "analysts",
  role: ActorRole.ANALYST,
  type: "analyst",
  initialSize: 3,
  minSize: 1,
  maxSize: 10,
  dispatchStrategy: "round-robin",
};

// Pool 생성
const pool = new ActorPool(poolConfig, blackboard, factory);
await pool.start();

// 작업 제출
const taskId = await pool.submit({ data: "analyze this" });

// 또는 결과 대기
const result = await pool.submitAndWait({ data: "analyze this" });

// 스케일링
await pool.scaleUp(2); // 2개 추가
await pool.scaleDown(1); // 1개 제거

// 메트릭 조회
const metrics = pool.getMetrics();
console.log(`Active: ${metrics.activeActors}, Queue: ${metrics.queuedTasks}`);
```

### Supervision 설정

```typescript
import { Supervisor, SupervisorTree, RestartStrategy, BackoffPolicy } from "@obora-kit/actor";

// Supervisor 생성
const supervisor = new Supervisor(runtime, {
  strategy: RestartStrategy.ONE_FOR_ONE,
  backoff: {
    policy: BackoffPolicy.EXPONENTIAL,
    initialDelay: 1000,
    maxDelay: 30000,
    multiplier: 2,
  },
  maxRestarts: 3,
  restartWindow: 60000,
});

// Supervisor 시작 및 Actor 감시
supervisor.start();
supervisor.watch("actor-1");
supervisor.watch("actor-2");

// 이벤트 핸들링
supervisor.on("actor:failed", (actorId, error) => {
  console.log(`Actor ${actorId} failed:`, error);
});

supervisor.on("actor:restarted", (actorId, attempt) => {
  console.log(`Actor ${actorId} restarted (attempt ${attempt})`);
});

// 계층적 Supervision
const tree = new SupervisorTree(runtime);
const rootId = tree.createRoot();
const childId = tree.createChild(rootId, {
  strategy: RestartStrategy.ALL_FOR_ONE,
});
```

## Actor 역할

| 역할       | 설명                                |
| ---------- | ----------------------------------- |
| `ANALYST`  | 데이터 분석, 추론, 평가             |
| `EXECUTOR` | API 호출, 파일 처리, 작업 수행      |
| `VERIFIER` | 결과 검증, 품질 체크, 오류 탐지     |
| `DIRECTOR` | 회의 진행, 투표 관리, 의사결정 조율 |

## 재시작 전략

| 전략           | 설명                                      |
| -------------- | ----------------------------------------- |
| `ONE_FOR_ONE`  | 실패한 Actor만 재시작                     |
| `ALL_FOR_ONE`  | 하나가 실패하면 모든 Actor 재시작         |
| `REST_FOR_ONE` | 실패한 Actor와 이후 생성된 Actor들 재시작 |

## 백오프 정책

| 정책                 | 설명                                  |
| -------------------- | ------------------------------------- |
| `FIXED`              | 고정 대기 시간                        |
| `LINEAR`             | 선형 증가 (initialDelay \* attempt)   |
| `EXPONENTIAL`        | 지수 증가 (initialDelay \* 2^attempt) |
| `EXPONENTIAL_JITTER` | 지수 증가 + 랜덤 지터                 |

## API 문서

자세한 API 문서는 [docs/api/actor.md](../../docs/api/actor.md)를 참조하세요.

## 라이선스

MIT
