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
```typescript
// 유효한 워크플로우 파싱
const workflow = parseWorkflow(workflowPath);
expect(workflow.steps).toHaveLength(3);
expect(workflow.steps[0].agent).toBe('architect');

// 잘못된 YAML 문법
expect(() => parseWorkflow(invalidYamlPath)).toThrow();

// 필수 필드 누락
expect(() => parseWorkflow(missingFieldPath)).toThrow();
```

## 참고 자료
- [js-yaml 공식 문서](https://github.com/nodeca/js-yaml)
- [TypeScript 인터페이스 가이드](https://www.typescriptlang.org/docs/handbook/interfaces.html)
- [YAML 1.2 스펙](https://yaml.org/spec/1.2/spec.html)
