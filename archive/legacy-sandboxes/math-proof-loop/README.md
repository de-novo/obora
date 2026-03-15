# Math Proof Loop Sandbox

> 상태: **legacy / 참고용 sandbox**
> 
> 이 폴더는 현재 canonical sandbox 기준이 아닙니다. 수학 proof/review/archive 루프 실험 자산을 보존하는 목적의 sandbox입니다.

> 운영 규칙과 회귀 포인트는 `docs/operations/research-sandbox-runbook.md`를 기준으로 봅니다.

## 목적
이 sandbox는 Obora가 수학 난제급 문제에 대해 **증명 탐색 루프를 자율 운영할 수 있는지** 검증하기 위한 공간입니다.

핵심은 실제 난제를 해결했다고 주장하는 것이 아니라,
- 문제 구조화
- known results audit
- lemma search
- proof attempt
- counterexample check
- review/remediation
- bounded stop archive
를 일관되게 운영할 수 있는지 보는 것입니다.

## 권장 실험 순서
1. 검증 가능한 고난도 정리
2. 반례 탐색 중심 문제
3. 난제 스타일 open-ended conjecture

## 권장 폴더 사용
- `input/`: 문제 정의, loop policy
- `workflows/`: proof loop workflow
- `output/iterations/`: lemma/proof/counterexample 중간 결과
- `output/final/`: review, remediation, final conclusion
- `output/archive/`: 아카이브 패키지
- `notes/`: 평가 기준 및 추가 메모
