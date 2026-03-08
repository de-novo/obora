# Artifact Access API Update

## 한줄 요약

Obora dashboard history API는 이제 run detail에서 artifact를 단순 나열하는 수준을 넘어,
**preview / raw open / download**를 위한 직접 endpoint를 제공한다.

---

## 추가된 API surface

### 1. Artifact preview

```http
GET /api/history/runs/:runId/artifacts/:artifactId/preview
```

텍스트 계열 artifact에 대해 preview payload를 반환한다.

지원 대상 예시:
- `text/*`
- `.log`
- `.md`
- `.txt`
- `.json`
- `.yaml`, `.yml`

응답 형태:

```ts
interface ArtifactPreviewResponse {
  artifact: ArtifactRecord;
  supported: boolean;
  contentType?: string;
  text?: string;
  truncated?: boolean;
  reason?: string;
}
```

### 2. Artifact raw

```http
GET /api/history/runs/:runId/artifacts/:artifactId/raw
GET /api/history/runs/:runId/artifacts/:artifactId/raw?download=1
```

동작:
- 기본: `inline` content-disposition (`Open raw`)
- `download=1`: `attachment` content-disposition (`Download`)

즉 preview는 빠른 확인용이고,
raw endpoint는 실제 원문 접근/다운로드용이다.

---

## 응답/동작 의도

### Preview endpoint
- 텍스트 계열은 본문을 바로 반환
- 큰 파일은 잘라서 반환 (`truncated: true`)
- preview 불가 타입은 `supported: false` + `reason` 반환

### Raw endpoint
- storage ref에서 실제 payload를 읽어 그대로 전달
- mime type을 유지
- dashboard UI뿐 아니라 외부 tooling에서도 사용 가능

---

## 왜 중요한가

이전에는 dashboard에서 artifact를 "존재 확인"만 할 수 있었다.
이제는:
1. 관련 artifact를 찾고
2. 내용을 preview로 빠르게 읽고
3. 필요하면 raw open / download로 넘어갈 수 있다.

즉 failure diagnosis가
**artifact 존재 확인**에서
**artifact 내용 접근**까지 올라왔다.

---

## 현재 dashboard에서의 사용

Run detail page에서:
- artifact title 클릭
- `Preview`
- `Open raw`
- `Download`

가 모두 제공된다.

즉 API가 단순 내부 구현이 아니라,
실제 UI 소비 경로까지 붙은 상태다.

---

## API consumer 관점 팁

외부 consumer는 다음 순서를 권장한다.

1. run detail / list에서 `repairLoop` 요약 확인
2. `recentValidationFailures`로 관련 validator failure 파악
3. related artifact를 찾음
4. preview endpoint로 빠르게 내용 확인
5. 필요 시 raw endpoint로 원문 열기 / 다운로드

---

## 알려진 제약

- preview는 텍스트 계열 중심이다.
- binary artifact는 현재 preview 대상이 아니다.
- large artifact는 preview에서 잘릴 수 있다.
- syntax highlighting / structured rendering은 아직 최소 수준이다.

---

## 다음 단계 제안

1. preview modal에 syntax highlighting / JSON pretty view 추가
2. binary artifact handling policy 정리
3. raw/download endpoint를 공식 external API 문서에 더 직접 노출
4. artifact preview usage metrics / audit 연결 검토

---

## 결론

이번 업데이트로 Obora는 repair-loop summary뿐 아니라,
**artifact 내용 접근 경로까지 external API로 제공하는 방향**으로 한 단계 더 나아갔다.

이건 dashboard UX 개선이기도 하지만,
동시에 external consumers를 위한 API capability 확장이기도 하다.
