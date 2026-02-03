# TASK-002: CLI 뼈대 구현

## 개요
- 우선순위: P0
- 예상 소요: 1.5시간
- 담당: 개발자

## 목표
CLI 프레임워크 설정 및 기본 명령어 구조 구현

## 작업 내용
1. **CLI 프레임워크 선택 및 설치**
   - Commander.js 또는 yargs 중 하나 선택
   - packages/cli에 패키지 설치

2. **기본 명령어 구조 설정**
   - 루트 명령어 `obora` 등록
   - 서브커맨드 체계 정의

3. **필수 명령어 구현**
   - `--help` 명령어 (자동 생성)
   - `--version` 명령어 (package.json 버전 참조)

4. **진입점(entry point) 설정**
   - `bin/obora` 파일 생성
   - shebang 및 실행 권한 설정

5. **NPM 패키지 설정**
   - bin 필드 추가
   - files 필드 설정

## 완료 조건
- [ ] `obora --help` 실행 시 도움말 출력
- [ ] `obora --version` 실행 시 버전 출력
- [ ] 전역 설치 후 `obora` 명령어 실행 가능
- [ ] 기본 명령어 프레임워크 테스트 통과

## 의존성
- TASK-001 (프로젝트 초기 설정)

## 테스트 케이스
```bash
# 로컬 개발 환경에서 테스트
pnpm --filter @obora-kit/cli run --help
pnpm --filter @obora-kit/cli run --version

# 전역 설치 테스트
pnpm --filter @obora-kit/cli install -g
obora --help
obora --version
```

## 참고 자료
- [Commander.js 공식 문서](https://github.com/tj/commander.js)
- [yargs 공식 문서](https://yargs.js.org/)
- [NPM bin 필드 가이드](https://docs.npmjs.com/cli/v9/configuring-npm/package-json#bin)
