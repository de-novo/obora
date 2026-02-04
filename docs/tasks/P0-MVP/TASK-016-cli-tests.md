# TASK-016: @obora/cli 유닛 테스트

## 개요
- 우선순위: P0
- 예상 소요: 6시간
- 담당: 개발자

## 목표
@obora/cli 패키지의 모든 커맨드에 대한 유닛 테스트 작성

## 작업 내용

### 1. 테스트 환경 설정
- vitest.config.ts 생성 (packages/cli/)
- 테스트 헬퍼 함수 작성 (mock fs, mock console)

### 2. init.ts 테스트
- 새 프로젝트 초기화 성공
- 이미 존재하는 프로젝트 에러
- --force 옵션으로 덮어쓰기
- 잘못된 프로젝트 이름 거부

### 3. validate.ts 테스트
- 유효한 워크플로우 통과
- 잘못된 워크플로우 에러
- 파일 없음 에러
- --format json 출력

### 4. status.ts 테스트
- 상태 조회 성공
- .obora 폴더 없음 에러
- --verbose 상세 출력
- --format json 출력

### 5. new.ts 테스트
- 새 피처 생성 성공
- 중복 피처 이름 에러
- 의존성 검증

### 6. done.ts 테스트
- 피처 완료 처리
- 존재하지 않는 피처 에러
- 의존성 미완료 경고

### 7. plan.ts 테스트
- 실행 계획 생성
- AI 플래그 처리 (mock)

### 8. run.ts 테스트
- 워크플로우 실행
- 에이전트 실행 (mock)
- 에러 처리

## 완료 조건
- [ ] 테스트 커버리지 70% 이상
- [ ] 모든 커맨드 테스트 작성
- [ ] CLIError 패턴 테스트

## 의존성
- TASK-015 (core-tests)
- TASK-003 ~ TASK-014 (모든 CLI 구현)

## 테스트 케이스 예시
```typescript
import { describe, it, expect, vi } from 'vitest';
import { initCommand } from '../commands/init';

describe('init command', () => {
  it('should create .obora directory', async () => {
    const mockFs = vi.mock('fs/promises');
    await initCommand({ name: 'test-project' });
    expect(mockFs.mkdir).toHaveBeenCalledWith('.obora');
  });
});
```

## 참고 자료
- [Vitest Mocking](https://vitest.dev/guide/mocking.html)
- SPEC-003-cli-interface.md
