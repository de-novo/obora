import type { BenchmarkCase } from '../../types'

export const DECISION_CASES: BenchmarkCase[] = [
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
  {
    id: 'dec-002',
    name: 'Startup Pivot Decision',
    category: 'decision',
    topic: `
B2C app with 50K users, $10K MRR, 18 months runway.
Growth stalled for 6 months.
Options:
A) Double down on marketing (spend $50K)
B) Pivot to B2B with same technology
C) Add premium tier with AI features
D) Seek acqui-hire
Team: 5 engineers, 2 product, 1 marketing.
    `.trim(),
  },
  {
    id: 'dec-003',
    name: 'Pricing Model Change',
    category: 'decision',
    topic: `
SaaS with 500 paying customers.
Current: $49/month flat rate.
Considering: Usage-based pricing.
Data shows:
- 20% of customers use 80% of resources
- Churn rate: 5% monthly
- Support requests correlate with usage
Should we switch to usage-based pricing?
    `.trim(),
  },
  {
    id: 'dec-004',
    name: 'Build vs Buy Decision',
    category: 'decision',
    topic: `
Need video conferencing for our product.
Options:
A) Build on WebRTC (6 months, 2 engineers)
B) Twilio Video ($0.004/min, SDK integration)
C) Daily.co ($0.0026/min, better UX)
D) Jitsi self-hosted (free, DevOps overhead)
Expected usage: 100K minutes/month, growing 20% MoM.
Strategic consideration: Video is not our core value prop.
    `.trim(),
  },
  {
    id: 'dec-005',
    name: 'Investment Decision',
    category: 'decision',
    topic: `
Received term sheets from two VCs:
A) Tier-1 VC: $5M at $20M pre, board seat, 2x liquidation preference
B) Strategic investor: $8M at $25M pre, no board seat, partnership opportunities
Current: $500K ARR, 12 months runway.
Which offer should we accept?
    `.trim(),
  },
  {
    id: 'dec-006',
    name: 'Ethical Dilemma: Whistleblower',
    category: 'decision',
    topic: `
You discovered your company is:
- Misreporting carbon emissions by 30%
- Using this data in marketing materials
- Preparing for an ESG-focused funding round
You have:
- 3 years tenure, significant equity
- Family depending on income
- Evidence documented
What should you do?
    `.trim(),
  },
]
