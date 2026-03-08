export interface Post {
  id: string;
  title: string;
  body: string;
  community: string;
  author: string;
  createdAt: string;
  votes: number;
  userVote?: 1 | -1 | 0;
  commentCount: number;
}

export interface Community {
  id: string;
  name: string;
  displayName: string;
  memberCount: number;
  description: string;
  iconColor: string;
}

export interface VoteState {
  score: number;
  userVote: 1 | -1 | 0;
}

export type CommunityFilter = 'All' | 'r/designcrit' | 'r/startups' | 'r/webdev' | 'r/sideproject';

export interface TrendingTopic {
  rank: number;
  title: string;
  posts: number;
  community: string;
}
