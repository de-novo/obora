import { communities } from '../data/seed';

interface SidebarProps {
  activeCommunity: string;
}

export function Sidebar({ activeCommunity }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2 className="sidebar-title">Communities</h2>
      </div>
      <nav className="sidebar-nav">
        <ul className="community-list">
          {communities.map((community) => (
            <li key={community.id}>
              <a
                href={`/?community=${community.name}`}
                className={`community-link ${
                  activeCommunity === community.name ? 'active' : ''
                }`}
              >
                <span
                  className="community-icon"
                  style={{ backgroundColor: community.iconColor }}
                >
                  {community.displayName.charAt(1).toUpperCase()}
                </span>
                <div className="community-info">
                  <span className="community-name">{community.displayName}</span>
                  <span className="community-members">
                    {(community.memberCount / 1000).toFixed(0)}k members
                  </span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <style>{`
        .sidebar {
          position: sticky;
          top: 20px;
          width: 272px;
          padding: 16px 0;
        }

        .sidebar-header {
          padding: 0 16px 12px;
          border-bottom: 1px solid var(--color-border-subtle);
          margin-bottom: 12px;
        }

        .sidebar-title {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--color-text-muted);
        }

        .sidebar-nav {
          padding: 0 8px;
        }

        .community-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .community-link {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: var(--radius-sm);
          color: var(--color-text-primary);
          text-decoration: none;
          transition: background-color var(--transition-fast);
        }

        .community-link:hover {
          background-color: var(--color-bg-hover);
        }

        .community-link.active {
          background-color: var(--color-bg-tertiary);
        }

        .community-icon {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          font-weight: 700;
          font-size: 14px;
          color: #fff;
          flex-shrink: 0;
        }

        .community-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .community-name {
          font-weight: 500;
          font-size: 14px;
        }

        .community-members {
          font-size: 12px;
          color: var(--color-text-secondary);
        }

        @media (max-width: 1200px) {
          .sidebar {
            display: none;
          }
        }
      `}</style>
    </aside>
  );
}
