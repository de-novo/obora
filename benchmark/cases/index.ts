import type { BenchmarkCase } from '../types'

export const CASES: BenchmarkCase[] = [
  // Architecture cases
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

  // Technical cases
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

  // Security cases
  {
    id: 'sec-001',
    name: 'Authentication System Design',
    category: 'security',
    topic: `
Building a new B2B SaaS platform. Need to decide authentication approach.
Requirements:
- Enterprise SSO support (SAML, OIDC)
- MFA mandatory for admin users
- API access for integrations
Options:
A) Build custom auth system
B) Auth0 / Okta
C) Keycloak (self-hosted)
D) AWS Cognito
    `.trim(),
  },

  // Decision cases
  {
    id: 'dec-001',
    name: 'Team Restructuring',
    category: 'decision',
    topic: `
Startup needs to reduce team from 20 to 15 people.
Constraints:
- Must maintain core product development
- Customer support cannot be reduced
- One person is returning from parental leave next month
What criteria should be used for the decision?
    `.trim(),
  },
]
