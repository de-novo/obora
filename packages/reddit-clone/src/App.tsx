import { useMemo, useState } from "react";

type SortMode = "Hot" | "New" | "Rising";

type Comment = {
  id: string;
  author: string;
  flair?: string;
  score: number;
  time: string;
  body: string;
};

type Post = {
  id: string;
  community: string;
  accent: string;
  author: string;
  time: string;
  title: string;
  body: string;
  tags: string[];
  votes: number;
  comments: number;
  awards: number;
  preview: string;
  trend: number;
  featured?: boolean;
  commentsThread: Comment[];
};

const communities = [
  "All",
  "r/designcrit",
  "r/startups",
  "r/webdev",
  "r/sideproject",
  "r/typography",
];

const posts: Post[] = [
  {
    id: "post-1",
    community: "r/designcrit",
    accent: "#ff6b3d",
    author: "u/velvetgrid",
    time: "2h ago",
    title: "I rebuilt my note-taking dashboard as a magazine-style command center",
    body:
      "Swapped the usual cards for layered editorial panels, compressed metadata into slim ribbons, and made the activity rail feel like a live newsroom. Engagement went up because the page finally has hierarchy.",
    tags: ["Case Study", "UI Audit", "Before/After"],
    votes: 3241,
    comments: 182,
    awards: 12,
    preview: "A split hero with amber highlights, dense story cards, and an always-visible context rail.",
    trend: 96,
    featured: true,
    commentsThread: [
      {
        id: "c1",
        author: "u/semiboldsunday",
        flair: "Design Systems",
        score: 612,
        time: "1h ago",
        body: "The ribbon metadata is smart. It keeps context visible without forcing another sidebar.",
      },
      {
        id: "c2",
        author: "u/inkandpixels",
        score: 288,
        time: "48m ago",
        body: "Big improvement. The old version was clean but forgettable; this one actually has an editorial point of view.",
      },
      {
        id: "c3",
        author: "u/leftraillover",
        flair: "Prototype",
        score: 141,
        time: "29m ago",
        body: "Would love to see how this adapts below tablet widths. The density is great on desktop.",
      },
    ],
  },
  {
    id: "post-2",
    community: "r/startups",
    accent: "#89ffb8",
    author: "u/afterstandup",
    time: "4h ago",
    title: "We stopped shipping endless admin panels and started building one ruthless operator cockpit",
    body:
      "The breakthrough was killing generic dashboards. Now every panel answers a decision: what is stuck, what is risky, and what must be escalated today.",
    tags: ["Ops", "Execution", "Founder Notes"],
    votes: 1893,
    comments: 94,
    awards: 7,
    preview: "A decision-first control room with triage queues, cost heatmaps, and owner assignments.",
    trend: 88,
    commentsThread: [
      {
        id: "c4",
        author: "u/pm-on-call",
        score: 371,
        time: "2h ago",
        body: "This is the real shift. Most dashboards report; the good ones force decisions.",
      },
      {
        id: "c5",
        author: "u/graphpaperclub",
        flair: "B2B SaaS",
        score: 212,
        time: "90m ago",
        body: "Would you share the information architecture? Curious how many metrics survived the cut.",
      },
    ],
  },
  {
    id: "post-3",
    community: "r/webdev",
    accent: "#72a9ff",
    author: "u/cachemewhenyoucan",
    time: "6h ago",
    title: "What finally made my React feed feel fast: fake less, prioritize more",
    body:
      "Instead of animating everything, I highlighted one entrance moment, pre-sized cards, and deferred non-critical chrome. The result feels calmer and faster at the same time.",
    tags: ["React", "Performance", "Frontend"],
    votes: 1422,
    comments: 67,
    awards: 3,
    preview: "Measured motion, preallocated card shells, and no layout jump on media load.",
    trend: 79,
    commentsThread: [
      {
        id: "c6",
        author: "u/suspenseenjoyer",
        score: 184,
        time: "4h ago",
        body: "Pre-sizing content is underrated. Most of perceived speed is just removing visual surprise.",
      },
      {
        id: "c7",
        author: "u/domdepth",
        score: 91,
        time: "3h ago",
        body: "Agree. One strong animation beats ten weak ones.",
      },
    ],
  },
  {
    id: "post-4",
    community: "r/sideproject",
    accent: "#ffd166",
    author: "u/soloandshipping",
    time: "8h ago",
    title: "Built a micro-community app around neighborhood recommendations — users stayed for the story cards",
    body:
      "The lesson wasn't feature depth. It was making every recommendation feel authored by a real person with taste, context, and a reason to trust them.",
    tags: ["Community", "Retention", "Product"],
    votes: 976,
    comments: 51,
    awards: 2,
    preview: "Human context over sterile ranking — recommendation cards that read like local notes.",
    trend: 61,
    commentsThread: [
      {
        id: "c8",
        author: "u/placemaking",
        flair: "Community Ops",
        score: 106,
        time: "5h ago",
        body: "This is why local products need voice, not just utility.",
      },
    ],
  },
];

const liveRooms = [
  { name: "Launch Reviews", members: 214, mood: "Busy" },
  { name: "Design Roast Club", members: 128, mood: "Spicy" },
  { name: "Founders After Dark", members: 89, mood: "Focused" },
];

const trendingTopics = [
  "Editorial UI systems",
  "Agent workflow products",
  "Tiny social apps",
  "Ruthless dashboard design",
  "React feed performance",
];

function formatVotes(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  }

  return `${value}`;
}

function sortPosts(items: Post[], mode: SortMode) {
  const cloned = [...items];
  switch (mode) {
    case "New":
      return cloned.reverse();
    case "Rising":
      return cloned.sort((a, b) => b.trend - a.trend);
    case "Hot":
    default:
      return cloned.sort((a, b) => b.votes + b.comments - (a.votes + a.comments));
  }
}

function LogoMark() {
  return (
    <div className="logo-mark" aria-hidden="true">
      <span className="logo-eye" />
      <span className="logo-eye" />
      <span className="logo-mouth" />
    </div>
  );
}

function IconArrow({ direction }: { direction: "up" | "down" }) {
  return <span className={`vote-arrow vote-arrow--${direction}`} aria-hidden="true" />;
}

function App() {
  const [activeCommunity, setActiveCommunity] = useState<string>("All");
  const [sortMode, setSortMode] = useState<SortMode>("Hot");
  const [selectedPostId, setSelectedPostId] = useState<string>(posts[0]?.id ?? "");

  const filteredPosts = useMemo(() => {
    const base = activeCommunity === "All"
      ? posts
      : posts.filter((post) => post.community === activeCommunity);

    return sortPosts(base, sortMode);
  }, [activeCommunity, sortMode]);

  const selectedPost = filteredPosts.find((post) => post.id === selectedPostId)
    ?? posts.find((post) => post.id === selectedPostId)
    ?? filteredPosts[0]
    ?? posts[0];

  return (
    <div className="threaded-app">
      <div className="ambient ambient--left" />
      <div className="ambient ambient--right" />

      <header className="topbar">
        <div className="brand-block">
          <LogoMark />
          <div>
            <p className="eyebrow">community front page</p>
            <h1>Threaded</h1>
          </div>
        </div>

        <label className="search-shell" aria-label="Search posts and communities">
          <span className="search-shell__icon">⌕</span>
          <input defaultValue="design systems and startup postmortems" />
        </label>

        <div className="topbar-actions">
          <button className="ghost-button">Create post</button>
          <button className="solid-button">Join lounge</button>
        </div>
      </header>

      <section className="hero-card">
        <div>
          <p className="eyebrow">Today’s front page pulse</p>
          <h2>Reddit-style density, rebuilt as an editorial command feed.</h2>
          <p>
            This prototype validates that obora-kit can ship a real project package — not just a sandbox —
            with a live-feeling feed, multi-column layout, and interaction-ready comment surface.
          </p>
        </div>
        <div className="hero-stats">
          <div>
            <strong>128k</strong>
            <span>active readers</span>
          </div>
          <div>
            <strong>412</strong>
            <span>fresh posts</span>
          </div>
          <div>
            <strong>18</strong>
            <span>live lounges</span>
          </div>
        </div>
      </section>

      <main className="content-grid">
        <aside className="left-rail card-panel">
          <section>
            <p className="panel-label">Browse communities</p>
            <div className="community-list">
              {communities.map((community) => (
                <button
                  key={community}
                  className={community === activeCommunity ? "community-pill is-active" : "community-pill"}
                  onClick={() => setActiveCommunity(community)}
                >
                  {community}
                </button>
              ))}
            </div>
          </section>

          <section className="rail-section">
            <p className="panel-label">Pinned shortcuts</p>
            <div className="shortcut-list">
              {[
                "Saved collections",
                "Drafts in progress",
                "My launch checklist",
                "Design feedback swaps",
              ].map((item, index) => (
                <div className="shortcut-item" key={item}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rail-section rail-section--highlight">
            <p className="panel-label">Signal score</p>
            <strong className="signal-score">84 / 100</strong>
            <p className="muted-copy">
              Design and startup communities are over-indexing on systems thinking and practical build logs.
            </p>
          </section>
        </aside>

        <section className="feed-column">
          <div className="composer card-panel">
            <div className="composer-avatar">T</div>
            <div className="composer-body">
              <button className="composer-input">Share a build log, teardown, or launch note…</button>
              <div className="composer-actions">
                <button>Image</button>
                <button>Poll</button>
                <button>Link</button>
                <button>AMA</button>
              </div>
            </div>
          </div>

          <div className="feed-toolbar card-panel">
            <div className="sort-switcher" role="tablist" aria-label="Sort posts">
              {(["Hot", "New", "Rising"] as const).map((option) => (
                <button
                  key={option}
                  className={sortMode === option ? "sort-chip is-active" : "sort-chip"}
                  onClick={() => setSortMode(option)}
                >
                  {option}
                </button>
              ))}
            </div>
            <p className="toolbar-copy">{filteredPosts.length} posts in view</p>
          </div>

          <div className="post-stack">
            {filteredPosts.map((post) => (
              <article
                key={post.id}
                className={selectedPost?.id === post.id ? "post-card is-selected" : "post-card"}
                onClick={() => setSelectedPostId(post.id)}
              >
                <div className="vote-column">
                  <button className="vote-button" aria-label="Upvote">
                    <IconArrow direction="up" />
                  </button>
                  <strong>{formatVotes(post.votes)}</strong>
                  <button className="vote-button" aria-label="Downvote">
                    <IconArrow direction="down" />
                  </button>
                </div>

                <div className="post-body">
                  <div className="post-meta">
                    <span className="community-badge" style={{ borderColor: post.accent, color: post.accent }}>
                      {post.community}
                    </span>
                    <span>{post.author}</span>
                    <span>•</span>
                    <span>{post.time}</span>
                    {post.featured ? <span className="featured-tag">Featured</span> : null}
                  </div>

                  <h3>{post.title}</h3>
                  <p>{post.body}</p>

                  <div className="preview-band" style={{ background: `linear-gradient(135deg, ${post.accent}44, rgba(13,17,23,0.2))` }}>
                    <strong>Preview</strong>
                    <span>{post.preview}</span>
                  </div>

                  <div className="tag-row">
                    {post.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>

                  <div className="post-actions">
                    <button>{formatVotes(post.comments)} comments</button>
                    <button>{post.awards} awards</button>
                    <button>Share</button>
                    <button>Save</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="right-rail">
          <section className="card-panel spotlight-panel">
            <p className="panel-label">Live rooms</p>
            <div className="room-list">
              {liveRooms.map((room) => (
                <div className="room-card" key={room.name}>
                  <div>
                    <strong>{room.name}</strong>
                    <span>{room.members} listening</span>
                  </div>
                  <em>{room.mood}</em>
                </div>
              ))}
            </div>
          </section>

          <section className="card-panel trending-panel">
            <p className="panel-label">Trending discussions</p>
            <ol>
              {trendingTopics.map((topic) => (
                <li key={topic}>{topic}</li>
              ))}
            </ol>
          </section>

          <section className="card-panel comments-panel">
            <div className="comments-panel__header">
              <div>
                <p className="panel-label">Comment thread</p>
                <h3>{selectedPost?.title}</h3>
              </div>
              <button className="ghost-button ghost-button--small">Reply</button>
            </div>

            <div className="comment-list">
              {selectedPost?.commentsThread.map((comment) => (
                <article key={comment.id} className="comment-card">
                  <div className="comment-meta">
                    <strong>{comment.author}</strong>
                    {comment.flair ? <span className="comment-flair">{comment.flair}</span> : null}
                    <span>{comment.time}</span>
                    <span>{formatVotes(comment.score)} pts</span>
                  </div>
                  <p>{comment.body}</p>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}

export default App;
