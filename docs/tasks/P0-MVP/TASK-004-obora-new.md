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
   - `--type` 옵션 (feature, bugfix, refactor 등)
   - `--description` 옵션
   - 대화형 모드 지원 (옵션 미입력 시)

2. **피처 폴더 구조 생성**
   - `.obora/features/<name>/` 폴더 생성
   - `proposals/` 폴더 생성 (제안서)
   - `designs/` 폴더 생성 (설계서)
   - `evidence/` 폴더 생성 (증거)

3. **템플릿 파일 생성**
   - `proposal.md` 템플릿 적용
   - `design.md` 템플릿 적용
   - 템플릿 내에 메타데이터 자동 채움 (이름, 날짜, 타입)

4. **상태 추적 초기화**
   - `.obora/features/<name>/status.yaml` 생성
   - 초기 상태: `proposed`

5. **유효성 검사**
   - 피처 이름 형식 검증 (kebab-case)
   - 중복 피처 이름 검사
   - 부적절한 이름 검사

## 완료 조건
- [ ] `obora new my-feature` 실행 시 폴더 구조 생성
- [ ] `proposal.md` 템플릿 생성
- [ ] `design.md` 템플릿 생성
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

# 타입 지정
obora new bugfix-login-issue --type bugfix

# 설명 추가
obora new user-dashboard --type feature --description "사용자 대시보드 추가"

# 에러 케이스
obora new existing-feature  # 중복 이름 시 에러
obora new Invalid_Name      # 잘못된 형식 시 에러
```

## 참고 자료
- [handlebars 템플릿 엔진](https://handlebarsjs.com/)
- [slugify (이름 정규화)](https://github.com/sindresorhus/slugify)
- [YAML 상태 파일 형식](TASK-009 참조)
