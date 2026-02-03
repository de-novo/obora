# TASK-001: 프로젝트 초기 설정

## 개요
- 우선순위: P0
- 예상 소요: 2시간
- 담당: 개발자

## 목표
monorepo 구조 설정 및 기본 패키지 생성

## 작업 내용
1. pnpm workspace 설정
2. packages/cli 생성
3. packages/core 생성
4. packages/database 생성
5. TypeScript 설정
6. ESLint/Prettier 설정

## 완료 조건
- [ ] pnpm install 성공
- [ ] pnpm build 성공
- [ ] 기본 테스트 통과

## 의존성
없음 (첫 태스크)

## 테스트 케이스
```bash
# Workspace 설정 확인
cat pnpm-workspace.yaml | grep -E "cli|core|database"

# 각 패키지 존재 확인
ls -la packages/cli/
ls -la packages/core/
ls -la packages/database/

# TypeScript 설정 확인
cat packages/core/tsconfig.json

# 빌드 테스트
pnpm build
```

## 참고 자료
- [pnpm Workspace 공식 문서](https://pnpm.io/workspaces)
- [TypeScript 프로젝트 설정](https://www.typescriptlang.org/docs/handbook/project-config.html)
- [ESLint + Prettier 설정 가이드](https://eslint.org/docs/latest/use/configure/configuration-files)
