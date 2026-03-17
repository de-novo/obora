# 15-Longrun Project Loop

## Project Summary

Obora의 열다섯 번째 canonical sandbox로, long-running runner 위에서 동작하는 project remediation loop를 구축한다. 이 sandbox는 draft 작성, review, validation 실패, repair, 최종 validation, archive의 전체 수명주기를 자동화된 방식으로 시연한다.

## Scope

**목표:**
- Long-running runner 환경에서 반복적인 project remediation 수행
- 전체 문서 수명주기 자동화 (draft → review → validate → repair → validate → archive)
- 재사용 가능한 archive note 생성

**포함 범위:**
- Draft 생성 자동화
- Review 및 validation 체계 구축
- Repair 루프 메커니즘 구현
- Archive note 저장 기능
- 한국어 기반 구조적 문서 템플릿

**제외 범위:**
- 다른 언어 지원
- 외부 시스템 연동
- 실시간 협업 기능

## Next Action

runner 환경에서 draft → review → validate 파이프라인을 실행하여 remediation loop를 시연한다. 첫 번째 실행에서 의도적으로 validation을 실패시키고, repair 단계를 통해 Next Action 섹션을 추가한 후 최종 validation을 통과하여 archive note를 생성한다.
