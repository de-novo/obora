# Validation-Repair Loop Troubleshooting

## 1. repair step이 반복되는데 개선이 없음
### 증상
- 같은 validator 실패가 반복됨
- loop가 no-progress로 종료됨

### 확인할 것
- validator `signature`가 안정적인가
- summary만 바뀌고 실제 실패 유형은 같은가
- repair agent가 repair context를 실제로 활용하는가

### 대응
- `signature` 생성 규칙을 더 일관되게 만든다
- repair prompt에서 latestValidation / previousValidationResults 사용을 명시한다
- `max_no_progress_iterations`를 지나치게 크게 두지 않는다

---

## 2. repeated critical issue ceiling에 걸린다
### 증상
- 같은 blocker가 반복되고 loop가 중단됨

### 확인할 것
- 이 실패가 정말 같은 critical issue인지
- ceiling 값이 너무 낮지 않은지
- validator가 서로 다른 blocker를 같은 signature로 뭉개지 않는지

### 대응
- signature granularity를 조정한다
- `repeated_critical_issue_ceiling` 값을 현실적으로 조정한다
- blocker를 더 세분화해 failedChecks에 남긴다

---

## 3. validator 결과가 structured result로 인식되지 않는다
### 증상
- validator step이 ValidationResult로 파싱되지 않음

### 확인할 것
- `validation.emit_structured_result: true` 설정 여부
- JSON 형식이 유효한지
- `passed`, `summary`, `failedChecks` 구조가 맞는지

### 대응
- fenced code block 대신 순수 JSON payload를 우선 사용한다
- 필수 필드를 명확히 반환하도록 validator prompt를 조정한다

---

## 4. cancel/abort 이후 run 상태가 이상하다
### 증상
- 실행이 취소됐는데 상태 추적이 어색함

### 현재 지원
- cancel/abort 경로는 persistence에 `aborted` 상태로 저장되도록 지원됩니다

### 확인할 것
- custom storage adapter가 최신 `RunRecord.status` 계약을 따르는지
- CLI에서 runs inspect 결과가 최신 저장 레코드를 읽는지

---

## 5. 종료 이유를 알고 싶다
### 확인 포인트
repair loop summary에서 아래를 확인하세요.
- `lastNoProgressReason`
- `lastExhaustReason`
- `lastStopCategory`

### `lastStopCategory` 의미
- `no_progress`
- `repeated_critical_issue`
- `exhausted`

---

## 6. 어떤 ceiling 값을 써야 하나
권장 출발값:
- `max_no_progress_iterations: 2`
- `repeated_critical_issue_ceiling: 2`
- `on_fail.max_iterations: 3`

이 값은 보수적 시작점입니다. 반복 실패 패턴을 보고 조정하는 것이 맞습니다.
