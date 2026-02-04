# TASK-015: @obora/core 유닛 테스트

## 개요
- 우선순위: P0
- 예상 소요: 7시간
- 담당: 개발자

## 목표
@obora/core 패키지의 핵심 모듈에 대한 유닛 테스트 작성

## 작업 내용

### 1. 테스트 환경 설정
- vitest.config.ts 생성 (packages/core/)
- 테스트 스크립트 추가 (package.json)

### 2. workflow-validator.ts 테스트
**실제 함수:**
- `validateWorkflow(workflow: Workflow): ValidationResult`
- `parseAndValidate(yamlContent: string): ValidationResult`
- `validateSchema(workflow: unknown): ValidationError[]`
- `validateCircularDependencies(steps: Step[]): ValidationError[]`
- `validateSelfReferences(steps: Step[]): ValidationError[]`
- `validateMissingReferences(steps: Step[]): ValidationError[]`
- `validateInputs(steps: Step[]): ValidationError[]`

**테스트 케이스:**
- 유효한 워크플로우 검증 통과
- 필수 필드 누락 감지 (`name`, `steps`)
- mode enum 검증 ("auto", "supervised", "gated", "manual")
- 중복 스텝 이름 감지
- 순환 의존성 감지
- 자기 참조 의존성 감지
- 누락된 의존성 스텝 감지
- 해결되지 않은 입력 파일 경고

### 3. graph/index.ts 테스트
**실제 exports:**
- `buildGraph(steps: Step[]): Graph`
- `detectCycles(graph: Graph): CycleResult`
- `topologicalSort(graph: Graph): TopologicalResult`
- `computeLevels(graph: Graph): Map<string, number>`
- `groupByLevel(steps: Step[]): Map<number, Step[]>`

**테스트 케이스:**
- 빈 그래프 처리
- 단일 노드 그래프
- Kahn's Algorithm 정렬 검증
- DFS 사이클 탐지
- 복잡한 의존성 그래프
- 암시적 의존성 (inputs/outputs)
- 실행 레벨 계산
- 레벨별 스텝 그룹화

### 4. resolver/dependency-resolver.ts 테스트
**실제 함수:**
- `buildDependencyGraph(steps: Step[]): DependencyGraph`
- `resolveTopologicalOrder(steps: Step[]): string[] | null`
- `detectCyclesDFS(steps: Step[]): CycleResult`
- `calculateExecutionLevels(steps: Step[]): Map<string, number>`
- `groupStepsByLevel(steps: Step[]): StepGroup[]`
- `generateExecutionPlan(workflow: Workflow): ExecutionPlan`
- `getNextSteps(workflow: Workflow, completedSteps: Set<string>): Step[]`
- `validateExecutionOrder(workflow: Workflow, order: string[]): { valid: boolean; errors: string[] }`

**테스트 케이스:**
- 의존성 그래프 빌드
- 위상 정렬 순서 검증
- 순환 의존성 에러 처리
- 실행 계획 생성
- 다음 실행 가능 스텝 계산
- 실행 순서 검증

### 5. parser/workflow-parser.ts 테스트
**실제 함수:**
- `parseWorkflow(yamlContent: string, options: ParserOptions = {}): Workflow`
- `resolveDependencies(workflow: Workflow): DependencyMap`

**ParserOptions:**
```typescript
interface ParserOptions {
  strict?: boolean;
  onWarning?: (warning: string) => void;
}
```

**테스트 케이스:**
- YAML 파싱 성공
- 필수 필드 누락 에러
- 잘못된 YAML 구조 에러
- mode enum 검증
- duration 형식 검증 (e.g., "5s", "1m", "2h", "1d")
- strict 모드에서 알 수 없는 필드 거부
- onWarning 콜백 호출
- 중복 스텝 이름 에러
- 자기 의존성 에러
- 누락된 의존성 에러
- 순환 의존성 에러
- 암시적 의존성 해결 (inputs/outputs)

## Mock 전략

### Vitest Mock 패턴

```typescript
// 함수 mocking
import { vi } from 'vitest';

vi.mock('fs-extra', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// 스파이 등록
const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

// 테스트 후 cleanup
consoleSpy.mockRestore();

// 실행 횟수 확인
expect(consoleSpy).toHaveBeenCalledTimes(2);
expect(consoleSpy).toHaveBeenCalledWith('Expected message');

// 콜백 인자 확인
expect(consoleSpy).toHaveBeenCalledWith(
  expect.stringContaining('workflow'),
  expect.any(Number)
);
```

### Console 캡처 패턴

```typescript
describe('output capture', () => {
  it('should capture console.log output', () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });

    // 테스트 실행
    logFunction();

    logSpy.mockRestore();
    expect(logs).toContain('expected output');
  });
});
```

## 완료 조건
- [ ] 테스트 커버리지 80% 이상
- [ ] pnpm test 성공
- [ ] 모든 엣지 케이스 커버

## 의존성
- TASK-005 (yaml-parser)
- TASK-006 (yaml-validator)
- TASK-008 (dependency-resolver)

## 테스트 데이터 예시

### 유효한 워크플로우 YAML
```yaml
name: test-workflow
version: "1.0"
description: Test workflow for validation
mode: auto
config:
  retry: 3
  retry_delay: 5s
  continue_on_error: false
  max_parallel: 2
steps:
  - name: plan
    agent: architect
    description: Plan the implementation
    timeout: 30m
    outputs:
      - design.md

  - name: implement
    agent: coder
    depends_on:
      - plan
    inputs:
      - design.md
    outputs:
      - code.ts
    timeout: 1h

  - name: test
    agent: tester
    depends_on:
      - implement
    inputs:
      - code.ts
    timeout: 15m
```

### 순환 의존성 예시
```yaml
name: cyclic-workflow
steps:
  - name: step-a
    agent: agent-a
    depends_on:
      - step-c

  - name: step-b
    agent: agent-b
    depends_on:
      - step-a

  - name: step-c
    agent: agent-c
    depends_on:
      - step-b
```

### 테스트 파일 구조
```
packages/core/
├── src/
│   ├── validator/
│   │   └── workflow-validator.ts
│   ├── graph/
│   │   └── index.ts
│   ├── resolver/
│   │   └── dependency-resolver.ts
│   └── parser/
│       └── workflow-parser.ts
└── test/
    ├── validator/
    │   └── workflow-validator.test.ts
    ├── graph/
    │   └── index.test.ts
    ├── resolver/
    │   └── dependency-resolver.test.ts
    └── parser/
        └── workflow-parser.test.ts
```

## 테스트 케이스 예시
```typescript
import { describe, it, expect } from 'vitest';
import { validateWorkflow, parseAndValidate } from '../validator/workflow-validator';
import type { Workflow } from '../types/workflow';

describe('workflow-validator', () => {
  const validWorkflow: Workflow = {
    name: 'test-workflow',
    mode: 'auto',
    steps: [
      {
        name: 'plan',
        agent: 'architect',
        description: 'Plan the implementation',
      },
      {
        name: 'implement',
        agent: 'coder',
        depends_on: ['plan'],
        inputs: ['design.md'],
        outputs: ['code.ts'],
      },
    ],
  };

  it('should accept valid workflow', () => {
    const result = validateWorkflow(validWorkflow);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect circular dependencies', () => {
    const cyclicWorkflow: Workflow = {
      name: 'cyclic-workflow',
      steps: [
        {
          name: 'step-a',
          agent: 'agent-a',
          depends_on: ['step-c'],
        },
        {
          name: 'step-b',
          agent: 'agent-b',
          depends_on: ['step-a'],
        },
        {
          name: 'step-c',
          agent: 'agent-c',
          depends_on: ['step-b'],
        },
      ],
    };

    const result = validateWorkflow(cyclicWorkflow);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'CIRCULAR_DEPENDENCY',
      })
    );
  });

  it('should detect missing references', () => {
    const workflowWithMissingRef: Workflow = {
      name: 'test-workflow',
      steps: [
        {
          name: 'plan',
          agent: 'architect',
        },
        {
          name: 'implement',
          agent: 'coder',
          depends_on: ['non-existent-step'],
        },
      ],
    };

    const result = validateWorkflow(workflowWithMissingRef);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'MISSING_REFERENCE',
      })
    );
  });

  it('should parse and validate YAML', () => {
    const yaml = `
name: test-workflow
mode: auto
steps:
  - name: plan
    agent: architect
`;

    const result = parseAndValidate(yaml);
    expect(result.isValid).toBe(true);
  });

  it('should reject invalid mode', () => {
    const invalidWorkflow: Workflow = {
      name: 'test-workflow',
      mode: 'invalid' as any,
      steps: [{ name: 'plan', agent: 'architect' }],
    };

    const result = validateWorkflow(invalidWorkflow);
    expect(result.isValid).toBe(false);
  });
});

describe('graph/index', () => {
  it('should detect cycles in graph', () => {
    const steps = [
      { name: 'a', agent: 'agent-a', depends_on: ['c'] },
      { name: 'b', agent: 'agent-b', depends_on: ['a'] },
      { name: 'c', agent: 'agent-c', depends_on: ['b'] },
    ];

    const { detectCycles, buildGraph } = require('../graph/index');
    const graph = buildGraph(steps);
    const result = detectCycles(graph);

    expect(result.hasCycle).toBe(true);
    expect(result.cyclePath).toBeDefined();
  });

  it('should topological sort graph', () => {
    const steps = [
      { name: 'plan', agent: 'architect' },
      { name: 'implement', agent: 'coder', depends_on: ['plan'] },
      { name: 'test', agent: 'tester', depends_on: ['implement'] },
    ];

    const { topologicalSort, buildGraph } = require('../graph/index');
    const graph = buildGraph(steps);
    const result = topologicalSort(graph);

    expect(result.success).toBe(true);
    expect(result.order).toEqual(['plan', 'implement', 'test']);
  });
});
```

## 엣지 케이스 목록

### workflow-validator.ts
1. 빈 steps 배열
2. 동일한 outputs를 여러 스텝에서 생성
3. 스텝 이름에 특수문자 포함
4. mode가 undefined일 때 처리
5. config 객체의 일부 필드만 존재
6. timeout 형식이 잘못된 경우 (예: "0s", "abc", "5.5s")
7. agent 이름이 빈 문자열

### graph/index.ts
1. 모든 스텝이 동일 레벨 (의존성 없음)
2. 의존성 체인이 매우 깊은 경우
3. 하나의 스텝이 여러 스텝에 의존
4. inputs/outputs만으로 의존성 형성 (암시적 의존성)

### parser/workflow-parser.ts
1. YAML 주석 처리
2. 빈 값 (null, empty string)
3. 중첩된 config 객체
4. spec 파일만 inputs에 있을 때 (proposal.md, design.md 등)
5. onWarning 콜백이 없을 때 경고 처리

## 참고 자료
- [Vitest 공식 문서](https://vitest.dev/)
- [Vitest Mocking 가이드](https://vitest.dev/guide/mocking.html)
- SPEC-005-yaml-schema.md
- SPEC-006-workflow-validation.md
