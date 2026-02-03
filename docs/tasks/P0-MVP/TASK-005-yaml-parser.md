# TASK-005: YAML 파서 구현

## 개요
- 우선순위: P0
- 예상 소요: 2시간
- 담당: 개발자

## 목표
워크플로우 YAML 파일을 파싱하고 타입 안전하게 처리

## 작업 내용
1. **YAML 라이브러리 설정**
   - `yaml` 또는 `js-yaml` 패키지 선택
   - packages/core에 설치 및 모듈화

2. **타입 정의**
   - `Workflow` 인터페이스 정의
   - `Step` 인터페이스 정의
   - `Dependency` 인터페이스 정의

3. **파서 구현**
   - YAML 파일 읽기
   - YAML → JavaScript 객체 변환
   - 타입 검증 및 캐스팅

4. **워크플로우 파싱**
   - 워크플로우 메타데이터 추출
   - Step 목록 추출
   - 의존성 관계 추출

5. **에러 처리**
   - 잘못된 YAML 문법 처리
   - 필수 필드 누락 처리
   - 타입 불일치 처리

## 완료 조건
- [ ] YAML 파일 → JavaScript 객체 변환
- [ ] 타입 정의 완료
- [ ] 워크플로우 구조 파싱
- [ ] 기본 에러 처리 구현

## 의존성
- TASK-001 (프로젝트 초기 설정)

## 타입 정의 예시
```typescript
interface Workflow {
  name: string;
  version: string;
  description?: string;
  steps: Step[];
}

interface Step {
  name: string;
  agent: string;
  depends_on?: string[];
  inputs?: string[];
  outputs?: string[];
  description?: string;
}
```

## 테스트 케이스

### 정상 케이스

```typescript
describe('WorkflowParser - valid cases', () => {
  it('should parse minimal workflow', () => {
    const yaml = `
name: simple
steps:
  - name: design
    agent: architect
`;
    const workflow = parseWorkflow(yaml);
    expect(workflow.name).toBe('simple');
    expect(workflow.steps).toHaveLength(1);
  });

  it('should parse full workflow with all options', () => {
    const workflow = parseWorkflow(fullWorkflowYaml);
    expect(workflow.mode).toBe('gated');
    expect(workflow.config?.retry).toBe(3);
    expect(workflow.steps[0].timeout).toBe('5m');
  });

  it('should handle implicit dependencies (inputs/outputs)', () => {
    const yaml = `
name: implicit-deps
steps:
  - name: step-a
    agent: architect
    outputs:
      - file-a.md
  - name: step-b
    agent: developer
    inputs:
      - file-a.md
`;
    const workflow = parseWorkflow(yaml);
    const deps = resolveDependencies(workflow);
    expect(deps.get('step-b')).toContain('step-a');
  });
});
```

### 에러 케이스 - YAML 문법

```typescript
describe('WorkflowParser - YAML syntax errors', () => {
  it('should throw E2001 on invalid YAML syntax', () => {
    const yaml = `
name: broken
steps:
  - name: step1
    agent: architect
    inputs:
    - wrong-indent  # 잘못된 들여쓰기
`;
    expect(() => parseWorkflow(yaml)).toThrow('E2001');
  });

  it('should throw E2001 on tabs instead of spaces', () => {
    const yaml = "name: test\n\tsteps: []";  // 탭 사용
    expect(() => parseWorkflow(yaml)).toThrow('E2001');
  });
});
```

### 에러 케이스 - 필수 필드

```typescript
describe('WorkflowParser - missing required fields', () => {
  it('should throw E2002 when name is missing', () => {
    const yaml = `
steps:
  - name: design
    agent: architect
`;
    expect(() => parseWorkflow(yaml)).toThrow('E2002');
  });

  it('should throw E2002 when steps is missing', () => {
    const yaml = `name: no-steps`;
    expect(() => parseWorkflow(yaml)).toThrow('E2002');
  });

  it('should throw E2002 when step.name is missing', () => {
    const yaml = `
name: test
steps:
  - agent: architect
`;
    expect(() => parseWorkflow(yaml)).toThrow('E2002');
  });

  it('should throw E2002 when step.agent is missing', () => {
    const yaml = `
name: test
steps:
  - name: design
`;
    expect(() => parseWorkflow(yaml)).toThrow('E2002');
  });
});
```

### 에러 케이스 - Duration 형식

```typescript
describe('WorkflowParser - invalid duration format', () => {
  it('should throw E2005 on missing unit', () => {
    const yaml = `
name: test
steps:
  - name: design
    agent: architect
    timeout: 30  # 단위 없음
`;
    expect(() => parseWorkflow(yaml)).toThrow('E2005');
  });

  it('should throw E2005 on invalid unit', () => {
    const yaml = `
name: test
steps:
  - name: design
    agent: architect
    timeout: 5min  # 잘못된 단위
`;
    expect(() => parseWorkflow(yaml)).toThrow('E2005');
  });

  it('should throw E2005 on negative duration', () => {
    const yaml = `
name: test
steps:
  - name: design
    agent: architect
    timeout: -5m
`;
    expect(() => parseWorkflow(yaml)).toThrow('E2005');
  });

  it('should throw E2005 on decimal duration', () => {
    const yaml = `
name: test
config:
  retry_delay: 5.5m
steps:
  - name: design
    agent: architect
`;
    expect(() => parseWorkflow(yaml)).toThrow('E2005');
  });
});
```

### 에러 케이스 - 중복 단계 이름

```typescript
describe('WorkflowParser - duplicate step names', () => {
  it('should throw E2006 on duplicate step names', () => {
    const yaml = `
name: test
steps:
  - name: build
    agent: builder
  - name: build
    agent: tester
`;
    expect(() => parseWorkflow(yaml)).toThrow('E2006');
  });
});
```

### 에러 케이스 - Unknown 필드 (strict mode)

```typescript
describe('WorkflowParser - unknown fields', () => {
  it('should throw E2004 on unknown field in strict mode', () => {
    const yaml = `
name: test
unknown_field: value
steps:
  - name: design
    agent: architect
`;
    expect(() => parseWorkflow(yaml, { strict: true })).toThrow('E2004');
  });

  it('should warn but not throw in non-strict mode', () => {
    const warnings: string[] = [];
    const yaml = `
name: test
unknown_field: value
steps:
  - name: design
    agent: architect
`;
    const result = parseWorkflow(yaml, { 
      strict: false,
      onWarning: (w) => warnings.push(w)
    });
    expect(result.name).toBe('test');
    expect(warnings).toContain('E2004');
  });
});
```

### 에러 케이스 - 의존성

```typescript
describe('WorkflowParser - dependency errors', () => {
  it('should throw E3001 on circular dependency', () => {
    const yaml = `
name: circular
steps:
  - name: a
    agent: architect
    depends_on: [c]
  - name: b
    agent: developer
    depends_on: [a]
  - name: c
    agent: tester
    depends_on: [b]
`;
    expect(() => parseWorkflow(yaml)).toThrow('E3001');
  });

  it('should throw E3002 on missing dependency', () => {
    const yaml = `
name: missing-dep
steps:
  - name: build
    agent: builder
    depends_on: [nonexistent]
`;
    expect(() => parseWorkflow(yaml)).toThrow('E3002');
  });

  it('should throw E3003 on self dependency', () => {
    const yaml = `
name: self-dep
steps:
  - name: build
    agent: builder
    depends_on: [build]
`;
    expect(() => parseWorkflow(yaml)).toThrow('E3003');
  });
});
```

### 암묵적 의존성 감지

```typescript
describe('WorkflowParser - implicit dependency detection', () => {
  it('should detect implicit dependency from inputs/outputs', () => {
    const yaml = `
name: implicit
steps:
  - name: design
    agent: architect
    outputs:
      - context/design.md
  - name: implement
    agent: developer
    inputs:
      - context/design.md
`;
    const workflow = parseWorkflow(yaml);
    const deps = resolveDependencies(workflow);
    
    expect(deps.get('implement')).toContain('design');
  });

  it('should throw E3004 on unresolved input', () => {
    const yaml = `
name: unresolved
steps:
  - name: implement
    agent: developer
    inputs:
      - context/design.md  # 아무 단계도 이 파일을 생성하지 않음
`;
    expect(() => parseWorkflow(yaml)).toThrow('E3004');
  });

  it('should not throw when input is optional spec file', () => {
    const yaml = `
name: spec-input
steps:
  - name: design
    agent: architect
    inputs:
      - proposal.md  # 스펙 파일은 예외
`;
    expect(() => parseWorkflow(yaml)).not.toThrow();
  });
});
```

## 참고 자료
- [js-yaml 공식 문서](https://github.com/nodeca/js-yaml)
- [TypeScript 인터페이스 가이드](https://www.typescriptlang.org/docs/handbook/interfaces.html)
- [YAML 1.2 스펙](https://yaml.org/spec/1.2/spec.html)
