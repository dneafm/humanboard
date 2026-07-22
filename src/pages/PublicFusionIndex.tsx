import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Calendar, Mail, Layers, ArrowUpRight, Check, FileText, Compass } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fetchPublicNotes, type PublicNote } from '../lib/publicEngagement';

type PublicFusionCard = {
  id: string;
  title: string;
  summary: string;
  type: string;
  audience: string;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  authorBio: string;
  viewCount?: number;
  likeCount?: number;
  liked?: boolean;
};

type FeedItem =
  | (PublicFusionCard & { _kind: 'fusion' })
  | (PublicNote & { _kind: 'note' });

type Filter = 'all' | 'posts' | 'notes';

export default function PublicFusionIndexPage() {
  const [fusions, setFusions] = useState<PublicFusionCard[]>([]);
  const [notes, setNotes] = useState<PublicNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [subscribePending, setSubscribePending] = useState(false);

  useEffect(() => {
    document.title = 'HumanBoard Publication';
    let canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = window.location.origin.replace(/^http:/, 'https:') + '/shared';
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch('/api/public/fusions').then((r) => r.ok ? r.json() : { fusions: [] }),
      fetchPublicNotes().catch(() => ({ notes: [] as PublicNote[] })),
    ])
      .then(([fusionsPayload, notesPayload]) => {
        if (cancelled) return;
        setFusions(fusionsPayload.fusions || []);
        setNotes(notesPayload.notes || []);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load feed.');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Merge + sort by createdAt desc
  const items: FeedItem[] = useMemo(() => {
    const merged: FeedItem[] = [
      ...fusions.map((f) => ({ ...f, _kind: 'fusion' as const })),
      ...notes.map((n) => ({ ...n, _kind: 'note' as const })),
    ];
    merged.sort((a, b) => {
      const aDate = a.createdAt || '';
      const bDate = b.createdAt || '';
      return bDate.localeCompare(aDate);
    });
    if (filter === 'posts') return merged.filter((it) => it._kind === 'fusion');
    if (filter === 'notes') return merged.filter((it) => it._kind === 'note');
    return merged;
  }, [fusions, notes, filter]);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center p-6 text-stone-500 dark:text-stone-400">
        <div className="w-10 h-10 border-2 border-stone-300 dark:border-stone-850 border-t-stone-900 dark:border-t-stone-100 rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium tracking-wide uppercase">Loading feed...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mb-6">
          <BookOpen className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100 mb-2">Failed to load feed</h1>
        <p className="text-stone-500 dark:text-stone-400 max-w-md mb-8 leading-relaxed">{error}</p>
        <Link
          to="/shared/profile"
          className="inline-flex items-center gap-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-6 py-2.5 rounded-xl hover:scale-105 active:scale-95 transition-all text-sm font-semibold"
        >
          View profile
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50/70 dark:bg-stone-950 text-stone-800 dark:text-stone-300 font-sans selection:bg-stone-900/10 dark:selection:bg-white/10 transition-colors duration-300">
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-stone-950/80 backdrop-blur-md border-b border-stone-200/60 dark:border-stone-900/60">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/shared/profile" className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-stone-900 dark:text-stone-100" />
            <span className="font-serif text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100">
              HumanBoard Publication
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              to="/shared/profile"
              className="text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
            >
              Profile
            </Link>
            <Link
              to="/shared/discover"
              className="text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors flex items-center gap-1"
            >
              <Compass className="w-3 h-3" />
              Discover
            </Link>
            <a
              href="/feed.xml"
              className="text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
              title="RSS feed"
            >
              RSS
            </a>
            <a href="/" className="text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors">
              Workspace
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12 md:py-16">
        <div className="mb-10">
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-stone-500 dark:text-stone-400 mb-4">
            Feed
          </div>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-stone-950 dark:text-stone-50 mb-4 leading-[1.1] tracking-tight">
            All published
          </h1>
          <p className="text-base text-stone-600 dark:text-stone-400 leading-relaxed">
            Posts and short notes from the author. Most recent first.
          </p>
          <div className="mt-5 text-xs text-stone-500 dark:text-stone-500">
            {fusions.length} {fusions.length === 1 ? 'post' : 'posts'}
            {' · '}
            {notes.length} {notes.length === 1 ? 'note' : 'notes'}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 border-b border-stone-200 dark:border-stone-800 mb-6">
          {([
            { value: 'all' as Filter, label: 'All', count: fusions.length + notes.length },
            { value: 'posts' as Filter, label: 'Posts', count: fusions.length },
            { value: 'notes' as Filter, label: 'Notes', count: notes.length },
          ]).map((tab) => {
            const active = filter === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setFilter(tab.value)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? 'border-stone-900 dark:border-stone-100 text-stone-900 dark:text-stone-100'
                    : 'border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
                }`}
              >
                {tab.label}
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${active ? 'bg-stone-200/60 dark:bg-stone-800/60' : 'bg-stone-100 dark:bg-stone-900/50'}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 dark:border-stone-900 bg-white dark:bg-stone-900/20 p-12 text-center">
            <BookOpen className="w-10 h-10 text-stone-300 dark:text-stone-700 mx-auto mb-4" />
            <h3 className="font-serif text-lg font-semibold text-stone-900 dark:text-stone-100 mb-2">
              {filter === 'all' ? 'No posts or notes yet' : filter === 'posts' ? 'No posts yet' : 'No notes yet'}
            </h3>
            <p className="text-sm text-stone-500 dark:text-stone-400 max-w-md mx-auto leading-relaxed">
              {filter === 'all'
                ? 'When something is published, it shows up here.'
                : `Switch the filter to see ${filter === 'posts' ? 'notes' : 'posts'}.`}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {items.map((item) =>
              item._kind === 'fusion' ? (
                <article
                  key={`fusion-${item.id}`}
                  className="rounded-2xl border border-stone-200/60 dark:border-stone-900/60 bg-white dark:bg-stone-900/20 p-6 hover:border-stone-300 dark:hover:border-stone-800 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-3 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-600">
                    <span className="px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
                      {item.type}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <Link
                    to={`/shared/fusion/${item.id}`}
                    className="block group"
                  >
                    <h2 className="font-serif text-xl font-bold text-stone-900 dark:text-stone-100 leading-tight group-hover:text-stone-950 dark:group-hover:text-white transition-colors mb-2">
                      {item.title}
                    </h2>
                    {item.summary && (
                      <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed line-clamp-3 mb-3">
                        {item.summary}
                      </p>
                    )}
                  </Link>
                  <div className="flex items-center gap-3 text-xs text-stone-500 dark:text-stone-500">
                    <span>by {item.authorName}</span>
                    <Link
                      to={`/shared/fusion/${item.id}`}
                      className="ml-auto inline-flex items-center gap-1 font-bold uppercase tracking-widest text-stone-700 dark:text-stone-200 hover:text-stone-950 dark:hover:text-white transition-colors"
                    >
                      Read post <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </div>
                </article>
              ) : (
                <article
                  key={`note-${item.id}`}
                  className="rounded-2xl border border-amber-200/60 dark:border-amber-900/30 bg-amber-50/30 dark:bg-amber-950/10 p-5 hover:border-amber-300 dark:hover:border-amber-800/60 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-3 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    <FileText className="w-3 h-3" />
                    <span>Note</span>
                    <span className="text-stone-400 dark:text-stone-600 font-normal normal-case">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <Link to={`/shared/notes/${item.id}`} className="block text-stone-800 dark:text-stone-200 leading-relaxed whitespace-pre-wrap break-words">
                    {item.content}
                  </Link>
                  <div className="mt-3 flex items-center gap-3 text-xs text-stone-500 dark:text-stone-500">
                    <span>by {item.authorName}</span>
                    <Link
                      to={`/shared/notes/${item.id}`}
                      className="ml-auto inline-flex items-center gap-1 font-bold uppercase tracking-widest text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 transition-colors"
                    >
                      Read note <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </div>
                </article>
              )
            )}
          </div>
        )}

        {/* Subscribe Section */}
        <section id="subscribe-section" className="bg-stone-100/50 dark:bg-stone-900/20 p-8 md:p-12 rounded-3xl border border-stone-200/60 dark:border-stone-900/60 text-center my-16 max-w-2xl mx-auto shadow-sm">
          <Mail className="w-8 h-8 text-stone-400 dark:text-stone-600 mx-auto mb-4" />
          <h3 className="font-serif text-2xl font-bold text-stone-950 dark:text-stone-50 mb-2">Subscribe to Fusions</h3>
          <p className="text-stone-500 dark:text-stone-400 text-sm max-w-sm mx-auto mb-6 leading-relaxed">
            Consolidated strategic insights, the principles, and project directions delivered directly to your inbox.
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
        <p className="mt-2">
          Powered by <a href="/" className="underline hover:text-stone-700 dark:hover:text-stone-300">HumanBoard Workspace</a>
        </p>
      </footer>
    </div>
  );
}
