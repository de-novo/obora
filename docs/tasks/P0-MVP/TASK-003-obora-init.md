# TASK-003: obora init 명령어 구현

## 개요
- 우선순위: P0
- 예상 소요: 2시간
- 담당: 개발자

## 목표
프로젝트 초기화 명령어를 통해 `.obora/` 구조 생성

## 작업 내용
1. **명령어 인터페이스 구현**
   - `obora init [options]` 명령어 등록
   - `--force`, `-f` 옵션 (기존 `.obora/` 덮어쓰기)
   - `--workflow`, `-w` 옵션 (기본 워크플로우 선택: simple/standard)
   - `--minimal`, `-m` 옵션 (최소 설정으로 초기화)
   - 참조: [[spec/02-cli-commands.md#obora init]]

2. **폴더 구조 생성**
   - `.obora/` 폴더 생성
   - `.obora/workflows/` 폴더 생성
   - `.obora/features/` 폴더 생성
   - `.obora/archive/` 폴더 생성

3. **설정 파일 생성**
   - `config.yaml` 생성 (기본 설정)
   - 프로젝트 메타데이터 입력 (대화형 옵션)

4. **기본 워크플로우 복사**
   - `workflows/`에서 기본 템플릿 복사
   - 워크플로우 유효성 검증

5. **에러 처리**
   - 이미 `.obora/`가 존재할 때 처리
   - 권한 문제 처리
   - 유효하지 않은 프로젝트 경로 처리

## 완료 조건
- [ ] `obora init` 실행 시 `.obora/` 폴더 생성
- [ ] `config.yaml` 생성 및 기본값 설정
- [ ] 기본 워크플로우 파일 복사
- [ ] 중복 실행 시 경고 메시지 출력 (`--force` 시 덮어쓰기)

## 의존성
- TASK-001 (프로젝트 초기 설정)
- TASK-002 (CLI 뼈대 구현)

> **Note**: `obora init`은 YAML 파서(TASK-005)에 의존하지 않습니다.
> config.yaml은 단순 텍스트 템플릿으로 생성되며, 파싱은 이후 명령어(run, validate 등)에서 수행됩니다.

## 테스트 케이스
```bash
# 기본 초기화
obora init
ls -la .obora/
cat .obora/config.yaml

# 강제 초기화 (기존 설정 덮어쓰기)
obora init --force

# 워크플로우 지정
obora init --workflow standard

# 최소 설정으로 초기화 (Brownfield)
obora init --minimal

# 조합 사용
obora init --workflow standard --force

# 에러 케이스
obora init           # 이미 존재할 때 → 에러 코드 2
obora init --force   # 강제 덮어쓰기 → 성공
```

## 종료 코드
| 코드 | 의미 |
|------|------|
| 0 | 성공 |
| 1 | 일반 에러 |
| 2 | 이미 초기화됨 (`--force` 없이)

## 참고 자료
- [Commander.js 옵션 처리](https://github.com/tj/commander.js#options)
- [inquirer.js (대화형 CLI)](https://github.com/SBoudrias/Inquirer.js)
- [fs-extra 파일 시스템 유틸리티](https://github.com/jprichardson/node-fs-extra)
