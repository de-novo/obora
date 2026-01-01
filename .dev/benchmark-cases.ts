/**
 * obora 벤치마크 케이스 정의
 *
 * 설계 원칙:
 * 1. 의견 대립 가능성 - AI들이 다른 결론을 낼 수 있어야 함
 * 2. 정답이 없음 - 맥락에 따라 최적해가 다름
 * 3. 숨은 트레이드오프 - 표면적으로 보이지 않는 고려사항
 * 4. 실무 관련성 - 개발자가 실제로 고민하는 문제
 */

export interface BenchmarkCase {
  id: string;
  name: string;
  category: "architecture" | "security" | "performance" | "migration" | "methodology" | "debugging";
  difficulty: "medium" | "hard" | "expert";
  controversyLevel: "low" | "medium" | "high";  // AI 의견 대립 예상 수준
  question: string;
  context: string;  // 상세 배경
  evaluationCriteria: string[];
  expectedTopics: string[];
  groundTruth?: string;  // 전문가 의견 (있는 경우)
  whyControversial: string;  // 왜 의견이 갈릴 수 있는지
}

export const BENCHMARK_CASES_V2: BenchmarkCase[] = [
  // ============================================
  // 1. 서버리스 vs 컨테이너 (High Controversy)
  // ============================================
  {
    id: "serverless-vs-container",
    name: "서버리스 vs 컨테이너 선택",
    category: "architecture",
    difficulty: "hard",
    controversyLevel: "high",
    question: `B2B SaaS 스타트업에서 새 백엔드를 구축합니다.

상황:
- 예상 트래픽: 평일 낮 피크, 주말/밤 거의 없음 (10:1 비율)
- API 특성: 90%는 단순 CRUD, 10%는 무거운 리포트 생성 (30초-2분)
- 팀: 백엔드 3명, DevOps 전담 없음
- 현재 AWS 사용 중
- 예산: 월 $3,000 이내 목표

선택지:
A) AWS Lambda + API Gateway (서버리스)
B) ECS Fargate (컨테이너)
C) 하이브리드 (CRUD는 Lambda, 리포트는 ECS)

어떤 것을 추천하시나요? 이유와 리스크를 설명해주세요.`,
    context: "서버리스와 컨테이너는 각각 장단점이 명확하고, 전문가들 사이에서도 의견이 갈리는 영역",
    evaluationCriteria: [
      "Cold Start 문제 분석",
      "비용 예측의 정확성",
      "운영 복잡도 고려",
      "장기 리포트의 타임아웃 문제 인식",
      "DevOps 부재 상황 고려",
      "하이브리드 옵션의 장단점 분석",
    ],
    expectedTopics: [
      "Cold Start",
      "Lambda 15분 타임아웃",
      "Fargate Spot",
      "비용 예측",
      "운영 복잡도",
      "Step Functions",
    ],
    whyControversial: "서버리스 지지자와 컨테이너 지지자가 명확히 갈림. 특히 '10%의 무거운 작업'을 어떻게 처리할지에 대해 다양한 의견 가능",
  },

  // ============================================
  // 2. 모노레포 vs 멀티레포 (High Controversy)
  // ============================================
  {
    id: "monorepo-vs-multirepo",
    name: "모노레포 vs 멀티레포 전략",
    category: "architecture",
    difficulty: "hard",
    controversyLevel: "high",
    question: `성장하는 스타트업에서 코드 저장소 전략을 결정해야 합니다.

현재 상황:
- 서비스: API 서버 1개, 웹 프론트엔드 2개, 모바일 앱 1개, 공유 라이브러리 3개
- 팀: 풀스택 개발자 8명 (기능별 분업 없음, 모두가 여러 서비스 터치)
- 현재: 서비스별 별도 레포 (6개 레포)
- 문제: 공유 라이브러리 버전 불일치, 통합 테스트 어려움, PR 리뷰 분산
- 향후: 1년 내 팀 15명, 서비스 10개 이상 예상

선택지:
A) 모노레포로 통합 (Turborepo/Nx)
B) 현재 멀티레포 유지 + 공유 라이브러리만 개선
C) 하이브리드 (프론트엔드만 모노레포)

어떤 전략을 추천하시나요?`,
    context: "Google/Meta는 모노레포, Netflix/Amazon은 멀티레포. 정답이 없는 영역",
    evaluationCriteria: [
      "팀 규모와 성장 예측 고려",
      "빌드/테스트 시간 분석",
      "코드 리뷰 워크플로우 고려",
      "배포 독립성 분석",
      "도구(Turborepo/Nx/Bazel) 특성 이해",
      "마이그레이션 비용 고려",
    ],
    expectedTopics: [
      "Turborepo",
      "Nx",
      "빌드 캐싱",
      "atomic commits",
      "dependency hell",
      "CODEOWNERS",
    ],
    whyControversial: "모노레포 찬성론자와 반대론자가 극명히 갈림. 팀 규모 8→15명이 임계점인지 여부도 논쟁적",
  },

  // ============================================
  // 3. 실시간 동기화 아키텍처 (Expert Level)
  // ============================================
  {
    id: "realtime-sync-architecture",
    name: "실시간 협업 동기화 설계",
    category: "architecture",
    difficulty: "expert",
    controversyLevel: "high",
    question: `Notion/Figma 같은 실시간 협업 도구를 만들려고 합니다.

요구사항:
- 동시 편집: 최대 50명이 같은 문서 동시 편집
- 지연시간: 타이핑이 100ms 이내에 다른 사용자에게 보여야 함
- 오프라인: 오프라인에서 편집 후 온라인 시 동기화
- 충돌 해결: 자동 해결, 사용자 개입 최소화
- 히스토리: 무제한 되돌리기 지원

기술 선택지:
A) OT (Operational Transformation) - Google Docs 방식
B) CRDT (Conflict-free Replicated Data Types) - Figma 방식
C) Event Sourcing + 마지막 쓰기 승리 (Last Write Wins)

어떤 접근을 추천하시나요? 구현 전략도 제안해주세요.`,
    context: "분산 시스템의 고전적 난제. OT vs CRDT 논쟁은 10년 이상 지속 중",
    evaluationCriteria: [
      "OT의 복잡성(변환 함수) 이해",
      "CRDT의 메모리/성능 트레이드오프 이해",
      "오프라인 시나리오 처리",
      "히스토리/되돌리기 구현 방법",
      "구체적인 라이브러리/프레임워크 제안",
      "서버 아키텍처 고려",
    ],
    expectedTopics: [
      "Yjs",
      "Automerge",
      "CRDT",
      "Operational Transformation",
      "WebSocket",
      "Vector Clock",
    ],
    whyControversial: "OT 진영(Google)과 CRDT 진영(Figma)의 오래된 논쟁. 최근 CRDT가 우세하나, 복잡한 문서 구조에서는 여전히 OT 지지자 다수",
  },

  // ============================================
  // 4. 인증 시스템 설계 (Security - High Controversy)
  // ============================================
  {
    id: "auth-system-design",
    name: "인증/인가 시스템 설계",
    category: "security",
    difficulty: "hard",
    controversyLevel: "high",
    question: `B2B SaaS에서 인증/인가 시스템을 새로 설계합니다.

요구사항:
- 멀티테넌트: 기업별 독립 환경
- SSO: 기업 고객의 Okta/Azure AD 연동 필수
- 역할: 조직 내 Admin/Member/Viewer 권한
- API: 외부 개발자용 API 키 발급
- 규정: SOC2 준비 중

선택지:
A) Auth0/Clerk 같은 SaaS 사용
B) Keycloak 자체 호스팅
C) 직접 구현 (JWT + OAuth2)

어떤 접근을 추천하시나요?
보안, 비용, 유연성 관점에서 분석해주세요.`,
    context: "인증은 '절대 직접 구현하지 마라' vs '우리 요구사항은 특별하다' 논쟁이 항상 존재",
    evaluationCriteria: [
      "보안 리스크 분석의 깊이",
      "비용 분석 (사용량 기반 vs 고정)",
      "SSO 통합 복잡도 이해",
      "SOC2 규정 준수 고려",
      "장기 유연성 분석",
      "벤더 락인 리스크",
    ],
    expectedTopics: [
      "OAuth2",
      "OIDC",
      "SAML",
      "JWT",
      "RBAC",
      "멀티테넌트",
      "SOC2",
    ],
    whyControversial: "Auth0 등 SaaS의 높은 가격($25k+/년)에 대한 반발 vs 보안은 전문가에게 맡겨야 한다는 주장 충돌",
  },

  // ============================================
  // 5. 레거시 데이터베이스 마이그레이션 (Migration - Expert)
  // ============================================
  {
    id: "database-migration-strategy",
    name: "레거시 DB 마이그레이션 전략",
    category: "migration",
    difficulty: "expert",
    controversyLevel: "high",
    question: `10년 된 MySQL 기반 시스템을 현대화해야 합니다.

현재 상태:
- MySQL 5.7, 단일 인스턴스, 500GB
- 테이블 200개, 저장 프로시저 50개
- 하루 쿼리 1억 건, 피크 시 3000 QPS
- 문제: 복잡한 JOIN으로 느린 쿼리 다수, 스키마 변경 어려움
- 읽기/쓰기 비율: 9:1

목표:
- 수평 확장 가능한 구조
- 스키마 유연성
- 분석 쿼리 분리

선택지:
A) MySQL 8 + 읽기 복제본 + ProxySQL
B) PostgreSQL 마이그레이션 + Citus (분산)
C) 주요 테이블만 MongoDB로 이전 (폴리글랏)
D) PlanetScale/TiDB (NewSQL)

어떤 전략을 추천하시나요? 마이그레이션 단계도 제안해주세요.`,
    context: "데이터베이스 마이그레이션은 리스크가 매우 높고, 전문가마다 선호하는 기술이 다름",
    evaluationCriteria: [
      "다운타임 최소화 전략",
      "데이터 정합성 보장 방법",
      "저장 프로시저 마이그레이션 고려",
      "롤백 계획",
      "점진적 마이그레이션 전략",
      "비용 분석",
    ],
    expectedTopics: [
      "Blue-Green",
      "Shadow Traffic",
      "CDC",
      "읽기 복제본",
      "쿼리 최적화",
      "인덱싱",
    ],
    whyControversial: "MySQL 유지 vs PostgreSQL 전환 논쟁, RDBMS vs NoSQL 논쟁, 관리형 vs 자체 호스팅 논쟁이 동시에 존재",
  },

  // ============================================
  // 6. 테스트 전략 (Methodology - High Controversy)
  // ============================================
  {
    id: "testing-strategy",
    name: "테스트 피라미드 vs 트로피",
    category: "methodology",
    difficulty: "medium",
    controversyLevel: "high",
    question: `새로 합류한 QA 엔지니어가 테스트 전략을 제안했습니다.

현재 상황:
- React + Node.js 풀스택 앱
- 테스트: 유닛 테스트 500개 (커버리지 70%), E2E 20개
- 문제: 유닛 테스트는 통과하는데 프로덕션 버그 빈발
- 팀: 개발자 5명, QA 1명

QA 제안 (Testing Trophy 방식):
"유닛 테스트를 줄이고 통합 테스트를 대폭 늘리자.
React Testing Library로 컴포넌트 통합 테스트,
API는 실제 DB 연결 통합 테스트 중심으로."

시니어 개발자 반대:
"통합 테스트는 느리고 불안정하다.
유닛 테스트 + 소수의 E2E가 정석이다."

누구 말이 맞나요? 이 팀에 적합한 테스트 전략은?`,
    context: "Martin Fowler의 테스트 피라미드 vs Kent C. Dodds의 Testing Trophy 논쟁",
    evaluationCriteria: [
      "테스트 피라미드/트로피 이론 이해",
      "현재 문제(유닛 통과, 프로덕션 버그)의 원인 분석",
      "팀 규모와 리소스 고려",
      "테스트 실행 시간 고려",
      "구체적인 비율 제안",
      "도구 추천",
    ],
    expectedTopics: [
      "Testing Trophy",
      "React Testing Library",
      "통합 테스트",
      "Mocking",
      "테스트 피라미드",
      "CI 시간",
    ],
    whyControversial: "전통적 테스트 피라미드 지지자 vs 현대적 Testing Trophy 지지자 간 오래된 논쟁. 특히 프론트엔드에서 뜨거움",
  },

  // ============================================
  // 7. 캐싱 전략 (Performance - Medium Controversy)
  // ============================================
  {
    id: "caching-strategy",
    name: "복잡한 캐싱 무효화 전략",
    category: "performance",
    difficulty: "hard",
    controversyLevel: "medium",
    question: `소셜 미디어 피드 시스템의 캐싱을 설계해야 합니다.

현재 문제:
- 피드 API: 평균 500ms → 목표 50ms
- 데이터: 게시물, 좋아요 수, 댓글 수, 작성자 프로필
- 실시간성: 좋아요/댓글은 즉시 반영 필요
- 규모: DAU 100만, 피드 요청 초당 5000건

복잡한 점:
- 피드는 사용자마다 다름 (팔로우 기반)
- 게시물 수정 시 팔로워 전원의 캐시 무효화?
- 좋아요 수는 초단위로 변경됨

선택지:
A) 사용자별 피드 캐싱 (Redis)
B) 게시물 단위 캐싱 + 실시간 조합
C) Write-through + 백그라운드 갱신
D) Read-through + TTL 기반

캐싱 전략과 무효화 방법을 제안해주세요.`,
    context: "캐시 무효화는 컴퓨터 과학의 2대 난제 중 하나. 특히 소셜 피드에서는 정답이 없음",
    evaluationCriteria: [
      "Fan-out 문제 이해",
      "캐시 무효화 전략의 구체성",
      "실시간성과 일관성 트레이드오프 분석",
      "Redis 데이터 구조 활용",
      "비용 효율성",
      "장애 시 fallback 전략",
    ],
    expectedTopics: [
      "Fan-out-on-write",
      "Fan-out-on-read",
      "Cache-aside",
      "Write-through",
      "TTL",
      "Pub/Sub",
    ],
    whyControversial: "Push vs Pull 모델 논쟁, 실시간성 vs 일관성 트레이드오프에서 다양한 의견 존재",
  },

  // ============================================
  // 8. 마이크로서비스 통신 (Architecture - High Controversy)
  // ============================================
  {
    id: "microservice-communication",
    name: "마이크로서비스 간 통신 패턴",
    category: "architecture",
    difficulty: "hard",
    controversyLevel: "high",
    question: `이커머스 플랫폼의 마이크로서비스 통신을 설계합니다.

서비스 구성:
- 주문 서비스 (핵심)
- 재고 서비스
- 결제 서비스
- 배송 서비스
- 알림 서비스

주문 생성 시 플로우:
1. 재고 확인 및 차감
2. 결제 처리
3. 배송 요청 생성
4. 고객/판매자 알림

요구사항:
- 트랜잭션 일관성: 결제 실패 시 재고 원복
- 성능: 주문 응답 2초 이내
- 신뢰성: 99.9% 가용성

선택지:
A) 동기 REST + 분산 트랜잭션 (Saga - Orchestration)
B) 동기 gRPC + Saga (Choreography)
C) 비동기 이벤트 (Kafka) + 최종 일관성
D) 하이브리드 (핵심은 동기, 알림은 비동기)

어떤 패턴을 추천하시나요?`,
    context: "동기 vs 비동기, Orchestration vs Choreography는 마이크로서비스 설계의 핵심 논쟁점",
    evaluationCriteria: [
      "Saga 패턴 이해 (Orchestration vs Choreography)",
      "보상 트랜잭션 설계",
      "장애 시나리오 분석",
      "성능과 일관성 트레이드오프",
      "각 서비스의 특성별 최적 패턴 분석",
      "모니터링/디버깅 고려",
    ],
    expectedTopics: [
      "Saga",
      "Orchestration",
      "Choreography",
      "이벤트 소싱",
      "보상 트랜잭션",
      "멱등성",
    ],
    whyControversial: "Orchestration 지지자(명확한 플로우) vs Choreography 지지자(느슨한 결합)의 철학적 차이",
  },

  // ============================================
  // 9. 기술 부채 우선순위 (Methodology - Medium Controversy)
  // ============================================
  {
    id: "tech-debt-prioritization",
    name: "기술 부채 상환 우선순위",
    category: "methodology",
    difficulty: "medium",
    controversyLevel: "medium",
    question: `스타트업 CTO로서 기술 부채 상환 우선순위를 정해야 합니다.

현재 기술 부채 목록:
1. 테스트 커버리지 15% → 60% (예상: 3개월)
2. Python 2 → Python 3 마이그레이션 (예상: 2개월, 보안 이슈)
3. 모놀리스 일부 → 마이크로서비스 분리 (예상: 4개월)
4. jQuery → React 전환 (예상: 3개월)
5. 수동 배포 → CI/CD 파이프라인 (예상: 1개월)
6. 문서화 부재 → API 문서 + 아키텍처 문서 (예상: 1개월)

제약:
- 개발자: 5명 (신규 기능도 개발해야 함)
- 기술 부채에 쓸 수 있는 시간: 전체의 30%
- 6개월 후 시리즈 A 투자 유치 예정 (기술 실사 있음)
- 신규 기능 로드맵도 빡빡함

어떤 순서로 해결해야 할까요? 일부는 포기해야 할 수도 있습니다.`,
    context: "기술 부채 상환은 항상 비즈니스와 충돌하며, '올바른' 우선순위는 맥락에 따라 다름",
    evaluationCriteria: [
      "비즈니스 임팩트 분석",
      "리스크 평가 (Python 2 보안)",
      "의존성 분석 (CI/CD가 다른 작업에 영향)",
      "투자 유치 실사 고려",
      "현실적인 타임라인",
      "포기 결정의 합리성",
    ],
    expectedTopics: [
      "Python 2 EOL",
      "CI/CD",
      "테스트 커버리지",
      "기술 실사",
      "점진적 개선",
      "ROI",
    ],
    whyControversial: "테스트 우선 vs 인프라 우선 vs 보안 우선 등 다양한 철학이 충돌. '모놀리스 분리가 정말 필요한가'도 논쟁적",
  },

  // ============================================
  // 10. 장애 원인 분석 (Debugging - Expert)
  // ============================================
  {
    id: "production-incident-analysis",
    name: "프로덕션 장애 원인 분석",
    category: "debugging",
    difficulty: "expert",
    controversyLevel: "medium",
    question: `어젯밤 프로덕션에서 30분간 전체 장애가 발생했습니다.

타임라인:
- 23:00 - 배포 (작은 버그 수정, 코드 5줄 변경)
- 23:15 - 정상 동작 확인 후 퇴근
- 02:30 - 알림: API 응답 시간 급증 (평균 200ms → 5초)
- 02:35 - 알림: 에러율 급증 (0.1% → 30%)
- 02:40 - 알림: 데이터베이스 CPU 100%
- 02:45 - 온콜 담당자 접속, 서버 재시작 시도 → 효과 없음
- 03:00 - 배포 롤백 → 5분 후 정상화

로그 분석 결과:
- 특정 API 엔드포인트(/api/reports)에 요청 집중
- 해당 엔드포인트는 배포에서 변경되지 않음
- 배포 내용: 로그인 페이지 문구 수정

추가 정보:
- 해당 시간대 트래픽은 평소 1/10 수준
- 데이터베이스 슬로우 쿼리 로그에 새로운 쿼리 패턴 없음
- Redis 정상, 외부 API 정상

원인이 무엇일까요? 어떻게 재발을 방지할 수 있을까요?`,
    context: "프로덕션 장애는 원인이 복합적인 경우가 많고, 여러 가설이 가능함",
    evaluationCriteria: [
      "가설 수립의 논리성",
      "배포와 장애의 상관관계 분석",
      "시간 지연(배포 후 3시간)에 대한 해석",
      "데이터베이스 문제의 근본 원인 추론",
      "재발 방지책의 구체성",
      "모니터링 개선 제안",
    ],
    expectedTopics: [
      "Connection Pool",
      "슬로우 쿼리",
      "인덱스",
      "캐시 만료",
      "스케줄러",
      "모니터링",
    ],
    whyControversial: "원인 추론에 여러 가설이 가능하며, 정보가 불완전한 상황에서 AI들의 추론 능력 차이가 드러날 수 있음",
  },
];

// 카테고리별 요약
export const CATEGORY_SUMMARY = {
  architecture: {
    count: 4,
    cases: ["serverless-vs-container", "monorepo-vs-multirepo", "realtime-sync-architecture", "microservice-communication"],
    description: "시스템 설계 결정. 트레이드오프가 명확하고 학파가 갈리는 영역",
  },
  security: {
    count: 1,
    cases: ["auth-system-design"],
    description: "보안 관련 결정. 리스크 평가가 핵심",
  },
  performance: {
    count: 1,
    cases: ["caching-strategy"],
    description: "성능 최적화. 정량적 분석과 트레이드오프 이해 필요",
  },
  migration: {
    count: 1,
    cases: ["database-migration-strategy"],
    description: "레거시 시스템 현대화. 리스크 관리가 핵심",
  },
  methodology: {
    count: 2,
    cases: ["testing-strategy", "tech-debt-prioritization"],
    description: "개발 방법론. 철학적 차이가 존재하는 영역",
  },
  debugging: {
    count: 1,
    cases: ["production-incident-analysis"],
    description: "장애 분석. 불완전한 정보에서 추론하는 능력 테스트",
  },
};
