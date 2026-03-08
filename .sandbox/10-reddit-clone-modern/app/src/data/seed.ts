import { Post, Community, TrendingTopic } from '../types';

export const communities: Community[] = [
  {
    id: 'designcrit',
    name: 'r/designcrit',
    displayName: 'r/designcrit',
    memberCount: 284000,
    description: 'Constructive design feedback and critique',
    iconColor: '#FF4500'
  },
  {
    id: 'startups',
    name: 'r/startups',
    displayName: 'r/startups',
    memberCount: 892000,
    description: 'News, advice and support for startup founders',
    iconColor: '#0079D3'
  },
  {
    id: 'webdev',
    name: 'r/webdev',
    displayName: 'r/webdev',
    memberCount: 520000,
    description: 'Web development news, articles and discussion',
    iconColor: '#46D160'
  },
  {
    id: 'sideproject',
    name: 'r/sideproject',
    displayName: 'r/sideproject',
    memberCount: 187000,
    description: 'Show off your side projects and get feedback',
    iconColor: '#FF4500'
  }
];

export const initialPosts: Post[] = [
  {
    id: '1',
    title: 'Landing page critique — feedback needed on hero section',
    body: 'Just launched a new landing page for my SaaS. The hero section feels a bit off but I can\'t put my finger on it. Would love some feedback on the CTA placement and overall visual hierarchy.',
    community: 'r/designcrit',
    author: 'ux_dan',
    createdAt: '2 hours ago',
    votes: 47,
    userVote: 0,
    commentCount: 23
  },
  {
    id: '2',
    title: 'My MVP just crossed $1k MRR — here\'s what I learned',
    body: 'After 6 months of building on the side, my tiny B2B tool finally hit $1,000 in monthly recurring revenue. Here\'s the unfiltered reality: the product is ugly, support is exhausting, and I wouldn\'t trade it for anything.',
    community: 'r/startups',
    author: 'bootstrapper_jane',
    createdAt: '5 hours ago',
    votes: 312,
    userVote: 0,
    commentCount: 89
  },
  {
    id: '3',
    title: 'Why I switched from styled-components to vanilla CSS',
    body: 'After 3 years of building components with styled-components, I\'m going back to plain CSS files. Here\'s why: simpler debugging, no runtime overhead, and my team actually understands what\'s happening.',
    community: 'r/webdev',
    author: 'css_purist',
    createdAt: '8 hours ago',
    votes: 156,
    userVote: 0,
    commentCount: 67
  },
  {
    id: '4',
    title: 'Built a habit tracker in 48 hours — AMA',
    body: 'Weekend hackathon result: a minimal habit tracker with local storage, dark mode, and zero dependencies. Actually usable. Screenshots in comments.',
    community: 'r/sideproject',
    author: 'weekend_warrior',
    createdAt: '12 hours ago',
    votes: 89,
    userVote: 0,
    commentCount: 34
  }
];

export const trendingTopics: TrendingTopic[] = [
  { rank: 1, title: 'AI startup valuations', posts: 1240, community: 'r/startups' },
  { rank: 2, title: 'CSS-in-JS alternatives', posts: 892, community: 'r/webdev' },
  { rank: 3, title: 'Portfolio critiques', posts: 654, community: 'r/designcrit' },
  { rank: 4, title: 'Launch day strategies', posts: 421, community: 'r/startups' },
  { rank: 5, title: 'Solo dev tools', posts: 378, community: 'r/sideproject' }
];

export const communityFilters = ['All', 'r/designcrit', 'r/startups', 'r/webdev', 'r/sideproject'] as const;
