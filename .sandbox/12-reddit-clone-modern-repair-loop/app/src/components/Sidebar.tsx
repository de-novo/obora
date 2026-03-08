import { Community } from '../types';

interface SidebarProps {
  activeCommunity: Community;
  onSelectCommunity: (community: Community) => void;
}

const COMMUNITIES: Community[] = ['All', 'r/designcrit', 'r/startups', 'r/webdev', 'r/sideproject'];

const COMMUNITY_LABELS: Record<Community, string> = {
  'All': 'All Posts',
  'r/designcrit': 'r/designcrit',
  'r/startups': 'r/startups',
  'r/webdev': 'r/webdev',
  'r/sideproject': 'r/sideproject',
};

export function Sidebar({ activeCommunity, onSelectCommunity }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">Communities</div>
      {COMMUNITIES.map((community) => (
        <button
          key={community}
          className={`community-pill ${activeCommunity === community ? 'active' : ''}`}
          onClick={() => onSelectCommunity(community)}
          data-testid="community-pill"
          data-community={community}
        >
          <div className="community-icon">
            {community === 'All' ? '🏠' : community.slice(1, 2).toUpperCase()}
          </div>
          <span>{COMMUNITY_LABELS[community]}</span>
        </button>
      ))}
    </aside>
  );
}
