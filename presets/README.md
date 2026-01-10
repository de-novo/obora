# Presets

기능별 설정 패키지입니다. 프로젝트에 필요한 기능을 빠르게 추가할 수 있습니다.

## 사용법

```bash
# 프리셋 추가
obora add <preset-name>

# 여러 프리셋 한번에
obora add clerk drizzle polar
```

## 프리셋 목록

### Auth (인증)
| 이름 | 설명 | 기본 |
|------|------|------|
| `clerk` | 호스팅형, 빠른 설정, 10K MAU 무료 | O |
| `better-auth` | 오픈소스, 자체 호스팅, 데이터 소유권 | |

### Database (데이터베이스)
| 이름 | 설명 | 기본 |
|------|------|------|
| `drizzle` | 경량(7kb), SQL-first, 서버리스 최적화 | O |
| `prisma` | 성숙한 생태계, 강력한 툴링 | |

### Payment (결제)
| 이름 | 설명 | 기본 |
|------|------|------|
| `polar` | MoR, 개발자 친화적, 4% + $0.40 | O |
| `paddle` | MoR, 글로벌, 5% + $0.50 | |

### Analytics (분석)
| 이름 | 설명 | 기본 |
|------|------|------|
| `umami` | 경량, 프라이버시, 자체호스팅 | O |
| `posthog` | 올인원 (분석+세션리플레이+피처플래그) | |

### Email (이메일)
| 이름 | 설명 | 기본 |
|------|------|------|
| `resend` | React Email 통합, 3K/월 무료 | O |

### Storage (스토리지)
| 이름 | 설명 | 기본 |
|------|------|------|
| `uploadthing` | 타입 안전, 서버 인증 | O |
| `cloudflare-r2` | S3 호환, 이그레스 무료 | |

### AI
| 이름 | 설명 | 기본 |
|------|------|------|
| `vercel-ai` | 스트리밍 UI, React 통합 | O |

## 프리셋 구조

```
presets/<category>/<name>/
├── manifest.json       # 메타데이터
├── dependencies.json   # npm 패키지
├── env.example         # 환경변수
├── files/              # 추가할 파일들
└── README.md           # 사용 가이드
```

## manifest.json 스키마

```json
{
  "name": "preset-name",
  "version": "1.0.0",
  "description": "프리셋 설명",
  "category": "auth|database|payment|...",
  "default": true,
  "compatible": ["turbo-nextjs-full", "turbo-nextjs-minimal"],
  "conflicts": ["other-preset"],
  "requires": ["dependency-preset"],
  "env": [
    {
      "key": "ENV_VAR_NAME",
      "description": "설명",
      "required": true,
      "secret": false
    }
  ]
}
```
