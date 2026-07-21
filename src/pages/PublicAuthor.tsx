import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Calendar, Mail, Layers, ArrowUpRight, Check, User, FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type PublicFusion = {
  id: string;
  title: string;
  summary: string;
  type: string;
  audience: string;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  authorBio: string;
};

type PublicAuthorResponse = {
  author: { name: string; bio: string };
  fusions: PublicFusion[];
  count: number;
};

export default function PublicAuthorPage() {
  const { name: nameParam = '' } = useParams();
  const name = decodeURIComponent(nameParam);
  const [data, setData] = useState<PublicAuthorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [subscribePending, setSubscribePending] = useState(false);

  useEffect(() => {
    document.title = `${name} - HumanBoard Publication`;
    let canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = window.location.origin.replace(/^http:/, 'https:') + `/shared/author/${encodeURIComponent(name)}`;
  }, [name]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/public/author/${encodeURIComponent(name)}`)
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) throw new Error('Author not found.');
          throw new Error('Could not load author.');
        }
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load author.');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [name]);

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
        <p className="text-sm font-medium tracking-wide uppercase">Loading author...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mb-6">
          <User className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100 mb-2">Author not found</h1>
        <p className="text-stone-500 dark:text-stone-400 max-w-md mb-8 leading-relaxed">
          {error || 'No public posts from this author yet.'}
        </p>
        <Link
          to="/shared"
          className="inline-flex items-center gap-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-6 py-2.5 rounded-xl hover:scale-105 active:scale-95 transition-all text-sm font-semibold shadow-lg shadow-stone-900/10 dark:shadow-stone-100/10"
        >
          <ArrowLeft className="w-4 h-4" />
          Browse all authors
        </Link>
      </div>
    );
  }

  const initials = data.author.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

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
            <a
              href="/feed.xml"
              className="text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
              title="RSS feed"
            >
              RSS
            </a>
            <Link
              to="/shared"
              className="text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
            >
              All posts
            </Link>
            <a href="/" className="text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors">
              Workspace
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 md:py-20">
        {/* Author profile */}
        <div className="mb-12 md:mb-16">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-16 h-16 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-full flex items-center justify-center font-serif text-xl font-semibold shrink-0 shadow-md">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-stone-500 dark:text-stone-400 mb-1">
                Author
              </div>
              <h1 className="font-serif text-3xl md:text-4xl font-bold text-stone-950 dark:text-stone-50 leading-tight tracking-tight truncate">
                {data.author.name}
              </h1>
            </div>
          </div>
          {data.author.bio && (
            <p className="text-lg text-stone-600 dark:text-stone-400 font-serif leading-relaxed border-l-2 border-stone-300 dark:border-stone-700 pl-5 italic">
              {data.author.bio}
            </p>
          )}
          <div className="mt-5 text-xs text-stone-500 dark:text-stone-500">
            {data.count} {data.count === 1 ? 'post' : 'posts'} published
          </div>
        </div>

        {/* Author's posts */}
        {data.fusions.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 dark:border-stone-900 bg-white dark:bg-stone-900/20 p-12 text-center">
            <FileText className="w-10 h-10 text-stone-300 dark:text-stone-700 mx-auto mb-4" />
            <h3 className="font-serif text-lg font-semibold text-stone-900 dark:text-stone-100 mb-2">
              No public posts yet
            </h3>
            <p className="text-sm text-stone-500 dark:text-stone-400 max-w-md mx-auto leading-relaxed">
              {data.author.name} hasn't published anything yet.
            </p>
          </div>
        ) : (
          <div className="grid gap-5">
            {data.fusions.map((fusion) => (
              <Link
                key={fusion.id}
                to={`/shared/fusion/${fusion.id}`}
                className="group block bg-white dark:bg-stone-900/20 border border-stone-200/60 dark:border-stone-900/60 p-6 rounded-2xl hover:border-stone-300 dark:hover:border-stone-800 hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-3 mb-3 text-[9px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-600">
                  <span className="px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
                    {fusion.type}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDistanceToNow(new Date(fusion.updatedAt || fusion.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <h3 className="font-serif text-xl font-bold text-stone-900 dark:text-stone-100 leading-tight group-hover:text-stone-950 dark:group-hover:text-white transition-colors mb-2">
                  {fusion.title}
                </h3>
                {fusion.summary && (
                  <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed line-clamp-3 mb-3">
                    {fusion.summary}
                  </p>
                )}
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-stone-700 dark:text-stone-200 group-hover:translate-x-1 transition-transform">
                  Read post <ArrowUpRight className="w-3.5 h-3.5" />
                </div>
              </Link>
            ))}
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
