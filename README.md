# obora-kit

> 빠른 SaaS 개발을 위한 공용 도구, 템플릿, 프리셋 허브

## 설치

```bash
npm install -g @obora-labs/cli
# 또는
npx @obora-labs/cli
```

## 빠른 시작

```bash
# 새 프로젝트 생성
obora create my-saas --template turbo-nextjs-full --presets clerk,drizzle,polar

# 디렉토리 이동
cd my-saas

# 환경변수 설정
cp .env.example .env.local

# 개발 서버 시작
pnpm dev
```

## 구조

```
obora-kit/
├── ai-configs/          # AI 도구 설정 (.claude, .cursor 등)
├── templates/           # 프로젝트 템플릿
├── presets/             # 기능별 프리셋
├── packages/            # 공용 npm 패키지
└── scripts/             # 자동화 스크립트
```

## 템플릿

| 템플릿 | 설명 |
|--------|------|
| `turbo-nextjs-full` | 풀스택 SaaS (Next.js 15 + Turborepo) |
| `turbo-nextjs-minimal` | 최소 구성 |

## 프리셋

### 인증 (Auth)
| 프리셋 | 설명 |
|--------|------|
| `clerk` | (기본) 호스팅형, 빠른 설정 |
| `better-auth` | 오픈소스, 자체 호스팅 |

### 데이터베이스 (Database)
| 프리셋 | 설명 |
|--------|------|
| `prisma` | (기본) 성숙한 생태계, Prisma Studio |
| `drizzle` | 경량, SQL-first, 서버리스 최적화 |

### 결제 (Payment)
| 프리셋 | 설명 |
|--------|------|
| `polar` | (기본) MoR, 개발자 친화적 |
| `paddle` | MoR, 글로벌 |

### 분석 (Analytics)
| 프리셋 | 설명 |
|--------|------|
| `umami` | (기본) 경량, 프라이버시 |
| `posthog` | 올인원 제품 분석 |

### 이메일 (Email)
| 프리셋 | 설명 |
|--------|------|
| `resend` | (기본) React Email 통합 |

### 스토리지 (Storage)
| 프리셋 | 설명 |
|--------|------|
| `uploadthing` | (기본) 타입 안전 |
| `cloudflare-r2` | S3 호환, 이그레스 무료 |

### AI
| 프리셋 | 설명 |
|--------|------|
| `vercel-ai` | (기본) 스트리밍 UI |

## CLI 명령어

```bash
obora create <name>           # 새 프로젝트 생성
obora add <preset>            # 프리셋 추가
obora remove <preset>         # 프리셋 제거
obora status                  # 현재 설정 상태 확인
obora list                    # 사용 가능한 템플릿/프리셋 목록
```

### 프리셋 관리

```bash
# 프리셋 추가
obora add clerk               # auth 슬롯에 clerk 추가

# 프리셋 제거
obora remove clerk            # clerk 프리셋 제거

# 상태 확인
obora status                  # 현재 설치된 프리셋 확인
obora status --history        # 변경 이력 포함
obora status --json           # JSON 형식 출력
```

## 프로젝트 추적 (.obora/)

obora로 생성된 프로젝트는 `.obora/` 폴더에서 상태를 추적합니다:

```
.obora/
├── config.json    # 현재 설정 (템플릿, 슬롯, 프리셋)
└── history.json   # 변경 이력
```

### config.json 예시

```json
{
  "$schema": "https://obora.dev/schema/config.json",
  "version": "1.0.0",
  "template": "turbo-nextjs-full",
  "createdAt": "2025-01-10T00:00:00.000Z",
  "updatedAt": "2025-01-10T00:00:00.000Z",
  "slots": {
    "database": { "preset": "prisma", "version": "7.0.0", "installedAt": "..." },
    "auth": { "preset": "clerk", "version": "1.25.0", "installedAt": "..." },
    "payment": null
  },
  "packageManager": "pnpm"
}
```

## 기술 스택 (2025-2026)

| 영역 | 기본 선택 |
|------|----------|
| Framework | Next.js 15 |
| Monorepo | Turborepo |
| Styling | Tailwind CSS v4 |
| UI | shadcn/ui (Base UI) |
| ORM | Drizzle |
| Auth | Clerk |
| Payment | Polar |
| Analytics | Umami |
| Email | Resend |
| AI | Vercel AI SDK |

## 관련 문서

- [obora](../obora) - 프로젝트 레지스트리
- [ORGANIZATION.md](../ORGANIZATION.md) - 조직 기획서

---

*obora-labs*
