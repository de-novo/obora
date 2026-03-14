# Abstract

본 연구는 Obora 워크플로우 상에서 GLM 계열 모델을 활용해 **논문급 연구 루프를 자율 수행할 수 있는가**를 검증하는 것을 목표로 했다. 초기 실험에서는 문제정의, 성공 기준, 연구 노트, 중간 결론, 리뷰, 최종 결론까지의 흐름을 자동 생성할 수 있음을 확인했으나, 종료 판정의 일관성, 정량적 성공 기준 부재, progress/no-progress 판단 규칙의 모호성, 일부 핵심 가설의 검증 불완전성이 P0 이슈로 식별되었다.

이에 Iteration 2에서는 remediation-focused loop를 별도로 구성하여 P0 이슈 4개를 직접 해소했다. 구체적으로는 P0/P1 분류 기준, PASS/FAIL 임계값, Archive-Ready 기준, Bounded-Stop 기준을 정량화했고, counter reset 규칙 및 no-progress 감지 규칙을 명시했으며, H-002와 H-003 가설의 최종 상태를 확정했다. 그 결과 P0-001~P0-004가 모두 해결되었고, remediation review는 STOP 가능 조건 충족을 판정했다.

연구 결과, Obora + GLM 기반 구조는 단순 문서 생성기를 넘어 **문제정의 → 연구 → 리뷰 → remediation → 종료 판정**까지 포함하는 자율 연구 루프를 운영할 수 있음을 보였다. 다만 이 결론은 설계·운영 가능성에 대한 것이며, production-grade 검증을 위해서는 실제 구현, E2E 테스트, 외부 타당성 검증이 후속 단계로 필요하다.
