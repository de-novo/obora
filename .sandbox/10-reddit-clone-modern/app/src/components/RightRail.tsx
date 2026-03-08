import { trendingTopics } from '../data/seed';

export function RightRail() {
  return (
    <aside className="right-rail">
      <div className="trending-card">
        <div className="trending-header">
          <h2 className="trending-title">Trending Today</h2>
        </div>
        <ul className="trending-list">
          {trendingTopics.map((topic) => (
            <li key={topic.rank}>
              <a href={`/?community=${topic.community}`} className="trending-item">
                <div className="trending-rank">{topic.rank}</div>
                <div className="trending-content">
                  <span className="trending-community">{topic.community}</span>
                  <span className="trending-topic">{topic.title}</span>
                  <span className="trending-posts">{topic.posts.toLocaleString()} posts</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div className="promo-card">
        <div className="promo-content">
          <h3 className="promo-title">Reddit Premium</h3>
          <p className="promo-text">
            The best Reddit experience with monthly coins
          </p>
          <button className="promo-button">Try Now</button>
        </div>
      </div>
      <footer className="right-rail-footer">
        <div className="footer-links">
          <a href="#" className="footer-link">User Agreement</a>
          <a href="#" className="footer-link">Privacy Policy</a>
          <a href="#" className="footer-link">Content Policy</a>
        </div>
        <p className="footer-copy">
          Reddit Mini © 2024. All rights reserved.
        </p>
      </footer>
      <style>{`
        .right-rail {
          position: sticky;
          top: 20px;
          width: 312px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .trending-card {
          background-color: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          overflow: hidden;
        }

        .trending-header {
          padding: 12px 16px;
          border-bottom: 1px solid var(--color-border-subtle);
          background: linear-gradient(90deg, var(--color-accent-primary), var(--color-accent-secondary));
        }

        .trending-title {
          font-size: 14px;
          font-weight: 700;
          color: #fff;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .trending-list {
          list-style: none;
          padding: 8px 0;
        }

        .trending-item {
          display: flex;
          gap: 12px;
          padding: 10px 16px;
          text-decoration: none;
          transition: background-color var(--transition-fast);
        }

        .trending-item:hover {
          background-color: var(--color-bg-hover);
        }

        .trending-rank {
          font-size: 18px;
          font-weight: 700;
          color: var(--color-text-muted);
          min-width: 20px;
        }

        .trending-content {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .trending-community {
          font-size: 11px;
          font-weight: 500;
          color: var(--color-text-secondary);
        }

        .trending-topic {
          font-size: 14px;
          font-weight: 500;
          color: var(--color-text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .trending-posts {
          font-size: 12px;
          color: var(--color-text-muted);
        }

        .promo-card {
          background-color: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          padding: 16px;
        }

        .promo-content {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .promo-title {
          font-size: 16px;
          font-weight: 700;
          color: var(--color-text-primary);
        }

        .promo-text {
          font-size: 13px;
          color: var(--color-text-secondary);
          line-height: 1.5;
        }

        .promo-button {
          margin-top: 8px;
          padding: 10px 20px;
          background-color: var(--color-text-primary);
          color: var(--color-bg-primary);
          font-weight: 600;
          font-size: 14px;
          border-radius: 20px;
          transition: all var(--transition-fast);
        }

        .promo-button:hover {
          background-color: var(--color-text-secondary);
        }

        .right-rail-footer {
          padding: 16px 0;
        }

        .footer-links {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 12px;
        }

        .footer-link {
          font-size: 12px;
          color: var(--color-text-secondary);
          text-decoration: none;
        }

        .footer-link:hover {
          text-decoration: underline;
        }

        .footer-copy {
          font-size: 12px;
          color: var(--color-text-muted);
        }

        @media (max-width: 1400px) {
          .right-rail {
            display: none;
          }
        }
      `}</style>
    </aside>
  );
}
