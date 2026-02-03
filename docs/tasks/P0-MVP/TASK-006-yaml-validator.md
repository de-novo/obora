# TASK-006: YAML 검증기 구현

## 개요
- 우선순위: P0
- 예상 소요: 2.5시간
- 담당: 개발자

## 목표
워크플로우 YAML 파일의 구조적/논리적 유효성 검증

## 작업 내용
1. **JSON Schema 정의**
   - 워크플로우 스키마 정의 (`workflow.schema.json`)
   - Step 스키마 정의
   - 태스크 스키마 정의

2. **JSON Schema 검증 구현**
   - `ajv` (Another JSON Schema Validator) 패키지 설치
   - 스키마 로드 및 컴파일
   - YAML → JSON 변환 후 검증

3. **순환 의존성 검출**
   - 의존성 그래프 구성
   - DFS (Depth-First Search) 순환 감지
   - 순환 경로 추적
   - **공통 모듈 사용**: `@obora/core/graph`의 `detectCycles()` 함수 활용

4. **참조 무결성 검사**
   - 존재하지 않는 태스크 참조 검사
   - 자기 참조(자기 자신을 의존성으로 지정) 검사
   - 동일 Step 내 참조 제한 검사

5. **에러 메시지 포맷팅**
   - 사용자 친화적인 에러 메시지
   - 라인 번호 및 파일 위치 표시
   - 수정 제안 포함

6. **검증 결과 모델**
   - `ValidationResult` 인터페이스 정의
   - `ValidationError` 클래스 정의
   - 경고(warning)와 에러(error) 구분

## 완료 조건
- [ ] JSON Schema 검증 통과/실패
- [ ] 순환 의존성 감지
- [ ] 참조 무결성 검사
- [ ] 상세한 에러 메시지 출력

## 의존성
- TASK-001 (프로젝트 초기 설정)
- TASK-005 (YAML 파서)

## 타입 정의 예시
```typescript
interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

interface ValidationError {
  code: string;
  message: string;
  path: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

enum ErrorCode {
  INVALID_SCHEMA = 'INVALID_SCHEMA',
  CIRCULAR_DEPENDENCY = 'CIRCULAR_DEPENDENCY',
  MISSING_REFERENCE = 'MISSING_REFERENCE',
  SELF_REFERENCE = 'SELF_REFERENCE',
  INVALID_EXECUTION_LEVEL = 'INVALID_EXECUTION_LEVEL'
}
```

## 테스트 케이스
```typescript
// 유효한 워크플로우
const result = validateWorkflow(validWorkflow);
expect(result.isValid).toBe(true);

// 순환 의존성
const circular = validateWorkflow(circularWorkflow);
expect(circular.isValid).toBe(false);
expect(circular.errors[0].code).toBe(ErrorCode.CIRCULAR_DEPENDENCY);

// 존재하지 않는 참조
const missingRef = validateWorkflow(missingRefWorkflow);
expect(missingRef.errors).toContainEqual(
  expect.objectContaining({ code: ErrorCode.MISSING_REFERENCE })
);
```

## 공통 모듈: @obora/core/graph

순환 감지 로직은 TASK-006(YAML 검증기)과 TASK-008(의존성 해석기)에서 공통으로 사용됩니다.
중복을 방지하기 위해 `@obora/core/graph` 모듈에 구현합니다.

### 모듈 위치
- **패키지 경로**: `packages/core/src/graph/`

### 내보내는 함수
- `detectCycles(graph: Graph): CycleResult` - 순환 의존성 감지
- `topologicalSort(graph: Graph): string[] | null` - 위상 정렬
- `computeLevels(graph: Graph): Map<string, number>` - 실행 레벨 계산

```typescript
// packages/core/src/graph/index.ts
export interface Graph {
  nodes: Set<string>;
  edges: Map<string, Set<string>>;
}

export interface CycleResult {
  hasCycle: boolean;
  cyclePath?: string[];
}

export function detectCycles(graph: Graph): CycleResult;
export function topologicalSort(graph: Graph): string[] | null;
export function computeLevels(graph: Graph): Map<string, number>;
export function buildGraph(steps: Step[]): Graph;
```

## 참고 자료
- [Ajv 공식 문서](https://ajv.js.org/)
- [JSON Schema 스펙](https://json-schema.org/)
- [DFS 알고리즘](https://en.wikipedia.org/wiki/Depth-first_search)
- [위상 정렬 (Kahn's Algorithm)](https://en.wikipedia.org/wiki/Topological_sorting#Kahn's_algorithm)
