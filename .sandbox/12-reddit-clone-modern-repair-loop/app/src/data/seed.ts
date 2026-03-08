import { Post } from '../types';

export const seedPosts: Post[] = [
  {
    id: '1',
    title: 'How to get your first 100 users for your SaaS?',
    body: 'I just launched a simple project management tool and I\'m struggling to get early adopters. What strategies have worked for you guys?',
    community: 'r/startups',
    author: 'founder_dan',
    timestamp: new Date('2026-03-07T14:30:00Z'),
    votes: 47,
    userVote: null,
  },
  {
    id: '2',
    title: 'Critique my landing page design - brutal honesty appreciated',
    body: 'Spent the weekend redesigning my portfolio site. Looking for feedback on the hero section and overall typography choices.',
    community: 'r/designcrit',
    author: 'pixel_pusher',
    timestamp: new Date('2026-03-07T12:15:00Z'),
    votes: 23,
    userVote: null,
  },
  {
    id: '3',
    title: 'Just shipped my first side project after 6 months of work',
    body: 'It\'s a simple habit tracker, but I\'m proud of it. Used Next.js and Supabase. Would love any feedback!',
    community: 'r/sideproject',
    author: 'indie_dev_jane',
    timestamp: new Date('2026-03-06T18:45:00Z'),
    votes: 156,
    userVote: null,
  },
  {
    id: '4',
    title: 'Best practices for state management in 2026?',
    body: 'With React 19 out and signals becoming more popular, what\'s everyone using for state management these days? Redux Toolkit, Zustand, or something else?',
    community: 'r/webdev',
    author: 'react_enthusiast',
    timestamp: new Date('2026-03-06T09:20:00Z'),
    votes: 89,
    userVote: null,
  },
];
