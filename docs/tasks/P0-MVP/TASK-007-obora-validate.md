# TASK-007: obora validate 명령어 구현

## 개요
- 우선순위: P0
- 예상 소요: 1.5시간
- 담당: 개발자

## 목표
워크플로우 유효성 검증 CLI 명령어 구현

## 작업 내용
1. **명령어 인터페이스 구현**
   - `obora validate [options]` 명령어 등록
   - `--file` 옵션 (특정 파일 검증)
   - `--all` 옵션 (모든 워크플로우 검증)
   - `--fix` 옵션 (자동 수정 가능한 문제 수정)

2. **검증 대상 탐색**
   - `.obora/workflows/` 폴더 스캔
   - YAML 파일 필터링 (`*.yaml`, `*.yml`)
   - 피처 폴더 내 워크플로우 검색

3. **검증 실행**
   - YAML 파서 호출
   - 검증기 호출
   - 결과 집계

4. **결과 출력**
   - 통과/실패 요약 출력
   - 에러 목록 출력 (파일별, 라인별)
   - 경고 목록 출력
   - 색상 및 이모지 사용 (가독성)

5. **종료 코드 설정**
   - 0: 모든 검증 통과
   - 1: 에러 존재
   - 2: 경고만 존재 (`--strict` 옵션 시)

## 완료 조건
- [ ] `obora validate --all` 실행 시 모든 워크플로우 검증
- [ ] `obora validate --file workflow.yaml` 실행 시 특정 파일 검증
- [ ] 에러 발생 시 종료 코드 1 반환
- [ ] 보기 좋은 결과 출력

## 의존성
- TASK-001 (프로젝트 초기 설정)
- TASK-002 (CLI 뼈대 구현)
- TASK-003 (obora init - 폴더 구조)
- TASK-005 (YAML 파서)
- TASK-006 (YAML 검증기)

## 테스트 케이스
```bash
# 전체 워크플로우 검증
obora validate --all

# 특정 파일 검증
obora validate --file .obora/workflows/standard.yaml

# 피처 내 워크플로우 검증
obora validate --file .obora/features/authentication/workflow.yaml

# 종료 코드 확인
obora validate --all
echo $?  # 0: 통과, 1: 에러, 2: 경고

# 엄격 모드 (경고도 에러로 처리)
obora validate --all --strict
```

## 출력 예시
```
✓ Checking .obora/workflows/standard.yaml
✓ Checking .obora/features/authentication/workflow.yaml

✗ Checking .obora/features/payment/workflow.yaml
  Error: CIRCULAR_DEPENDENCY at line 15
  → Found circular dependency: task-a → task-b → task-a
    Suggestion: Remove one of the circular dependencies

⚠ Checking .obora/features/notifications/workflow.yaml
  Warning: MISSING_DESCRIPTION at line 8
  → Task 'send-email' is missing description

Results: 2 passed, 1 failed, 1 warning
```

## 참고 자료
- [Chalk (터미널 색상)](https://github.com/chalk/chalk)
- [CLI 출력 최적화 가이드](https://clig.dev/#output)
- [종료 코드 규약](https://tldp.org/LDP/abs/html/exitcodes.html)
