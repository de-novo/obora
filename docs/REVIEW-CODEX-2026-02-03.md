# Codex 리뷰 결과

> 리뷰 일시: 2026-02-03 20:31 KST
> 리뷰어: Codex Agent (GLM 4.7)
> 대상: obora-kit v3 스펙/태스크 문서

---

## 요약
- **전체 평가: 중**
- **코드 품질: 7/10**

### 평가 근거
- ✅ 전반적인 아키텍처 설계 우수
- ✅ 타입 정의 시도 충분
- ⚠️ 스펙과 태스크 간 타입 불일치 존재
- ⚠️ 일부 알고리즘 구현 오류
- ⚠️ 테스트 케이스 커버리지 부족

---

## 스펙 문서 리뷰

### 코드 예시 검토

#### ✅ 정확한 코드
| 파일 | 섹션 | 상태 |
|------|------|------|
| 06-yaml-validation.md | JSON Schema 정의 | ✅ 정확 |
| 07-database-schema.md | SQL DDL 문법 | ✅ 정확 |
| 08-agent-definition.md | AgentRegistry 인터페이스 | ✅ 정확 |

#### ⚠️ 수정 필요한 코드

**1. 05-dependency-resolver.md - Kahn's Algorithm 그래프 방향 오류**

```typescript
// ❌ 현재 (잘못됨) - edges가 from → [to] 방향
for (const [from, toSet] of graph.edges) {
  for (const to of toSet) {
    indegree.set(to, (indegree.get(to) || 0) + 1);
  }
}

// ✅ 수정 필요 - 의존성 그래프에서 edges는 노드 → 의존하는 노드들
// 진입 차수는 "나를 의존하는 노드 수"가 아니라 "내가 의존하는 노드 수"
```

**문제점**: `graph.edges`가 `step → [depends_on steps]` 형태로 정의되어 있다면, 진입 차수 계산 시 역방향 순회 필요

**수정 방안**:
```typescript
// edges: step -> [이 step이 의존하는 step들]
// 그래프를 역방향으로 구성하거나, 계산 로직 변경 필요
interface Graph {
  nodes: Set<string>;
  // depends_on 관계: key가 value에 의존
  dependsOn: Map<string, Set<string>>;  
  // 역방향: key를 의존하는 노드들
  dependedBy: Map<string, Set<string>>; 
}
```

---

**2. 05-dependency-resolver.md - constructCyclePath 함수**

```typescript
// ❌ 현재 - 방향 추적 오류
function constructCyclePath(
  cycleStart: string,
  cycleEnd: string,
  parent: Map<string, string>
): string[] {
  const path: string[] = [cycleStart];
  let current = cycleEnd;
  
  while (current !== cycleStart) {
    path.unshift(current);
    current = parent.get(current)!;  // ⚠️ undefined 가능성
  }
  
  path.push(cycleStart);
  return path;
}
```

**수정 필요**:
```typescript
function constructCyclePath(
  cycleStart: string,
  cycleEnd: string,
  parent: Map<string, string>
): string[] {
  const path: string[] = [cycleStart];
  let current: string | undefined = cycleEnd;
  
  // 안전한 순회
  while (current && current !== cycleStart) {
    path.unshift(current);
    current = parent.get(current);
  }
  
  if (!current) {
    throw new Error('Failed to construct cycle path');
  }
  
  path.push(cycleStart);
  return path;
}
```

---

**3. 07-database-schema.md - DuckDB 특이사항**

```sql
-- ⚠️ DuckDB에서 INTEGER PRIMARY KEY는 SQLite와 다르게 동작
-- AUTO_INCREMENT가 없음

-- ✅ DuckDB 권장 방식
CREATE SEQUENCE projects_id_seq;
CREATE TABLE projects (
    id INTEGER PRIMARY KEY DEFAULT nextval('projects_id_seq'),
    -- ...
);
```

---

### 타입 정의 검토

#### ⚠️ 스펙 간 불일치

**workflow-yaml.md vs dependency-resolver.md**

| 항목 | 03-workflow-yaml.md | 05-dependency-resolver.md |
|------|---------------------|---------------------------|
| 단계 명칭 | `steps` | `steps` (✅ 일치) |
| 단계 타입 | `Step` | `Step` (✅ 일치) |
| 의존성 | `depends_on: string[]` | `depends_on?: string[]` (✅ 일치) |

**✅ 스펙 문서 간 일관성 양호**

---

#### ⚠️ 누락된 타입 정의

**1. 08-agent-definition.md - Example 타입 누락**

```typescript
interface AgentDefinition {
  // ...
  examples?: Example[];  // Example 타입 정의 없음
}

// ✅ 추가 필요
interface Example {
  title?: string;
  input: string;
  output: string;
}
```

**2. 07-database-schema.md - enum 타입 명시 필요**

```typescript
// status 필드들이 string으로만 정의됨
// ✅ union type 명시 권장
type WorkflowRunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
```

---

### 수정 필요 코드 (전체 목록)

| 파일 | 라인(추정) | 이슈 | 심각도 |
|------|-----------|------|--------|
| 05-dependency-resolver.md | kahnSort 함수 | 그래프 방향 오류 | 🔴 High |
| 05-dependency-resolver.md | constructCyclePath | undefined 체크 누락 | 🟡 Medium |
| 07-database-schema.md | CREATE TABLE | DuckDB AUTO INCREMENT 방식 | 🟡 Medium |
| 08-agent-definition.md | AgentDefinition | Example 타입 누락 | 🟢 Low |

---

## 태스크 문서 리뷰

### 의존성 체인 검토

```
TASK-001 (프로젝트 설정)
    │
    ├── TASK-002 (CLI 뼈대)
    │       │
    │       └── TASK-003 (obora init) ←── TASK-005 (YAML 파서)
    │               │
    │               └── TASK-004 (obora new)
    │               │
    │               └── TASK-009 (폴더 구조)
    │
    ├── TASK-005 (YAML 파서)
    │       │
    │       ├── TASK-006 (YAML 검증기)
    │       │       │
    │       │       └── TASK-007 (obora validate)
    │       │
    │       └── TASK-008 (의존성 해석기)
    │
    └── TASK-010 (DuckDB 설정)
```

#### ✅ 의존성 체인 적절성
- 순환 의존성 없음
- 단계별 의존성 명확

#### ⚠️ 개선 권장사항

**1. TASK-006과 TASK-008 중복 로직**

둘 다 순환 의존성 감지 로직을 포함:
- TASK-006: 검증 목적 DFS
- TASK-008: 실행 계획 생성 목적 DFS

**권장**: 공통 모듈로 분리
```
@obora/core
├── graph/
│   ├── cycle-detector.ts   ← 공통
│   └── topological-sort.ts ← 공통
├── validator/
│   └── dependency-validator.ts  ← TASK-006
└── resolver/
    └── dependency-resolver.ts   ← TASK-008
```

**2. TASK-003 → TASK-005 의존성 재검토**

TASK-003(obora init)이 TASK-005(YAML 파서)에 의존하는데, init 단계에서는 YAML 파싱이 필수가 아님. config.yaml 생성만 하면 되므로 의존성 제거 가능.

---

### 테스트 케이스 검토

#### ⚠️ 누락된 테스트 시나리오

**TASK-003 (obora init)**
| 누락 시나리오 | 우선순위 |
|--------------|----------|
| 읽기 전용 디렉토리에서 실행 | High |
| 심볼릭 링크가 있는 디렉토리 | Medium |
| 디스크 공간 부족 시 | Low |

**TASK-004 (obora new)**
| 누락 시나리오 | 우선순위 |
|--------------|----------|
| 빈 문자열 feature name | High |
| 예약어 사용 (e.g., "new", "init") | Medium |
| 매우 긴 이름 (255자 초과) | Medium |

**TASK-008 (의존성 해석기)**
| 누락 시나리오 | 우선순위 |
|--------------|----------|
| 다이아몬드 의존성 | High |
| 자기 자신 참조 | High |
| 존재하지 않는 의존성 참조 | High |

**TASK-010 (DuckDB)**
| 누락 시나리오 | 우선순위 |
|--------------|----------|
| 동시 쓰기 테스트 | High |
| 트랜잭션 롤백 테스트 | Medium |
| 대용량 데이터 (1만 건+) | Low |

---

### 구현 순서 적절성

#### ✅ 현재 순서 (적절)
```
1. TASK-001 → 2. TASK-002 → 3. TASK-005 → 4. TASK-010
     ↓              ↓              ↓
5. TASK-003    6. TASK-006    7. TASK-008
     ↓              ↓
8. TASK-004    9. TASK-007
     ↓
10. TASK-009
```

#### ⚠️ 최적화 권장 순서
```
[Phase 1: 기반]
TASK-001 → TASK-002 → TASK-010

[Phase 2: 파서/검증] (병렬 가능)
TASK-005 → TASK-006 → TASK-008

[Phase 3: CLI 명령어]
TASK-003 → TASK-004 → TASK-007 → TASK-009
```

---

### 스펙 vs 태스크 불일치

**🔴 Critical: TASK-005 타입 정의 불일치**

```typescript
// TASK-005 정의 (태스크 문서)
interface Workflow {
  name: string;
  version: string;
  stages: Stage[];  // ❌ 스펙과 다름
}

// 03-workflow-yaml.md 정의 (스펙 문서)
interface Workflow {
  name: string;
  version?: string;
  mode?: 'auto' | 'supervised' | 'gated';
  config?: WorkflowConfig;
  steps: Step[];  // ✅ 스펙 기준
}
```

**TASK-005의 ExecutionLevel enum도 스펙과 다름:**
```typescript
// TASK-005
enum ExecutionLevel {
  DISCOVERY = 'discovery',
  DEFINITION = 'definition',
  // ... 8개 레벨
}

// 스펙에서는 ExecutionLevel 개념 없음
// 대신 mode (auto/supervised/gated)와 step.gate 사용
```

---

**🔴 Critical: TASK-010 DuckDB 테스트 코드 오류**

```typescript
// ❌ 현재 (SQLite 문법)
const rows = await db.query('SELECT name FROM sqlite_master WHERE type="table"');

// ✅ DuckDB 문법
const rows = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'");
// 또는
const rows = await db.query("SHOW TABLES");
```

---

## 우선 수정 권장 (Top 5)

| 순위 | 대상 | 이슈 | 영향도 |
|------|------|------|--------|
| **1** | TASK-005 | Workflow 타입 정의를 스펙(03-workflow-yaml.md)과 일치시킬 것 | 전체 구현에 영향 |
| **2** | 05-dependency-resolver.md | Kahn's Algorithm 그래프 방향 수정 | 핵심 알고리즘 오류 |
| **3** | TASK-010 | DuckDB 문법으로 테스트 코드 수정 (`sqlite_master` → `information_schema`) | 테스트 실패 예상 |
| **4** | TASK-008 | 다이아몬드/자기참조 테스트 케이스 추가 | 엣지 케이스 누락 |
| **5** | 공통 | TASK-006, TASK-008의 순환 감지 로직을 공통 모듈로 분리 | 코드 중복 방지 |

---

## 부록: 권장 수정 코드

### A. TASK-005 Workflow 타입 수정

```typescript
// packages/core/src/types/workflow.ts

export interface Workflow {
  name: string;
  description?: string;
  version?: string;
  mode?: WorkflowMode;
  config?: WorkflowConfig;
  steps: Step[];
}

export type WorkflowMode = 'auto' | 'supervised' | 'gated';

export interface WorkflowConfig {
  retry?: number;
  retry_delay?: string;  // duration format: "30s", "5m"
  timeout?: string;
  on_failure?: FailureAction[];
}

export interface Step {
  name: string;
  agent: string;
  description?: string;
  optional?: boolean;
  parallel?: boolean;
  gate?: boolean;
  retry?: number;
  retry_delay?: string;
  timeout?: string;
  inputs?: string[];
  outputs?: string[];
  depends_on?: string[];
  on_failure?: FailureAction[];
  env?: Record<string, string>;
}

export interface FailureAction {
  notify?: string;
  snapshot?: boolean;
  pause?: boolean;
  abort?: boolean;
}
```

### B. 의존성 해석기 수정

```typescript
// packages/core/src/graph/dependency-resolver.ts

interface DependencyGraph {
  nodes: Set<string>;
  /** step → [이 step이 의존하는 step들] */
  outEdges: Map<string, Set<string>>;
  /** step → [이 step을 의존하는 step들] */
  inEdges: Map<string, Set<string>>;
}

function buildGraph(steps: Step[]): DependencyGraph {
  const nodes = new Set<string>();
  const outEdges = new Map<string, Set<string>>();
  const inEdges = new Map<string, Set<string>>();
  
  for (const step of steps) {
    nodes.add(step.name);
    outEdges.set(step.name, new Set(step.depends_on || []));
  }
  
  // 역방향 그래프 구성
  for (const [node, deps] of outEdges) {
    for (const dep of deps) {
      if (!inEdges.has(dep)) {
        inEdges.set(dep, new Set());
      }
      inEdges.get(dep)!.add(node);
    }
  }
  
  return { nodes, outEdges, inEdges };
}

function kahnSort(graph: DependencyGraph): string[] {
  const indegree = new Map<string, number>();
  
  // 진입 차수 = 내가 의존하는 노드 수
  for (const node of graph.nodes) {
    indegree.set(node, graph.outEdges.get(node)?.size || 0);
  }
  
  const queue: string[] = [];
  for (const [node, degree] of indegree) {
    if (degree === 0) {
      queue.push(node);
    }
  }
  
  const result: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    
    // 나를 의존하는 노드들의 진입 차수 감소
    const dependents = graph.inEdges.get(node) || new Set();
    for (const dependent of dependents) {
      const newDegree = (indegree.get(dependent) || 1) - 1;
      indegree.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }
  
  if (result.length !== graph.nodes.size) {
    throw new CyclicDependencyError('Circular dependency detected');
  }
  
  return result;
}
```

---

*리뷰 완료: 2026-02-03 20:31 KST*
