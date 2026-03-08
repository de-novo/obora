import { COMMUNITIES } from '../data/seed'
import type { Community } from '../data/seed'

interface SidebarProps {
  selectedCommunity: Community | null
  onSelectCommunity: (community: Community | null) => void
}

export default function Sidebar({ selectedCommunity, onSelectCommunity }: SidebarProps) {
  return (
    <aside className="sidebar">
      <h2>Communities</h2>
      <ul>
        {COMMUNITIES.map((community) => (
          <li key={community}>
            <button
              data-testid="community-pill"
              data-community={community}
              onClick={() => onSelectCommunity(community === 'All' ? null : community)}
              className={selectedCommunity === community || (selectedCommunity === null && community === 'All') ? 'active' : ''}
            >
              {community}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
