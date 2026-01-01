import type { BenchmarkCase } from '../../types'

export const SECURITY_CASES: BenchmarkCase[] = [
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
  {
    id: 'sec-002',
    name: 'API Security Strategy',
    category: 'security',
    topic: `
Public API serving 1000+ third-party integrations.
Current issues:
- Rate limiting based on IP (easily bypassed)
- No request signing
- JWT tokens with 24h expiry
Need to improve API security without breaking existing integrations.
    `.trim(),
  },
  {
    id: 'sec-003',
    name: 'Data Encryption Strategy',
    category: 'security',
    topic: `
Healthcare SaaS handling PHI (Protected Health Information).
Requirements:
- HIPAA compliance
- Encryption at rest and in transit
- Key rotation capability
- Audit logging
Current: TLS for transit, no encryption at rest.
Options: AWS KMS, HashiCorp Vault, application-level encryption.
    `.trim(),
  },
  {
    id: 'sec-004',
    name: 'Vulnerability Disclosure Response',
    category: 'security',
    topic: `
Security researcher reported SQL injection vulnerability via HackerOne.
Severity: Critical (database access possible).
Affected: Production system with 50K users.
Researcher is requesting:
- $10,000 bounty (above our max $5,000)
- Public disclosure in 7 days
How should we respond and prioritize remediation?
    `.trim(),
  },
  {
    id: 'sec-005',
    name: 'Zero Trust Implementation',
    category: 'security',
    topic: `
Enterprise with 500 employees, hybrid work environment.
Current: VPN-based access, perimeter security.
Goal: Implement Zero Trust architecture.
Constraints:
- 6-month timeline
- $200K budget
- Minimal disruption to productivity
What should be the phased implementation approach?
    `.trim(),
  },
]
