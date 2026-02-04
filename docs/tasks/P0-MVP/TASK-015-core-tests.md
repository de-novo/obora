# TASK-015: @obora/core 유닛 테스트

## 개요
- 우선순위: P0
- 예상 소요: 4시간
- 담당: 개발자

## 목표
@obora/core 패키지의 핵심 모듈에 대한 유닛 테스트 작성

## 작업 내용

### 1. 테스트 환경 설정
- vitest.config.ts 생성 (packages/core/)
- 테스트 스크립트 추가 (package.json)

### 2. workflow-validator.ts 테스트
- 유효한 워크플로우 검증 통과
- 잘못된 YAML 구조 거부
- 필수 필드 누락 감지
- mode enum 검증 ("auto", "supervised", "gated", "manual")
- 중복 ID 감지
- 순환 의존성 감지

### 3. graph/index.ts 테스트
- Kahn's Algorithm 정렬 검증
- DFS 사이클 탐지
- 빈 그래프 처리
- 단일 노드 그래프
- 복잡한 의존성 그래프

### 4. resolver/dependency-resolver.ts 테스트
- 의존성 해결 순서 검증
- 순환 의존성 에러 처리
- 누락된 의존성 감지

### 5. parser/workflow-parser.ts 테스트
- YAML 파싱 성공
- 잘못된 YAML 에러 처리
- 스키마 검증

## 완료 조건
- [ ] 테스트 커버리지 80% 이상
- [ ] pnpm test 성공
- [ ] 모든 엣지 케이스 커버

## 의존성
- TASK-005 (yaml-parser)
- TASK-006 (yaml-validator)
- TASK-008 (dependency-resolver)

## 테스트 케이스 예시
```typescript
import { describe, it, expect } from 'vitest';
import { validateWorkflow } from '../validator/workflow-validator';

describe('workflow-validator', () => {
  it('should accept valid workflow', () => {
    const workflow = { id: 'test', mode: 'auto', features: [] };
    expect(() => validateWorkflow(workflow)).not.toThrow();
  });

  it('should reject invalid mode', () => {
    const workflow = { id: 'test', mode: 'invalid', features: [] };
    expect(() => validateWorkflow(workflow)).toThrow();
  });
});
```

## 참고 자료
- [Vitest 공식 문서](https://vitest.dev/)
- SPEC-005-yaml-schema.md
- SPEC-006-workflow-validation.md
