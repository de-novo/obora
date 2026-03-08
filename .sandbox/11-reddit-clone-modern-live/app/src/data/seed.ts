import type { Post } from '../types'

export const COMMUNITIES = ['All', 'r/designcrit', 'r/startups', 'r/webdev', 'r/sideproject'] as const

export type Community = (typeof COMMUNITIES)[number]

export const SEED_POSTS: Post[] = [
  {
    id: '1',
    title: 'Building a startup MVP in 2 weeks: What actually worked',
    body: 'After months of over-planning, I finally built a functional MVP in just two weeks. The key was cutting scope relentlessly. Instead of building a full-featured platform, I focused on the one core problem my users actually had. This post breaks down the exact process I used to ship fast.',
    author: {
      id: 'user-1',
      name: 'Sarah Chen',
    },
    category: 'r/startups',
    tags: ['MVP', 'productivity', 'lean-startup'],
    createdAt: '2026-03-07T14:30:00Z',
    upvotes: 42,
    downvotes: 3,
  },
  {
    id: '2',
    title: 'Color theory basics every developer should know',
    body: 'Understanding color fundamentals can transform your designs from "meh" to memorable. This guide covers the 60-30-10 rule, contrast ratios for accessibility, and how to build a cohesive palette from scratch.',
    author: {
      id: 'user-2',
      name: 'Alex Rivera',
    },
    category: 'r/designcrit',
    tags: ['color-theory', 'UI', 'design'],
    createdAt: '2026-03-07T12:15:00Z',
    upvotes: 28,
    downvotes: 1,
  },
  {
    id: '3',
    title: 'Modern React patterns you should be using in 2026',
    body: 'React 19 introduced several new patterns that can simplify your code. Server Actions, useOptimistic, and the new use() hook are game changers. Here is how to leverage them effectively.',
    author: {
      id: 'user-3',
      name: 'Jordan Lee',
    },
    category: 'r/webdev',
    tags: ['react', 'javascript', 'patterns'],
    createdAt: '2026-03-06T18:45:00Z',
    upvotes: 67,
    downvotes: 5,
  },
  {
    id: '4',
    title: 'Turned my weekend project into a $500/month side income',
    body: 'What started as a simple tool to solve my own problem now generates recurring revenue. The journey from idea to first dollar was messy, but taught me valuable lessons about validation and pricing.',
    author: {
      id: 'user-4',
      name: 'Taylor Kim',
    },
    category: 'r/sideproject',
    tags: ['monetization', 'indie-hacking', 'case-study'],
    createdAt: '2026-03-06T09:20:00Z',
    upvotes: 89,
    downvotes: 2,
  },
]
