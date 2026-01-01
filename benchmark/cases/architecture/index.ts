import type { BenchmarkCase } from '../../types'

export const ARCHITECTURE_CASES: BenchmarkCase[] = [
  {
    id: 'arch-001',
    name: 'Microservices vs Monolith',
    category: 'architecture',
    topic: `
B2B SaaS startup (Series A, 5 developers).
Currently running a monolithic Node.js backend. Should we migrate to microservices?
10 enterprise clients, 5,000 MAU, $25,000 monthly revenue.
    `.trim(),
  },
  {
    id: 'arch-002',
    name: 'Serverless vs Container',
    category: 'architecture',
    topic: `
B2B SaaS with variable traffic patterns (10x spikes during business hours).
3 developers, no dedicated DevOps. Current stack: Node.js + PostgreSQL.
Need to decide: AWS Lambda vs ECS Fargate.
Budget: $3,000/month for infrastructure.
    `.trim(),
  },
  {
    id: 'arch-003',
    name: 'Monorepo vs Multi-repo',
    category: 'architecture',
    topic: `
Growing startup with 15 developers across 3 teams.
Currently using multi-repo setup (12 repositories).
Considering migration to monorepo (Turborepo/Nx).
Pain points: dependency management, cross-repo changes, CI/CD complexity.
    `.trim(),
  },
  {
    id: 'arch-004',
    name: 'Realtime Sync Architecture',
    category: 'architecture',
    topic: `
Building a collaborative document editor like Notion.
Expected concurrent users: 50-100 per document.
Requirements:
- Real-time sync with <100ms latency
- Offline support
- Conflict resolution
Options: WebSocket, Firebase, Liveblocks, custom CRDT implementation.
    `.trim(),
  },
  {
    id: 'arch-005',
    name: 'Microservice Communication',
    category: 'architecture',
    topic: `
E-commerce platform with 8 microservices.
Current setup: REST APIs between services.
Issues: cascading failures, high latency for complex operations.
Options:
A) Event-driven with Kafka/RabbitMQ
B) gRPC for sync calls
C) Service mesh (Istio)
D) Hybrid approach
    `.trim(),
  },
  {
    id: 'arch-006',
    name: 'AWS vs Managed Infra for Startup',
    category: 'architecture',
    topic: `
5-person B2B SaaS startup, pre-seed stage.
Stack: Next.js + Node.js + PostgreSQL.
Team composition:
- CTO: 8 years AWS experience (certified solutions architect)
- 4 developers: no DevOps experience

Option A) AWS from day one:
- CTO can handle it
- Full control and flexibility
- Lower cost at scale
- Learning curve for team

Option B) Managed platforms (Vercel + Railway/Render + Neon):
- Zero DevOps overhead
- Team can focus on product
- Higher cost at scale
- Limited customization
- Potential migration later

Considerations:
- Runway: 18 months
- Expected scale: 1,000 users in year 1
- SOC2 compliance needed by month 12
- CTO time is split between coding and infra
    `.trim(),
  },
]
