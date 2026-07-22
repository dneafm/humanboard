import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, Calendar, Mail, Layers, ArrowUpRight, Check, Compass, User, Eye, Heart, FileText, Users, TrendingUp, Settings } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { fetchPublicNotes, type PublicNote } from '../lib/publicEngagement';
import { useAuthStore } from '../stores/authStore';

type PublicFusionCard = {
  id: string;
  title: string;
  summary: string;
  type: string;
  createdAt: string;
  authorName: string;
  authorBio?: string;
  viewCount?: number;
  likeCount?: number;
};

type Subscriber = {
  id: string;
  email: string;
  sourceFusionId: string | null;
  subscribedAt: string;
};

type SubscribersData = {
  subscribers: Subscriber[];
  count: number;
  last7Days: number;
  byFusion: Array<{ fusionId: string; count: number; title: string; type: string | null }>;
};

export default function PublicProfilePage() {
  const [fusions, setFusions] = useState<PublicFusionCard[]>([]);
  const [notes, setNotes] = useState<PublicNote[]>([]);
  const [subs, setSubs] = useState<SubscribersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [subscribePending, setSubscribePending] = useState(false);
  const { user } = useAuthStore();

  useEffect(() => {
    document.title = 'Profile - HumanBoard Publication';
    let canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = window.location.origin.replace(/^http:/, 'https:') + '/shared/profile';
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch('/api/public/fusions').then((r) => r.ok ? r.json() : { fusions: [] }),
      fetchPublicNotes().catch(() => ({ notes: [] as PublicNote[] })),
      fetch('/api/admin/subscribers').then((r) => r.ok ? r.json() : { count: 0, subscribers: [], byFusion: [], last7Days: 0 }).catch(() => ({ count: 0, subscribers: [], byFusion: [], last7Days: 0 })),
    ])
      .then(([f, n, s]) => {
        if (cancelled) return;
        setFusions(f.fusions || []);
        setNotes(n.notes || []);
        setSubs(s);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load profile.');
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

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center p-6 text-stone-500 dark:text-stone-400">
        <div className="w-10 h-10 border-2 border-stone-300 dark:border-stone-850 border-t-stone-900 dark:border-t-stone-100 rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium tracking-wide uppercase">Loading profile...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mb-6">
          <User className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100 mb-2">Failed to load profile</h1>
        <p className="text-stone-500 dark:text-stone-400 max-w-md mb-8 leading-relaxed">{error}</p>
      </div>
    );
  }

  // Aggregate stats
  const totalViews = fusions.reduce((sum, f) => sum + (f.viewCount || 0), 0) + notes.reduce((sum, n) => sum + (n.viewCount || 0), 0);
  const totalLikes = fusions.reduce((sum, f) => sum + (f.likeCount || 0), 0) + notes.reduce((sum, n) => sum + (n.likeCount || 0), 0);

  // Author info (from the first fusion with authorName, or from a note, fallback to default)
  const authorFusion = fusions.find((f) => f.authorName && f.authorName !== 'HumanBoard Creator');
  const authorNote = notes.find((n) => n.authorName && n.authorName !== 'HumanBoard Creator');
  const authorName = (authorFusion?.authorName) || (authorNote?.authorName) || 'HumanBoard Creator';
  const authorBio = (authorFusion?.authorBio) || (authorNote?.authorBio) || 'Strategic researcher and intelligence compiler.';
  const initials = authorName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const latestFusions = [...fusions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const latestNotes = [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const recentSubs = (subs?.subscribers || []).slice(0, 5);

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
            <Link
              to="/shared"
              className="text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
            >
              Feed
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

      <main className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        {/* Author hero */}
        <div className="mb-10">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-16 h-16 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-full flex items-center justify-center font-serif text-xl font-semibold shrink-0 shadow-md">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-stone-500 dark:text-stone-400 mb-1">
                Author
              </div>
              <h1 className="font-serif text-3xl md:text-4xl font-bold text-stone-950 dark:text-stone-50 leading-tight tracking-tight">
                {authorName}
              </h1>
            </div>
          </div>
          {authorBio && (
            <p className="text-lg text-stone-600 dark:text-stone-400 font-serif leading-relaxed border-l-2 border-stone-300 dark:border-stone-700 pl-5 italic">
              {authorBio}
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          <StatCard icon={BookOpen} label="Posts" value={fusions.length} />
          <StatCard icon={FileText} label="Notes" value={notes.length} />
          <StatCard icon={Users} label="Subscribers" value={subs?.count ?? 0} />
          <StatCard icon={Eye} label="Total views" value={totalViews} />
        </div>

        {/* Recent posts */}
        {latestFusions.length > 0 && (
          <section className="mb-10">
            <div className="flex items-end justify-between mb-4 border-b border-stone-200/60 dark:border-stone-900/60 pb-2">
              <h2 className="font-serif text-lg font-bold text-stone-950 dark:text-stone-50 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-stone-500" />
                Recent posts
              </h2>
              <Link
                to="/shared"
                className="text-[10px] font-bold uppercase tracking-widest text-stone-700 dark:text-stone-300 hover:text-stone-950 dark:hover:text-stone-50 transition-colors"
              >
                View all <ArrowUpRight className="inline w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-3">
              {latestFusions.map((f) => (
                <Link
                  key={f.id}
                  to={`/shared/fusion/${f.id}`}
                  className="block rounded-xl border border-stone-200/60 dark:border-stone-900/60 bg-white dark:bg-stone-900/20 p-4 hover:border-stone-300 dark:hover:border-stone-800 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-2 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-600">
                    <span className="px-1.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
                      {f.type}
                    </span>
                    <span>{formatDistanceToNow(new Date(f.createdAt), { addSuffix: true })}</span>
                  </div>
                  <h3 className="font-serif font-semibold text-stone-900 dark:text-stone-100 leading-snug mb-1">
                    {f.title}
                  </h3>
                  {f.summary && (
                    <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed line-clamp-2">
                      {f.summary}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Recent notes */}
        {latestNotes.length > 0 && (
          <section className="mb-10">
            <div className="flex items-end justify-between mb-4 border-b border-stone-200/60 dark:border-stone-900/60 pb-2">
              <h2 className="font-serif text-lg font-bold text-stone-950 dark:text-stone-50 flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                Recent notes
              </h2>
              <Link
                to="/shared"
                className="text-[10px] font-bold uppercase tracking-widest text-stone-700 dark:text-stone-300 hover:text-stone-950 dark:hover:text-stone-50 transition-colors"
              >
                View all <ArrowUpRight className="inline w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-3">
              {latestNotes.map((n) => (
                <Link
                  key={n.id}
                  to={`/shared/notes/${n.id}`}
                  className="block rounded-xl border border-amber-200/60 dark:border-amber-900/30 bg-amber-50/30 dark:bg-amber-950/10 p-4 hover:border-amber-300 dark:hover:border-amber-800/60 transition-all"
                >
                  <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed line-clamp-3 mb-2">
                    {n.content}
                  </p>
                  <div className="text-[10px] text-stone-500 dark:text-stone-500">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Subscribers */}
        <section className="mb-10">
          <div className="flex items-end justify-between mb-4 border-b border-stone-200/60 dark:border-stone-900/60 pb-2">
            <h2 className="font-serif text-lg font-bold text-stone-950 dark:text-stone-50 flex items-center gap-2">
              <Users className="w-4 h-4 text-stone-500" />
              Subscribers
              {subs && subs.count > 0 && (
                <span className="text-xs font-normal text-stone-500 dark:text-stone-500">
                  {subs.count} {subs.count === 1 ? 'subscriber' : 'subscribers'}
                  {subs.last7Days > 0 && ` · ${subs.last7Days} new this week`}
                </span>
              )}
            </h2>
            {user && (
              <Link
                to="/subscribers"
                className="text-[10px] font-bold uppercase tracking-widest text-stone-700 dark:text-stone-300 hover:text-stone-950 dark:hover:text-stone-50 transition-colors inline-flex items-center gap-1"
              >
                <Settings className="w-3 h-3" />
                Manage
              </Link>
            )}
          </div>
          {recentSubs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-6 text-center text-sm text-stone-500 dark:text-stone-500">
              No subscribers yet. Be the first.
            </div>
          ) : (
            <div className="space-y-2">
              {recentSubs.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-stone-200/60 dark:border-stone-900/60 bg-white dark:bg-stone-900/20 px-4 py-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-full flex items-center justify-center font-serif text-[11px] font-semibold shrink-0">
                      {s.email[0].toUpperCase()}
                    </div>
                    <a
                      href={`mailto:${s.email}`}
                      className="text-sm font-medium text-stone-900 dark:text-stone-100 hover:text-stone-700 dark:hover:text-stone-300 transition-colors truncate"
                    >
                      {s.email}
                    </a>
                  </div>
                  <div className="text-[10px] text-stone-500 dark:text-stone-500 shrink-0">
                    {formatDistanceToNow(new Date(s.subscribedAt), { addSuffix: true })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Subscribe Section */}
        <section className="bg-stone-100/50 dark:bg-stone-900/20 p-8 md:p-12 rounded-3xl border border-stone-200/60 dark:border-stone-900/60 text-center my-16 max-w-2xl mx-auto shadow-sm">
          <Mail className="w-8 h-8 text-stone-400 dark:text-stone-600 mx-auto mb-4" />
          <h3 className="font-serif text-2xl font-bold text-stone-950 dark:text-stone-50 mb-2">Subscribe to Fusions</h3>
          <p className="text-stone-500 dark:text-stone-400 text-sm max-w-sm mx-auto mb-6 leading-relaxed">
            Get the posts and notes delivered to your inbox.
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

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-stone-200/60 dark:border-stone-900/60 bg-white dark:bg-stone-900/30 p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-500 mb-1.5">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="text-2xl font-semibold text-stone-900 dark:text-stone-100 tabular-nums">
        {value}
      </div>
    </div>
  );
}
