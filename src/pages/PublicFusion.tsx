import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, Calendar, Mail, Share2, Award, User, Layers, ArrowUpRight, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { formatDistanceToNow } from 'date-fns';

type PublicFusionData = {
  fusion: {
    id: string;
    title: string;
    type: string;
    summary: string;
    centralConclusion: string;
    body: string;
    createdAt: string;
    authorName?: string;
    authorBio?: string;
  };
  otherFusions: Array<{
    id: string;
    title: string;
    summary: string;
    createdAt: string;
    type: string;
  }>;
};

export default function PublicFusionPage() {
  const { id } = useParams();
  const [data, setData] = useState<PublicFusionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/public/fusion/${id}`)
      .then(res => {
        if (!res.ok) {
          if (res.status === 403) {
            throw new Error('This fusion is private.');
          }
          throw new Error('Fusion not found.');
        }
        return res.json();
      })
      .then(json => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubscribed(true);
      setEmail('');
    }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center p-6 text-stone-500 dark:text-stone-400">
        <div className="w-10 h-10 border-2 border-stone-300 dark:border-stone-850 border-t-stone-900 dark:border-t-stone-100 rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium tracking-wide uppercase">Consolidating Public view...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mb-6">
          <BookOpen className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100 mb-2">Failed to load publication</h1>
        <p className="text-stone-500 dark:text-stone-400 max-w-md mb-8 leading-relaxed">
          {error || 'The requested page could not be located. It may have been removed or set to private.'}
        </p>
        <a href="/" className="inline-flex items-center gap-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-6 py-2.5 rounded-xl hover:scale-105 active:scale-95 transition-all text-sm font-semibold shadow-lg shadow-stone-900/10 dark:shadow-stone-100/10">
          <ArrowLeft className="w-4 h-4" />
          Back to HumanBoard
        </a>
      </div>
    );
  }

  const { fusion, otherFusions } = data;
  const authorName = fusion.authorName || 'HumanBoard Creator';
  const authorBio = fusion.authorBio || 'Strategic researcher and intelligence compiler.';
  const initials = authorName
    .split(' ')
    .map(w => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-stone-50/70 dark:bg-stone-950 text-stone-800 dark:text-stone-300 font-sans selection:bg-stone-900/10 dark:selection:bg-white/10 transition-colors duration-300">
      {/* Substack-style Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-stone-950/80 backdrop-blur-md border-b border-stone-200/60 dark:border-stone-900/60">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-stone-900 dark:text-stone-100" />
            <span className="font-serif text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100">
              HumanBoard Publication
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/" className="text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors">
              Workspace
            </a>
            <button 
              onClick={() => {
                const el = document.getElementById('subscribe-section');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-4 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 active:scale-95 transition-all"
            >
              Subscribe
            </button>
          </div>
        </div>
      </header>

      {/* Main content container */}
      <main className="max-w-3xl mx-auto px-6 py-12 md:py-20">
        {/* Type / Tag */}
        <div className="flex items-center gap-2 mb-6">
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] px-3 py-1 rounded-full bg-stone-200/50 dark:bg-stone-900 text-stone-600 dark:text-stone-400 border border-stone-300/40 dark:border-stone-800">
            {fusion.type}
          </span>
        </div>

        {/* Title */}
        <h1 className="font-serif text-3xl md:text-5xl font-bold text-stone-950 dark:text-stone-50 mb-6 leading-[1.15] tracking-tight">
          {fusion.title}
        </h1>

        {/* Abstract / Summary */}
        {fusion.summary && (
          <div className="text-lg md:text-xl text-stone-600 dark:text-stone-400 font-serif leading-relaxed mb-8 border-l-2 border-stone-300 dark:border-stone-700 pl-5 italic">
            {fusion.summary}
          </div>
        )}

        {/* Author / Date / Share metadata bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-6 border-y border-stone-200/60 dark:border-stone-900/60 mb-12">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-full flex items-center justify-center font-serif text-sm font-semibold shadow-md">
              {initials || <User className="w-5 h-5" />}
            </div>
            <div>
              <div className="font-semibold text-stone-900 dark:text-stone-100 text-sm">{authorName}</div>
              <div className="text-xs text-stone-500 dark:text-stone-500 mt-0.5">{authorBio}</div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-stone-500 dark:text-stone-500">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {formatDistanceToNow(new Date(fusion.createdAt), { addSuffix: true })}
            </span>
            <button 
              onClick={handleShare}
              className="flex items-center gap-1.5 text-stone-500 hover:text-stone-950 dark:hover:text-stone-100 transition-colors font-semibold uppercase tracking-wider"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Share'}
            </button>
          </div>
        </div>

        {/* Central Conclusion Abstract Box */}
        {fusion.centralConclusion && (
          <div className="bg-stone-100/40 dark:bg-stone-900/30 border border-stone-200/60 dark:border-stone-850 p-6 md:p-8 rounded-2xl mb-12 shadow-sm">
            <div className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-[0.25em] mb-4 flex items-center gap-2">
              <Award className="w-4 h-4 text-stone-500" />
              Central Conclusion
            </div>
            <p className="text-stone-800 dark:text-stone-200 leading-relaxed font-serif text-base italic md:text-lg">
              {fusion.centralConclusion}
            </p>
          </div>
        )}

        {/* Article Body */}
        <article className="prose prose-stone dark:prose-invert max-w-none text-stone-800 dark:text-stone-200 space-y-6 text-[17px] leading-relaxed font-serif">
          <ReactMarkdown>{fusion.body}</ReactMarkdown>
        </article>

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
            <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input 
                type="email"
                required
                placeholder="Enter your email address..."
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="flex-1 bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-850 rounded-xl px-4 py-3 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-400 dark:focus:border-stone-700 transition-colors shadow-inner"
              />
              <button 
                type="submit"
                className="bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-6 py-3 rounded-xl hover:opacity-90 transition-all font-semibold text-sm shadow-md"
              >
                Subscribe
              </button>
            </form>
          )}
        </section>

        {/* Other Publications Section */}
        {otherFusions.length > 0 && (
          <section className="border-t border-stone-200/60 dark:border-stone-900/60 pt-16 mt-16">
            <h4 className="font-serif text-xl font-bold text-stone-950 dark:text-stone-50 mb-8 tracking-tight flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-stone-500" />
              Other publications by this author
            </h4>
            <div className="grid gap-6 sm:grid-cols-2">
              {otherFusions.map(item => (
                <Link 
                  key={item.id}
                  to={`/shared/fusion/${item.id}`}
                  className="group block bg-white dark:bg-stone-900/20 border border-stone-200/60 dark:border-stone-900/60 p-6 rounded-2xl hover:border-stone-300 dark:hover:border-stone-800 hover:shadow-md transition-all flex flex-col h-full"
                >
                  <div className="flex items-center justify-between mb-3 text-[9px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-600">
                    <span>{item.type}</span>
                    <span>{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                  </div>
                  <h5 className="font-serif font-bold text-stone-900 dark:text-stone-100 leading-tight group-hover:text-stone-950 dark:group-hover:text-white transition-colors mb-2 line-clamp-2">
                    {item.title}
                  </h5>
                  <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed mb-4 line-clamp-3 flex-1">
                    {item.summary}
                  </p>
                  <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-stone-900 dark:text-stone-100 group-hover:translate-x-1 transition-transform mt-auto">
                    Read Post <ArrowUpRight className="w-3.5 h-3.5" />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200/60 dark:border-stone-900/60 py-12 text-center text-xs text-stone-500 dark:text-stone-600">
        <p>© {new Date().getFullYear()} HumanBoard Publication. All rights reserved.</p>
        <p className="mt-2">
          Powered by <a href="/" className="underline hover:text-stone-700 dark:hover:text-stone-300">HumanBoard Workspace</a>
        </p>
      </footer>
    </div>
  );
}
