# @obora/reddit-clone

Reddit 스타일 커뮤니티 피드 클론입니다.

## 목적
- obora-kit가 샌드박스 수준을 넘어 실제 프로젝트성 프론트엔드도 빠르게 만들 수 있는지 검증
- 정보 밀도가 높은 커뮤니티 홈, 피드, 사이드바, 댓글 패널 구조를 실제 앱 패키지로 구현

## 실행
```bash
pnpm install
pnpm --filter @obora/reddit-clone dev
```

## 빌드
```bash
pnpm --filter @obora/reddit-clone build
```

## Obora workflow 연결
현재 앱 상태를 분석해서 다음 구현 iteration 문서를 생성할 수 있습니다.

```bash
pnpm --filter @obora/reddit-clone workflow:plan
```

생성 결과는 `packages/reddit-clone/generated/` 아래에 저장됩니다.
