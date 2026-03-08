export type Community = 'All' | 'r/designcrit' | 'r/startups' | 'r/webdev' | 'r/sideproject';

export interface Post {
  id: string;
  title: string;
  body: string;
  community: Community;
  author: string;
  timestamp: Date;
  votes: number;
  userVote?: 'up' | 'down' | null;
}

export interface CreatePostForm {
  community: Community;
  title: string;
  body: string;
}
