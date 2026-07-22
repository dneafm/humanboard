import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Compass, Heart, Mail, Layers, ArrowUpRight, Check, TrendingUp, Clock, Sparkles, Eye, Plus, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  fetchDiscover,
  getInterestTags,
  addInterestTag,
  removeInterestTag,
  type DiscoverItem,
} from '../lib/publicEngagement';

type Sort = 'trending' | 'latest' | 'forYou';

export default function PublicDiscoverPage() {
  const [sort, setSort] = useState<Sort>(() => {
    if (typeof window === 'undefined') return 'trending';
    return (window.localStorage.getItem('humanboard:public:discover-sort') as Sort) || 'trending';
  });
  const [interestTags, setInterestTags] = useState<string[]>([]);
  const [data, setData] = useState<{ items: DiscoverItem[]; count: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTag, setNewTag] = useState('');
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [subscribePending, setSubscribePending] = useState(false);

  useEffect(() => {
    setInterestTags(getInterestTags());
  }, []);

  useEffect(() => {
    document.title = 'Discover - HumanBoard Publication';
    let canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = window.location.origin.replace(/^http:/, 'https:') + '/shared/discover';
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const tagsToSend = sort === 'forYou' ? interestTags : [];
    fetchDiscover({ sort, tags: tagsToSend })
      .then((json) => {
        if (!cancelled) {
          setData({ items: json.items, count: json.count });
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load discover feed.');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sort, interestTags]);

  const handleAddTag = (raw: string) => {
    const tag = raw.toLowerCase().trim().replace(/^#/, '');
    if (!tag) return;
    const next = addInterestTag(tag);
    setInterestTags(next);
    setNewTag('');
  };

  const handleRemoveTag = (tag: string) => {
    const next = removeInterestTag(tag);
    setInterestTags(next);
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || subscribePending) return;
    setSubscribeError(null);
    setSubscribePending(true);
    try {
      const response = await fetch('/api/public/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setSubscribeError(payload?.error || 'Could not subscribe. Please try again.');
        return;
      }
      setSubscribed(true);
      setEmail('');
    } catch (err) {
      setSubscribeError(err instanceof Error ? err.message : 'Network error. Please try again.');
    } finally {
      setSubscribePending(false);
    }
  };

  const switchSort = (next: Sort) => {
    setSort(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('humanboard:public:discover-sort', next);
    }
  };

  const allTags = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const item of data.items) {
      for (const t of item.tags || []) set.add(t.toLowerCase());
    }
    return Array.from(set).sort();
  }, [data]);

  return (
    <div className="min-h-screen bg-stone-50/70 dark:bg-stone-950 text-stone-800 dark:text-stone-300 font-sans selection:bg-stone-900/10 dark:selection:bg-white/10 transition-colors duration-300">
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-stone-950/80 backdrop-blur-md border-b border-stone-200/60 dark:border-stone-900/60">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/shared" className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-stone-900 dark:text-stone-100" />
            <span className="font-serif text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100">
              HumanBoard Publication
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/shared" className="text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors">
              Posts
            </Link>
            <Link to="/shared/notes" className="text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors">
              Notes
            </Link>
            <a href="/feed.xml" className="text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors" title="RSS feed">
              RSS
            </a>
            <a href="/" className="text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors">
              Workspace
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        <div className="mb-8">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-stone-500 dark:text-stone-400 mb-4">
            <Compass className="w-3.5 h-3.5" />
            Discover
          </div>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-stone-950 dark:text-stone-50 mb-4 leading-[1.1] tracking-tight">
            What to read next
          </h1>
          <p className="text-base text-stone-600 dark:text-stone-400 leading-relaxed">
            Trending posts and notes, plus personalized picks based on what you follow.
          </p>
        </div>

        {/* Sort tabs */}
        <div className="flex items-center gap-1 border-b border-stone-200 dark:border-stone-800 mb-6">
          {([
            { value: 'trending' as Sort, label: 'Trending', icon: TrendingUp },
            { value: 'latest' as Sort, label: 'Latest', icon: Clock },
            { value: 'forYou' as Sort, label: 'For you', icon: Sparkles },
          ]).map((tab) => {
            const active = sort === tab.value;
            const Icon = tab.icon;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => switchSort(tab.value)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? 'border-stone-900 dark:border-stone-100 text-stone-900 dark:text-stone-100'
                    : 'border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* For You: interest tags */}
        {sort === 'forYou' && (
          <div className="mb-6 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/30 p-5">
            <div className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-3">
              Your interests
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">
              Add tags you care about. We rank posts and notes that match.
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {interestTags.length === 0 ? (
                <span className="text-xs text-stone-400 dark:text-stone-600 italic">No interests yet. Add some below.</span>
              ) : (
                interestTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs font-medium hover:bg-amber-200 dark:hover:bg-amber-950/60 transition-colors"
                    title={`Remove ${tag}`}
                  >
                    #{tag}
                    <X className="w-3 h-3" />
                  </button>
                ))
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddTag(newTag);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Add an interest (e.g. ai, writing, china)"
                className="flex-1 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-3 py-1.5 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-400 dark:focus:border-stone-700 transition-colors"
              />
              <button
                type="submit"
                disabled={!newTag.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </form>
            {allTags.length > 0 && (
              <div className="mt-4 pt-4 border-t border-stone-200 dark:border-stone-800">
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-500 mb-2">
                  Suggested from posts
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {allTags.slice(0, 12).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleAddTag(tag)}
                      disabled={interestTags.includes(tag)}
                      className="px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-900 text-[10px] font-medium text-stone-600 dark:text-stone-400 border border-stone-200/60 dark:border-stone-800/60 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:text-amber-700 dark:hover:text-amber-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      + #{tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Feed */}
        {loading ? (
          <div className="py-16 text-center">
            <div className="w-10 h-10 border-2 border-stone-300 dark:border-stone-800 border-t-stone-900 dark:border-t-stone-100 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-stone-500 dark:text-stone-400">Loading feed...</p>
          </div>
        ) : error ? (
          <div className="py-12 text-center text-sm text-rose-700 dark:text-rose-300">{error}</div>
        ) : !data || data.items.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 dark:border-stone-900 bg-white dark:bg-stone-900/20 p-12 text-center">
            <Compass className="w-10 h-10 text-stone-300 dark:text-stone-700 mx-auto mb-4" />
            <h3 className="font-serif text-lg font-semibold text-stone-900 dark:text-stone-100 mb-2">
              {sort === 'forYou' && interestTags.length > 0
                ? 'No posts match your interests yet'
                : sort === 'forYou'
                ? 'Add interests to see personalized picks'
                : 'Nothing to show yet'}
            </h3>
            <p className="text-sm text-stone-500 dark:text-stone-400 max-w-md mx-auto leading-relaxed">
              {sort === 'forYou' && interestTags.length > 0
                ? 'Try removing some interests, or switch to Trending.'
                : 'When posts and notes are published, they show up here.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.items.map((item) => (
              <DiscoverCard key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </div>
        )}

        {/* Subscribe Section */}
        <section className="bg-stone-100/50 dark:bg-stone-900/20 p-8 md:p-12 rounded-3xl border border-stone-200/60 dark:border-stone-900/60 text-center my-16 max-w-2xl mx-auto shadow-sm">
          <Mail className="w-8 h-8 text-stone-400 dark:text-stone-600 mx-auto mb-4" />
          <h3 className="font-serif text-2xl font-bold text-stone-950 dark:text-stone-50 mb-2">Subscribe to Fusions</h3>
          <p className="text-stone-500 dark:text-stone-400 text-sm max-w-sm mx-auto mb-6 leading-relaxed">
            Get the full essays and reports in your inbox.
          </p>
          {subscribed ? (
            <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-400 py-3.5 px-6 rounded-xl text-sm font-semibold max-w-md mx-auto">
              ✓ Subscribed! You are now added to the publication list.
            </div>
          ) : (
            <form onSubmit={handleSubscribe} className="flex flex-col gap-3 max-w-md mx-auto">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  required
                  placeholder="Enter your email address..."
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={subscribePending}
                  className="flex-1 bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-850 rounded-xl px-4 py-3 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-400 dark:focus:border-stone-700 transition-colors shadow-inner disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={subscribePending}
                  className="bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-6 py-3 rounded-xl hover:opacity-90 transition-all font-semibold text-sm shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {subscribePending ? 'Subscribing...' : 'Subscribe'}
                </button>
              </div>
              {subscribeError && (
                <div className="text-xs text-rose-700 dark:text-rose-300 text-center">
                  {subscribeError}
                </div>
              )}
              <div className="text-[11px] text-stone-400 dark:text-stone-500 text-center">
                Or use the <a href="/feed.xml" className="underline hover:text-stone-700 dark:hover:text-stone-200">RSS feed</a> in your reader
              </div>
            </form>
          )}
        </section>
      </main>

      <footer className="border-t border-stone-200/60 dark:border-stone-900/60 py-12 text-center text-xs text-stone-500 dark:text-stone-600">
        <p>© {new Date().getFullYear()} HumanBoard Publication. All rights reserved.</p>
      </footer>
    </div>
  );
}

function DiscoverCard({ item }: { item: DiscoverItem }) {
  const isFusion = item.kind === 'fusion';
  const link = isFusion ? `/shared/fusion/${item.id}` : `/shared/notes/${item.id}`;
  const title = isFusion ? (item as any).title : `${(item as any).authorName}'s note`;
  const summary = (item as any).summary || (item as any).content?.slice(0, 220) || '';
  return (
    <Link
      to={link}
      className="group block rounded-2xl border border-stone-200/60 dark:border-stone-900/60 bg-white dark:bg-stone-900/20 p-5 hover:border-stone-300 dark:hover:border-stone-800 hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-2 mb-2 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-600">
        <span className={`px-2 py-0.5 rounded-full ${isFusion ? 'bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800' : 'bg-amber-100 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/30 text-amber-700 dark:text-amber-300'}`}>
          {isFusion ? (item as any).type : 'Note'}
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {formatDistanceToNow(new Date((item as any).createdAt || (item as any).updatedAt), { addSuffix: true })}
        </span>
      </div>
      <h3 className="font-serif text-lg font-bold text-stone-900 dark:text-stone-100 leading-tight group-hover:text-stone-950 dark:group-hover:text-white transition-colors mb-2 line-clamp-2">
        {title}
      </h3>
      {summary && (
        <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed line-clamp-3 mb-3">
          {summary}
        </p>
      )}
      <div className="flex items-center gap-3 text-xs text-stone-500 dark:text-stone-500">
        <span>by {(item as any).authorName}</span>
        <span className="inline-flex items-center gap-1">
          <Heart className="w-3 h-3" />
          {item.likeCount ?? 0}
        </span>
        <span className="inline-flex items-center gap-1">
          <Eye className="w-3 h-3" />
          {item.viewCount ?? 0}
        </span>
        {item.tags && item.tags.length > 0 && (
          <span className="ml-auto inline-flex items-center gap-1">
            {item.tags.slice(0, 2).map((t) => (
              <span key={t} className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-900 text-[9px] font-medium">
                #{t}
              </span>
            ))}
          </span>
        )}
      </div>
    </Link>
  );
}
