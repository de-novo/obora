# Archive Note: 15-Longrun Project Loop

## 1. Summary of Project

Obora의 열다섯 번째 canonical sandbox로, long-running runner 위에서 동작하는 project remediation loop를 구축한다. 이 sandbox는 draft 작성, review, validation 실패, repair, 최종 validation, archive의 전체 수명주기를 자동화된 방식으로 시연한다.

**최종 산출물:** `/output/final/04-repaired.md`

**주요 특징:**
- Long-running runner 환경에서 반복적인 project remediation 수행
- 전체 문서 수명주기 자동화 (draft → review → validate → repair → validate → archive)
- 한국어 기반 구조적 문서 템플릿 (Project Summary, Scope, Next Action)

**최종 검증 결과:** PASS (3/3 checklist items: Project Summary, Scope, Next Action)

---

## 2. Why Archived

프로젝트가 성공적으로 완료되어 아카이브됨:

1. **Validation 통과**: 모든 필수 체크리스트 항목(3개)이 통과 상태로 확인됨
2. **수명주기 완료**: draft → review → validate → repair → validate → archive 전체 수명주기가 완료됨
3. **안정적 산출물**: 최종 후보 문서(04-repaired.md)가 모든 요구사항을 충족하며 stable-signature로 검증됨

**아카이빙 시점:** 2026-03-17

---

## 3. Reuse Notes

### 3.1 워크플로우 구조

이 프로젝트는 고정된 draft → review → repair 선형 시퀀스가 아닌, **runtime-native project loop**로 동작한다:

```
validate_project
    ↓ (if validation fails)
build_or_repair ← control returns here
    ↓
review_project
    ↓
validate_project (loop until pass)
    ↓
archive_project
```

**핵심 특성:**
- `validate_project` 단계에서 validation 실패 시 제어가 `build_or_repair` 단계로 다시 전달될 수 있음
- 루프 횟수는 런타임에 결정되며, validation 통과 시까지 반복 가능
- 각 반복에서 repair는 이전 검증 실패를 기반으로 개선 수행

### 3.2 재사용 가능한 패턴

| 구성 요소 | 설명 | 재사용 시 고려사항 |
|-----------|------|-------------------|
| 문서 구조 | Project Summary + Scope + Next Action | 한국어 템플릿으로 다른 sandbox에 적용 가능 |
| Validation Checklist | 3-섹션 필수 항목 검증 | 체크리스트 항목은 프로젝트 유형에 맞게 조정 가능 |
| Repair 메커니즘 | 누락 섹션 식별 → 내용 생성 → 재검증 | repair 로직은 구체적 실패 사유에 따라 달라짐 |

### 3.3 템플릿 코드 스니펫

**문서 구조 템플릿:**
```markdown
# [Project Name]

## Project Summary
[프로젝트 목적과 핵심 목표 요약]

## Scope

**목표:**
- [목표 1]
- [목표 2]

**포함 범위:**
- [포함 항목 1]
- [포함 항목 2]

**제외 범위:**
- [제외 항목 1]
- [제외 항목 2]

## Next Action
[즉시 실행 가능한 다음 단계]
```

### 3.4 주의사항

1. **루프 무한 반복 방지**: validate → repair 루프에 최대 반복 횟수 제한 권장
2. **Signature 검증**: 각 validation 단계에서 stable-signature 생성하여 산출물 무결성 확인
3. **실패 로그 보존**: 각 반복에서의 실패 원인을 로그에 보존하여 디버깅 지원

---

**Archive Complete**
