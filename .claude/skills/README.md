# Skills 구조 가이드

스킬의 구조, 분류, 관리 방법을 설명합니다.

## 디렉토리 구조

```
.claude/skills/
├── obora/                    # obora 제공 스킬 (예약됨)
│   └── obora-*/
├── vendor/                   # 외부 프로바이더 스킬 (예약됨)
│   ├── MANIFEST.yaml         # 벤더 메타데이터
│   └── <provider>/           # 프로바이더별 폴더
│       └── <skill-name>/
└── <user-skills>/            # 사용자 정의 스킬 (자유 구조)
```

## 스킬 분류

| Provider | 설명 | 경로 |
|----------|------|------|
| `obora` | obora가 직접 제작/유지보수 | `obora/obora-*` |
| `<vendor>` | 외부 프로바이더 제공 | `vendor/<provider>/<skill>` |
| `user` | 사용자 정의 | 그 외 모든 경로 |

## 사용자 스킬 생성

사용자는 `obora/`, `vendor/` 외의 **어떤 경로에든** 자유롭게 스킬을 생성할 수 있습니다.

### 예시

```
.claude/skills/
├── my-skill/                     # 루트 레벨
├── frontend/
│   └── react-patterns/           # 카테고리별 구성
├── team/
│   └── code-conventions/         # 팀별 구성
└── project-specific/
    └── api-guidelines/           # 프로젝트별 구성
```

### SKILL.md 형식

```yaml
---
name: my-skill
description: 스킬 설명. 언제 사용되는지 명시.
---

# 스킬 제목

스킬 내용...
```

## Vendor 스킬 관리

외부 프로바이더 스킬은 원본 그대로 유지합니다.

### 원칙

1. **원본 유지**: SKILL.md, 폴더명 등 원본 그대로 사용
2. **메타데이터 분리**: 버전/동기화 정보는 `MANIFEST.yaml`에서 관리
3. **덮어쓰기 가능**: 업데이트 시 스킬 파일을 그대로 덮어쓸 수 있음

### MANIFEST.yaml

```yaml
vendors:
  vercel:
    vercel-react-best-practices:
      source_url: https://github.com/vercel/...
      version: "1.0.0"
      synced_at: 2026-01-18
      license: MIT
```

### 변경 대응

| 상황 | 대응 |
|------|------|
| 업데이트 | source_url에서 최신 버전 가져와 덮어쓰기, MANIFEST 갱신 |
| Deprecated | `deprecated: true` 필드 추가, 대안 스킬 안내 |
| 삭제 | 로컬 보존 또는 제거 결정, 의존 워크플로우 확인 |

## 스킬 디스커버리

```bash
.claude/skills/obora/obora-skill-discovery/scripts/discover-skills.sh
```

출력 예시:

```yaml
skills:
  - name: "obora-typescript"
    description: "TypeScript 패턴 및 컨벤션..."
    provider: "obora"
    path: "obora/obora-typescript"
  - name: "vercel-react-best-practices"
    description: "React and Next.js performance..."
    provider: "vercel"
    path: "vendor/vercel/vercel-react-best-practices"
  - name: "my-custom-skill"
    description: "사용자 정의 스킬..."
    provider: "user"
    path: "my-custom-skill"
```

## 예약된 경로

다음 경로는 예약되어 있으므로 사용자 스킬에 사용하지 마세요:

- `obora/` - obora 공식 스킬
- `vendor/` - 외부 프로바이더 스킬
