# Project Loop Archive Note

## Summary of Project

Obora의 일곱 번째 canonical sandbox 프로젝트로, runtime-native project loop 아키텍처를 시연하기 위해 설계되었습니다. 이 sandbox는 작은 project lifecycle을 통해 validate_project가 build_or_repair로 제어를 반환할 수 있는 루프 구조를 보여줍니다.

**핵심 특징:**
- Runtime-native loop: validate_project가 실패 시 build_or_repair로 제어를 반환하는 구조
- 의도적 초기 검증 실패: 리뷰-수정-재검증 사이클 시연
- 한글 기반 문서화
- Canonical sandbox #7 구조 정의

**최종 결과물:** 04-repaired.md는 모든 필수 체크리스트 항목(Project Summary, Scope, Next Action)을 포함하여 최종 검증을 통과했습니다.

**Validation Signature:** stable-signature

## Why Archived

이 프로젝트는 성공적으로 완료되어 아카이브됩니다:

1. **검증 통과**: validate_project 단계에서 모든 필수 항목 존재 확인 (Project Summary, Scope, Next Action)
2. **Runtime Loop 검증 완료**: validate_project → build_or_repair → validate_project 루프가 정상적으로 동작함을 확인
3. **문서화 완료**: 한글 기반 프로젝트 문서가 모든 요구사항을 충족
4. **데모 목적 달성**: sandbox #7의 목표인 project lifecycle 시연 완료

**아카이브 시점:** 최종 검증 통과 후 안정화된 상태

## Reuse Notes

**Workflow Architecture 재사용 시 참고사항:**

1. **Runtime-Native Loop 구조**
   - validate_project는 단순한 선형 단계가 아니라, 조건부로 build_or_repair로 제어를 반환할 수 있는 런타임 루프의 일부입니다
   - 이 구조는 고정된 draft → review → repair 순서가 아니라, 런타임에 검증 결과에 따라 동적으로 경로가 결정됩니다

2. **Replay 및 재실행**
   - Archive에서 재생 시: validation 실패가 발생하면 build_or_repair가 자동으로 재실행됩니다
   - Stateless replay: 각 실행은 독립적이며 이전 실행 상태에 의존하지 않습니다

3. **확장 가능성**
   - 이 패턴은 더 복잡한 multi-pass 워크플로우로 확장 가능합니다
   - 예: review → validate → repair → validate → finalize 등

4. **주의사항**
   - 루프 종료 조건을 명확히 정의해야 합니다 (이 프로젝트에서는 validation PASS)
   - 무한 루프 방지를 위해 최대 반복 횟수 제한 권장

---

**Archive Date:** 2026-03-17  
**Final Status:** PASS  
**Workflow Pattern:** Runtime-native validate → repair loop  
