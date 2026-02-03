# TASK-004: obora new 명령어 구현

## 개요
- 우선순위: P0
- 예상 소요: 2.5시간
- 담당: 개발자

## 목표
새로운 피처(feature) 생성 명령어 구현

## 작업 내용
1. **명령어 인터페이스 구현**
   - `obora new <feature-name> [options]` 명령어 등록
   - `--workflow`, `-w` 옵션 (사용할 워크플로우 지정)
   - `--from-existing` 옵션 (기존 문서에서 시작, Brownfield)
   - `--template`, `-t` 옵션 (템플릿 선택)
   - 참조: [[spec/02-cli-commands.md#obora new]]

2. **피처 폴더 구조 생성**
   - `.obora/features/<name>/` 폴더 생성
   - `proposal.md` 파일 생성 (기획서)
   - `design.md` 파일 생성 (설계서)
   - `tasks.md` 파일 생성 (작업 목록)
   - `context/` 폴더 생성 (에이전트 출력용)

3. **템플릿 파일 생성**
   - `proposal.md` 템플릿 적용
   - `design.md` 템플릿 적용
   - 템플릿 내에 메타데이터 자동 채움 (이름, 날짜, 타입)

4. **상태 추적 초기화**
   - `.obora/features/<name>/status.yaml` 생성
   - 초기 상태: `proposed`

5. **유효성 검사** (참조: [[spec/10-error-codes.md]])
   - 피처 이름 형식 검증:
     - 허용 문자: `[a-z0-9-]` (소문자, 숫자, 하이픈)
     - 최대 길이: 64자
     - 시작/끝 문자: 영소문자 또는 숫자 (하이픈 불가)
     - 연속 하이픈 불가 (`--`)
   - 예약어 금지: `init`, `new`, `plan`, `run`, `status`, `done`, `validate`, `lock`, `config`
   - 중복 피처 이름 검사 (.obora/features/ 내 존재 여부)
   - 아카이브된 피처와 이름 충돌 경고 (에러 아님)

## 완료 조건
- [ ] `obora new my-feature` 실행 시 폴더 구조 생성
- [ ] `proposal.md` 템플릿 생성 (기획서)
- [ ] `design.md` 템플릿 생성 (설계서)
- [ ] `tasks.md` 템플릿 생성 (작업 목록)
- [ ] `context/` 폴더 생성 (에이전트 출력용)
- [ ] `status.yaml` 생성 및 초기 상태 설정
- [ ] 중복 이름 시 에러 메시지 출력

## 의존성
- TASK-001 (프로젝트 초기 설정)
- TASK-002 (CLI 뼈대 구현)
- TASK-003 (obora init - 폴더 구조)

## 테스트 케이스
```bash
# 기본 피처 생성
obora new authentication
ls -la .obora/features/authentication/
cat .obora/features/authentication/status.yaml

# 워크플로우 지정
obora new user-auth --workflow standard

# 기존 문서에서 시작 (Brownfield)
obora new legacy-refactor --from-existing

# 템플릿 지정
obora new api-endpoint --template api

# 조합 사용
obora new feature-x --workflow standard --from-existing

# 에러 케이스
obora new existing-feature  # 중복 이름 → 에러
obora new Invalid_Name      # 잘못된 형식 → 에러 (kebab-case 필수)
obora new .hidden           # 숨김 파일 형식 → 에러
```

## 종료 코드
| 코드 | 의미 |
|------|------|
| 0 | 성공 |
| 1 | 일반 에러 |
| 3 | 초기화 필요 (.obora/ 없음) |

## 참고 자료
- [handlebars 템플릿 엔진](https://handlebarsjs.com/)
- [slugify (이름 정규화)](https://github.com/sindresorhus/slugify)
- [YAML 상태 파일 형식](TASK-009 참조)
