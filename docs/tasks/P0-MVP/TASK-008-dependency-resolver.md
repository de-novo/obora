# TASK-008: 의존성 해석기 구현

## 개요
- 우선순위: P0
- 예상 소요: 3시간
- 담당: 개발자

## 목표
워크플로우 Step 간 의존성을 해석하여 실행 순서 결정

## 작업 내용
1. **의존성 그래프 구성**
   - Step → 의존성 관계 매핑
   - 방향 그래프(directed graph) 표현
   - 인접 리스트(adjacency list) 구현

2. **Kahn's Algorithm 구현**
   - 진입 차수(indegree) 계산
   - 큐를 사용한 위상 정렬
   - 실행 순서 리스트 생성

3. **DFS 순환 감지**
   - 깊이 우선 탐색 구현
   - 방문 상태 추적 (unvisited, visiting, visited)
   - 순환 경로 백트래킹 및 기록
   - **공통 모듈 사용**: `@obora/core/graph`의 `detectCycles()` 함수 활용

4. **ExecutionLevel 계산**
   - 각 Step의 실행 레벨 계산
   - 레벨별 Step 그룹화
   - 병렬 실행 가능성 분석

5. **결과 모델**
   - `DependencyGraph` 인터페이스 정의
   - `ExecutionPlan` 인터페이스 정의
   - `StepGroup` 인터페이스 정의

## 완료 조건
- [ ] 의존성 그래프 구성
- [ ] Kahn's Algorithm으로 위상 정렬
- [ ] DFS로 순환 의존성 감지 (`@obora/core/graph` 사용)
- [ ] ExecutionLevel별 Step 그룹화

## 의존성
- TASK-001 (프로젝트 초기 설정)
- TASK-005 (YAML 파서)

## 타입 정의 예시
```typescript
interface DependencyGraph {
  nodes: Map<string, Step>;
  edges: Map<string, string[]>;  // step -> [dependencies]
}

interface ExecutionPlan {
  isValid: boolean;
  executionOrder: string[];
  cyclicPath?: string[];
  stepGroups: StepGroup[];
}

interface StepGroup {
  level: number;
  steps: Step[];
  parallelizable: boolean;
}

interface Step {
  name: string;
  agent: string;
  depends_on?: string[];
  inputs?: string[];
  outputs?: string[];
}
```

## 알고리즘 구현

### Kahn's Algorithm (위상 정렬)
```typescript
function topologicalSort(steps: Step[]): string[] | null {
  const graph = buildGraph(steps);
  const indegree = new Map<string, number>();
  const queue: string[] = [];
  const order: string[] = [];

  // 진입 차수 초기화 (모든 노드를 0으로)
  for (const node of graph.nodes) {
    indegree.set(node, 0);
  }

  // 진입 차수 계산 (inputs/outputs 기반 암묵적 의존성 포함)
  for (const step of steps) {
    let inDegreeCount = 0;
    for (const otherStep of steps) {
      if (otherStep.outputs?.some(out => step.inputs?.includes(out))) {
        inDegreeCount++;
      }
    }
    // depends_on 명시적 의존성도 추가
    inDegreeCount += (step.depends_on?.length || 0);
    indegree.set(step.name, inDegreeCount);
  }

  // indegree=0인 노드로 큐 초기화
  for (const [node, degree] of indegree) {
    if (degree === 0) {
      queue.push(node);
    }
  }

  // BFS
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    // 현재 노드를 의존하는 노드들의 indegree 감소
    for (const step of steps) {
      const dependsOnCurrent = step.depends_on?.includes(current);
      const inputsFromCurrent = steps
        .find(s => s.name === current)
        ?.outputs?.some(out => step.inputs?.includes(out));
      
      if (dependsOnCurrent || inputsFromCurrent) {
        const newDegree = (indegree.get(step.name) || 1) - 1;
        indegree.set(step.name, newDegree);
        if (newDegree === 0) {
          queue.push(step.name);
        }
      }
    }
  }

  // 순환 확인
  if (order.length !== steps.length) {
    return null; // 순환 존재
  }

  return order;
}
```

### DFS 순환 감지 (공통 모듈 사용)
```typescript
// @obora/core/graph 모듈에서 import
// 모듈 위치: packages/core/src/graph/
import {
  detectCycles,
  topologicalSort,
  computeLevels,
  CycleResult
} from '@obora/core/graph';

function checkCycles(steps: Step[]): CycleResult {
  const graph = buildGraph(steps);
  return detectCycles(graph);
}

function getExecutionPlan(steps: Step[]): ExecutionPlan {
  const graph = buildGraph(steps);

  // 순환 감지
  const cycleResult = detectCycles(graph);
  if (cycleResult.hasCycle) {
    return {
      isValid: false,
      executionOrder: [],
      cyclicPath: cycleResult.cyclePath,
      stepGroups: []
    };
  }

  // 위상 정렬 (공통 모듈 사용)
  const executionOrder = topologicalSort(graph) || [];

  // 실행 레벨 계산 (공통 모듈 사용)
  const levels = computeLevels(graph);
  const stepGroups = groupByLevel(steps, levels);

  return {
    isValid: true,
    executionOrder,
    stepGroups
  };
}
```

## 테스트 케이스
```typescript
// 선형 의존성
const linear = [
  { name: 'step-a', agent: 'architect' },
  { name: 'step-b', agent: 'developer', depends_on: ['step-a'] },
  { name: 'step-c', agent: 'tester', depends_on: ['step-b'] }
];
const plan1 = resolveDependencies(linear);
expect(plan1.executionOrder).toEqual(['step-a', 'step-b', 'step-c']);

// 분기 의존성
const branched = [
  { name: 'step-a', agent: 'architect' },
  { name: 'step-b', agent: 'developer', depends_on: ['step-a'] },
  { name: 'step-c', agent: 'developer', depends_on: ['step-a'] },
  { name: 'step-d', agent: 'tester', depends_on: ['step-b', 'step-c'] }
];
const plan2 = resolveDependencies(branched);
expect(plan2.stepGroups[1].parallelizable).toBe(true);

// 순환 의존성
const circular = [
  { name: 'step-a', agent: 'architect', depends_on: ['step-c'] },
  { name: 'step-b', agent: 'developer', depends_on: ['step-a'] },
  { name: 'step-c', agent: 'tester', depends_on: ['step-b'] }
];
const plan3 = resolveDependencies(circular);
expect(plan3.isValid).toBe(false);
expect(plan3.cyclicPath).toBeDefined();
```

## 참고 자료
- [위상 정렬 - 위키백과](https://ko.wikipedia.org/wiki/%EC%9C%84%EC%83%81_%EC%A0%95%EB%A0%AC)
- [Kahn's Algorithm 설명](https://en.wikipedia.org/wiki/Topological_sorting#Kahn's_algorithm)
- [DFS 순환 감지](https://en.wikipedia.org/wiki/Depth-first_search#Detecting_cycles)
