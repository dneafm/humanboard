import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Calendar, FileText, Heart, Mail, Layers, ArrowUpRight, Check, Compass, Eye, FileText as FileTextIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fetchPublicNotes, toggleLike, type PublicNote } from '../lib/publicEngagement';

export default function PublicNotesPage() {
  const [data, setData] = useState<{ notes: PublicNote[]; count: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [subscribePending, setSubscribePending] = useState(false);

  useEffect(() => {
    document.title = 'Notes - HumanBoard Publication';
    let canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = window.location.origin.replace(/^http:/, 'https:') + '/shared/notes';
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPublicNotes()
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load notes.');
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

  const handleLike = async (note: PublicNote) => {
    try {
      const result = await toggleLike('note', note.id);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          notes: prev.notes.map((n) =>
            n.id === note.id
              ? { ...n, likeCount: result.count, liked: result.liked }
              : n
          ),
        };
      });
    } catch {}
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center p-6 text-stone-500 dark:text-stone-400">
        <div className="w-10 h-10 border-2 border-stone-300 dark:border-stone-850 border-t-stone-900 dark:border-t-stone-100 rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium tracking-wide uppercase">Loading notes...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mb-6">
          <FileText className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100 mb-2">Failed to load notes</h1>
        <p className="text-stone-500 dark:text-stone-400 max-w-md mb-8 leading-relaxed">
          {error || 'No notes available yet.'}
        </p>
        <Link
          to="/shared"
          className="inline-flex items-center gap-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-6 py-2.5 rounded-xl hover:scale-105 active:scale-95 transition-all text-sm font-semibold shadow-lg shadow-stone-900/10 dark:shadow-stone-100/10"
        >
          <ArrowLeft className="w-4 h-4" />
          Browse all posts
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50/70 dark:bg-stone-950 text-stone-800 dark:text-stone-300 font-sans selection:bg-stone-900/10 dark:selection:bg-white/10 transition-colors duration-300">
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-stone-950/80 backdrop-blur-md border-b border-stone-200/60 dark:border-stone-900/60">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
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
            Notes
          </div>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-stone-950 dark:text-stone-50 mb-4 leading-[1.1] tracking-tight">
            Short thoughts
          </h1>
          <p className="text-base text-stone-600 dark:text-stone-400 leading-relaxed">
            Quick posts and notes from the author. Shorter than full essays, fresher than a polished report.
          </p>
        </div>

        {data.notes.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 dark:border-stone-900 bg-white dark:bg-stone-900/20 p-12 text-center">
            <FileTextIcon className="w-10 h-10 text-stone-300 dark:text-stone-700 mx-auto mb-4" />
            <h3 className="font-serif text-lg font-semibold text-stone-900 dark:text-stone-100 mb-2">
              No notes yet
            </h3>
            <p className="text-sm text-stone-500 dark:text-stone-400 max-w-md mx-auto leading-relaxed">
              When the author publishes a short note, it shows up here.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {data.notes.map((note) => (
              <article
                key={note.id}
                className="rounded-2xl border border-stone-200/60 dark:border-stone-900/60 bg-white dark:bg-stone-900/20 p-6 hover:border-stone-300 dark:hover:border-stone-800 transition-colors"
              >
                <header className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-full flex items-center justify-center font-serif text-xs font-semibold shrink-0">
                    {note.authorName.split(' ').map((w) => w[0]).join('').substring(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/shared/author/${encodeURIComponent(note.authorName)}`}
                      className="font-semibold text-sm text-stone-900 dark:text-stone-100 hover:text-stone-700 dark:hover:text-stone-300 truncate block"
                    >
                      {note.authorName}
                    </Link>
                    <div className="text-xs text-stone-500 dark:text-stone-500 flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                </header>
                <Link
                  to={`/shared/notes/${note.id}`}
                  className="block text-stone-800 dark:text-stone-200 leading-relaxed whitespace-pre-wrap break-words"
                >
                  {note.content}
                </Link>
                {note.linkedFusionId && note.linkedFusionTitle && (
                  <Link
                    to={`/shared/fusion/${note.linkedFusionId}`}
                    className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/30 transition-colors"
                  >
                    <FileText className="w-3.5 w-3.5" />
                    <span className="font-semibold">From post:</span>
                    <span className="truncate">{note.linkedFusionTitle}</span>
                    <ArrowUpRight className="w-3 h-3 ml-auto shrink-0 opacity-60" />
                  </Link>
                )}
                {note.tags && note.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {note.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-900 text-[10px] font-medium text-stone-600 dark:text-stone-400 border border-stone-200/60 dark:border-stone-800/60"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
                <footer className="mt-4 flex items-center gap-4 text-xs text-stone-500 dark:text-stone-500">
                  <button
                    type="button"
                    onClick={() => void handleLike(note)}
                    className={`inline-flex items-center gap-1.5 transition-colors ${
                      note.liked
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-stone-500 dark:text-stone-500 hover:text-rose-600 dark:hover:text-rose-400'
                    }`}
                    aria-label={note.liked ? 'Unlike' : 'Like'}
                  >
                    <Heart className={`w-3.5 h-3.5 ${note.liked ? 'fill-current' : ''}`} />
                    {note.likeCount ?? 0}
                  </button>
                  <Link
                    to={`/shared/notes/${note.id}`}
                    className="inline-flex items-center gap-1.5 text-stone-500 dark:text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {note.viewCount ?? 0}
                  </Link>
                  <Link
                    to={`/shared/notes/${note.id}`}
                    className="ml-auto text-stone-500 dark:text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 transition-colors inline-flex items-center gap-1"
                  >
                    Read <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </footer>
              </article>
            ))}
          </div>
        )}

        {/* Subscribe Section */}
        <section id="subscribe-section" className="bg-stone-100/50 dark:bg-stone-900/20 p-8 md:p-12 rounded-3xl border border-stone-200/60 dark:border-stone-900/60 text-center my-16 max-w-2xl mx-auto shadow-sm">
          <Mail className="w-8 h-8 text-stone-400 dark:text-stone-600 mx-auto mb-4" />
          <h3 className="font-serif text-2xl font-bold text-stone-950 dark:text-stone-50 mb-2">Subscribe to Fusions</h3>
          <p className="text-stone-500 dark:text-stone-400 text-sm max-w-sm mx-auto mb-6 leading-relaxed">
            Get the full essays and reports in your inbox, not just the notes.
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
