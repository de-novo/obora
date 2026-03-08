import { useMemo, useState } from "react";

type SortMode = "Hot" | "New" | "Rising";
type VoteValue = -1 | 0 | 1;

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

type CommunityDefinition = {
  name: string;
  accent: string;
};

const communityDefinitions: CommunityDefinition[] = [
  { name: "r/designcrit", accent: "#ff6b3d" },
  { name: "r/startups", accent: "#89ffb8" },
  { name: "r/webdev", accent: "#72a9ff" },
  { name: "r/sideproject", accent: "#ffd166" },
  { name: "r/typography", accent: "#f59cff" },
];

const communityOptions = communityDefinitions.map((community) => community.name);
const communities = ["All", ...communityOptions];
const communityAccentByName = new Map(communityDefinitions.map((community) => [community.name, community.accent]));

const initialPosts: Post[] = [
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
  const absolute = Math.abs(value);
  if (absolute >= 1000) {
    const compact = `${(absolute / 1000).toFixed(absolute >= 10000 ? 0 : 1)}k`;
    return value < 0 ? `-${compact}` : compact;
  }

  return `${value}`;
}

function getVoteNextValue(current: VoteValue, direction: VoteValue) {
  if (current === direction) return 0;
  return direction;
}

function buildPreview(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= 120) return normalized;
  return `${normalized.slice(0, 117)}...`;
}

function sortPosts(items: Post[], mode: SortMode, voteState: Map<string, VoteValue>) {
  const cloned = [...items];

  switch (mode) {
    case "New":
      return cloned;
    case "Rising":
      return cloned.sort((a, b) => b.trend - a.trend);
    case "Hot":
    default:
      return cloned.sort((a, b) => {
        const aScore = a.votes + (voteState.get(a.id) ?? 0) + a.comments;
        const bScore = b.votes + (voteState.get(b.id) ?? 0) + b.comments;
        return bScore - aScore;
      });
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

type VoteControlProps = {
  entityId: string;
  score: number;
  voteValue: VoteValue;
  onVote: (entityId: string, direction: VoteValue) => void;
  compact?: boolean;
};

function VoteControl({ entityId, score, voteValue, onVote, compact = false }: VoteControlProps) {
  return (
    <div className={compact ? "vote-column vote-column--compact" : "vote-column"}>
      <button
        type="button"
        className={voteValue === 1 ? "vote-button is-active-up" : "vote-button"}
        aria-label="Upvote"
        aria-pressed={voteValue === 1}
        onClick={(event) => {
          event.stopPropagation();
          onVote(entityId, 1);
        }}
      >
        <IconArrow direction="up" />
      </button>
      <strong className={voteValue !== 0 ? "vote-score is-active" : "vote-score"}>{formatVotes(score)}</strong>
      <button
        type="button"
        className={voteValue === -1 ? "vote-button is-active-down" : "vote-button"}
        aria-label="Downvote"
        aria-pressed={voteValue === -1}
        onClick={(event) => {
          event.stopPropagation();
          onVote(entityId, -1);
        }}
      >
        <IconArrow direction="down" />
      </button>
    </div>
  );
}

type CommentComposerProps = {
  postId: string;
  postTitle: string;
  onSubmit: (postId: string, body: string) => void;
};

function CommentComposer({ postId, postTitle, onSubmit }: CommentComposerProps) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      key={postId}
      className="comment-composer"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = body.trim();

        if (trimmed.length === 0) {
          setError("댓글 내용을 입력해주세요.");
          return;
        }

        if (trimmed.length > 10000) {
          setError("댓글은 10,000자 이하로 작성해주세요.");
          return;
        }

        setError(null);
        setIsSubmitting(true);
        onSubmit(postId, trimmed);
        setBody("");
        setIsSubmitting(false);
      }}
    >
      <label className="comment-composer__label" htmlFor={`comment-input-${postId}`}>
        Reply to <span>{postTitle}</span>
      </label>
      <textarea
        id={`comment-input-${postId}`}
        key={postId}
        className="comment-composer__textarea"
        placeholder="Add a thoughtful reply, a teardown note, or a product insight..."
        value={body}
        autoFocus
        maxLength={10000}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="comment-composer__footer">
        <span>{body.trim().length}/10000</span>
        <button type="submit" className="solid-button solid-button--small" disabled={isSubmitting}>
          {isSubmitting ? "Posting..." : "Post reply"}
        </button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}

type CreatePostModalProps = {
  communities: string[];
  onClose: () => void;
  onCreate: (payload: { title: string; body: string; community: string; tags: string[] }) => void;
};

function CreatePostModal({ communities: options, onClose, onCreate }: CreatePostModalProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [community, setCommunity] = useState(options[0] ?? "r/designcrit");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-post-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-card__header">
          <div>
            <p className="panel-label">Create a new thread</p>
            <h2 id="create-post-title">Publish a build log or community note</h2>
          </div>
          <button type="button" className="ghost-button ghost-button--small" onClick={onClose}>
            Close
          </button>
        </div>

        <form
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault();

            const trimmedTitle = title.trim();
            const trimmedBody = body.trim();
            const parsedTags = tags
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
              .slice(0, 4);

            if (!options.includes(community)) {
              setError("유효한 커뮤니티를 선택해주세요.");
              return;
            }

            if (trimmedTitle.length < 8) {
              setError("제목은 8자 이상 입력해주세요.");
              return;
            }

            if (trimmedBody.length < 24) {
              setError("본문은 최소 24자 이상 입력해주세요.");
              return;
            }

            setError(null);
            setIsSubmitting(true);
            onCreate({
              title: trimmedTitle,
              body: trimmedBody,
              community,
              tags: parsedTags.length > 0 ? parsedTags : ["Fresh Thread"],
            });
            setIsSubmitting(false);
            onClose();
          }}
        >
          <label className="field-shell">
            <span>Community</span>
            <select value={community} onChange={(event) => setCommunity(event.target.value)}>
              {options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="field-shell">
            <span>Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What are you building, testing, or debating?"
              maxLength={160}
            />
          </label>

          <label className="field-shell field-shell--full">
            <span>Body</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Share context, tradeoffs, results, or the exact thing you want feedback on..."
              maxLength={6000}
            />
          </label>

          <label className="field-shell field-shell--full">
            <span>Tags</span>
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="React, Teardown, Launch Notes"
            />
          </label>

          <div className="modal-form__footer">
            <p className="muted-copy">New posts are inserted at the top and surfaced in New mode immediately.</p>
            <button type="submit" className="solid-button" disabled={isSubmitting}>
              {isSubmitting ? "Publishing..." : "Publish thread"}
            </button>
          </div>

          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </div>
    </div>
  );
}

function App() {
  const [activeCommunity, setActiveCommunity] = useState<string>("All");
  const [sortMode, setSortMode] = useState<SortMode>("Hot");
  const [postItems, setPostItems] = useState<Post[]>(initialPosts);
  const [selectedPostId, setSelectedPostId] = useState<string>(initialPosts[0]?.id ?? "");
  const [voteState, setVoteState] = useState<Map<string, VoteValue>>(() => new Map());
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);

  const filteredPosts = useMemo(() => {
    const base = activeCommunity === "All"
      ? postItems
      : postItems.filter((post) => post.community === activeCommunity);

    return sortPosts(base, sortMode, voteState);
  }, [activeCommunity, postItems, sortMode, voteState]);

  const selectedPost = filteredPosts.find((post) => post.id === selectedPostId)
    ?? postItems.find((post) => post.id === selectedPostId)
    ?? filteredPosts[0]
    ?? postItems[0];

  const activeReaders = useMemo(() => {
    const totalVotes = postItems.reduce((sum, post) => sum + post.votes, 0);
    return `${Math.round(totalVotes / 59)}k`;
  }, [postItems]);

  const totalFreshPosts = `${postItems.length}`;
  const totalLiveLounges = `${liveRooms.length}`;

  const getDisplayScore = (entityId: string, baseScore: number) => baseScore + (voteState.get(entityId) ?? 0);

  const handleVote = (entityId: string, direction: VoteValue) => {
    setVoteState((current) => {
      const next = new Map(current);
      const previousValue = next.get(entityId) ?? 0;
      const nextValue = getVoteNextValue(previousValue as VoteValue, direction);

      if (nextValue === 0) {
        next.delete(entityId);
      } else {
        next.set(entityId, nextValue);
      }

      return next;
    });
  };

  const handleCommentSubmit = (postId: string, body: string) => {
    const nextComment: Comment = {
      id: crypto.randomUUID(),
      author: "u/threaded-builder",
      flair: "Iteration 1",
      score: 1,
      time: "just now",
      body,
    };

    setPostItems((current) => current.map((post) => {
      if (post.id !== postId) return post;

      return {
        ...post,
        comments: post.comments + 1,
        commentsThread: [nextComment, ...post.commentsThread],
      };
    }));
  };

  const handleCreatePost = (payload: { title: string; body: string; community: string; tags: string[] }) => {
    const nextPost: Post = {
      id: crypto.randomUUID(),
      community: payload.community,
      accent: communityAccentByName.get(payload.community) ?? "#ff6b3d",
      author: "u/threaded-builder",
      time: "just now",
      title: payload.title,
      body: payload.body,
      tags: payload.tags,
      votes: 1,
      comments: 0,
      awards: 0,
      preview: buildPreview(payload.body),
      trend: 100,
      commentsThread: [],
      featured: false,
    };

    setPostItems((current) => [nextPost, ...current]);
    setActiveCommunity(payload.community);
    setSortMode("New");
    setSelectedPostId(nextPost.id);
  };

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
          <button type="button" className="ghost-button" onClick={() => setIsCreatePostOpen(true)}>
            Create post
          </button>
          <button type="button" className="solid-button">Join lounge</button>
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
            <strong>{activeReaders}</strong>
            <span>active readers</span>
          </div>
          <div>
            <strong>{totalFreshPosts}</strong>
            <span>threads in this session</span>
          </div>
          <div>
            <strong>{totalLiveLounges}</strong>
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
                  type="button"
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
              <button type="button" className="composer-input" onClick={() => setIsCreatePostOpen(true)}>
                Share a build log, teardown, or launch note…
              </button>
              <div className="composer-actions">
                <button type="button">Image</button>
                <button type="button">Poll</button>
                <button type="button">Link</button>
                <button type="button">AMA</button>
              </div>
            </div>
          </div>

          <div className="feed-toolbar card-panel">
            <div className="sort-switcher" role="tablist" aria-label="Sort posts">
              {(["Hot", "New", "Rising"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
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
                <VoteControl
                  entityId={post.id}
                  score={getDisplayScore(post.id, post.votes)}
                  voteValue={voteState.get(post.id) ?? 0}
                  onVote={handleVote}
                />

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
                    <button type="button">{formatVotes(post.comments)} comments</button>
                    <button type="button">{post.awards} awards</button>
                    <button type="button">Share</button>
                    <button type="button">Save</button>
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
              <button
                type="button"
                className="ghost-button ghost-button--small"
                onClick={() => {
                  if (!selectedPost) return;
                  document.getElementById(`comment-input-${selectedPost.id}`)?.focus();
                }}
              >
                Reply
              </button>
            </div>

            {selectedPost ? (
              <CommentComposer
                key={selectedPost.id}
                postId={selectedPost.id}
                postTitle={selectedPost.title}
                onSubmit={handleCommentSubmit}
              />
            ) : null}

            <div className="comment-list">
              {selectedPost?.commentsThread.length ? (
                selectedPost.commentsThread.map((comment) => (
                  <article key={comment.id} className="comment-card">
                    <div className="comment-card__vote">
                      <VoteControl
                        entityId={comment.id}
                        score={getDisplayScore(comment.id, comment.score)}
                        voteValue={voteState.get(comment.id) ?? 0}
                        onVote={handleVote}
                        compact
                      />
                    </div>
                    <div className="comment-card__body">
                      <div className="comment-meta">
                        <strong>{comment.author}</strong>
                        {comment.flair ? <span className="comment-flair">{comment.flair}</span> : null}
                        <span>{comment.time}</span>
                        <span>{formatVotes(getDisplayScore(comment.id, comment.score))} pts</span>
                      </div>
                      <p>{comment.body}</p>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-comments">
                  <strong>No comments yet</strong>
                  <p>Be the first person to add context, a counterpoint, or a build note.</p>
                </div>
              )}
            </div>
          </section>
        </aside>
      </main>

      {isCreatePostOpen ? (
        <CreatePostModal
          communities={communityOptions}
          onClose={() => setIsCreatePostOpen(false)}
          onCreate={handleCreatePost}
        />
      ) : null}
    </div>
  );
}

export default App;
