# reddit-clone Obora workflow

이 디렉토리는 `packages/reddit-clone` 앱을 대상으로 하는 Obora workflow를 담습니다.

## 목적
현재 앱 상태를 바탕으로 아래 산출물을 자동 생성합니다.
- 현재 상태 진단
- 다음 iteration PRD
- 아키텍처/파일 변경 계획
- 구현 backlog
- 리뷰 코멘트
- 최종 요약

## 실행
```bash
pnpm --filter @obora/reddit-clone workflow:plan
```

## 출력
생성 결과는 `packages/reddit-clone/generated/` 아래에 저장됩니다.
