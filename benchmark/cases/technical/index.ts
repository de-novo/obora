import type { BenchmarkCase } from '../../types'

export const TECHNICAL_CASES: BenchmarkCase[] = [
  {
    id: 'tech-001',
    name: 'Database Migration Strategy',
    category: 'technical',
    topic: `
MySQL 5.7, 500GB data, 50 stored procedures, slow JOINs causing issues.
Options:
A) MySQL 8 upgrade + Read Replicas
B) PostgreSQL migration
C) Add Redis caching layer
D) NewSQL (PlanetScale/TiDB)
    `.trim(),
  },
  {
    id: 'tech-002',
    name: 'Caching Strategy',
    category: 'technical',
    topic: `
E-commerce platform with 100K daily users.
Current pain point: Product listing page takes 2-3 seconds.
Database: PostgreSQL, 10M products.
Options:
A) Redis caching layer
B) CDN + edge caching
C) Database query optimization
D) Elasticsearch for product search
    `.trim(),
  },
  {
    id: 'tech-003',
    name: 'Testing Strategy',
    category: 'technical',
    topic: `
Fintech startup with critical payment processing.
Current: 60% unit test coverage, no E2E tests.
Team: 8 developers, 1 QA.
Budget constraint: Can't hire more QA.
Need to decide testing strategy to improve reliability.
    `.trim(),
  },
  {
    id: 'tech-004',
    name: 'Tech Debt Prioritization',
    category: 'technical',
    topic: `
Legacy codebase (5 years old), 200K lines of code.
Major tech debt items:
A) Migrate from Express to Fastify (performance)
B) Replace moment.js with date-fns (bundle size)
C) Upgrade React 16 to 18 (features)
D) Refactor authentication module (security)
E) Add TypeScript strict mode (reliability)
Limited capacity: Can only tackle 2 items this quarter.
    `.trim(),
  },
  {
    id: 'tech-005',
    name: 'Production Incident Analysis',
    category: 'technical',
    topic: `
Incident: 2-hour outage during peak hours.
Root cause: Database connection pool exhausted.
Contributing factors:
- Slow query blocking connections
- No connection timeout configured
- Missing circuit breaker
- Alert threshold too high
Need to prioritize remediation actions.
    `.trim(),
  },
]
