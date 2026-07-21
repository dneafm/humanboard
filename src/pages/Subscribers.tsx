import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, Trash2, Mail, TrendingUp, Users, Calendar, ExternalLink, RefreshCw, FileText, BarChart3, Globe } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { fetchSubscribers, deleteSubscriber, subscribersToCsv, downloadCsv } from '../lib/subscribers';
import type { SubscribersResponse, Subscriber } from '../lib/subscribers';

export default function SubscribersPage() {
  const [data, setData] = useState<SubscribersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'email'>('newest');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchSubscribers();
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscribers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this subscriber? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await deleteSubscriber(id);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          subscribers: prev.subscribers.filter((s) => s.id !== id),
          count: prev.count - 1,
        };
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const handleExport = () => {
    if (!data) return;
    const csv = subscribersToCsv(data.subscribers);
    const stamp = format(new Date(), 'yyyy-MM-dd');
    downloadCsv(`subscribers-${stamp}.csv`, csv);
  };

  const filteredSubscribers = useMemo(() => {
    if (!data) return [] as Subscriber[];
    let list = data.subscribers;
    if (filter.trim()) {
      const f = filter.trim().toLowerCase();
      list = list.filter((s) =>
        s.email.toLowerCase().includes(f) ||
        (s.sourceFusionId || '').toLowerCase().includes(f) ||
        (s.referrer || '').toLowerCase().includes(f),
      );
    }
    const sorted = [...list];
    if (sort === 'newest') sorted.sort((a, b) => b.subscribedAt.localeCompare(a.subscribedAt));
    if (sort === 'oldest') sorted.sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt));
    if (sort === 'email') sorted.sort((a, b) => a.email.localeCompare(b.email));
    return sorted;
  }, [data, filter, sort]);

  if (loading && !data) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-stone-300 dark:border-stone-800 border-t-stone-900 dark:border-t-stone-100 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-stone-500 dark:text-stone-400">Loading subscribers...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 p-6 text-rose-800 dark:text-rose-200">
          <h2 className="font-semibold mb-1">Failed to load subscribers</h2>
          <p className="text-sm">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-100 dark:bg-rose-950/50 px-3 py-1.5 text-sm font-medium hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400 mb-1">
            <Users className="h-3.5 w-3.5" />
            Publication
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100 tracking-tight">
            Subscribers
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            People who subscribed from your public fusions. Export the list when you wire up an email service.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={data.subscribers.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-3 py-2 text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            <Users className="h-3.5 w-3.5" />
            Total
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100">
            {data.count}
          </div>
          <div className="text-xs text-stone-500 dark:text-stone-500 mt-0.5">
            {data.count === 1 ? 'subscriber' : 'subscribers'}
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            <TrendingUp className="h-3.5 w-3.5" />
            Last 7 days
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100">
            {data.last7Days}
          </div>
          <div className="text-xs text-stone-500 dark:text-stone-500 mt-0.5">
            new {data.last7Days === 1 ? 'subscriber' : 'subscribers'}
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 sm:p-5 col-span-2 sm:col-span-1">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            <FileText className="h-3.5 w-3.5" />
            Top source
          </div>
          <div className="mt-2 text-base font-semibold text-stone-900 dark:text-stone-100 truncate">
            {data.byFusion[0] ? data.byFusion[0].title : '—'}
          </div>
          <div className="text-xs text-stone-500 dark:text-stone-500 mt-0.5">
            {data.byFusion[0] ? `${data.byFusion[0].count} from this post` : 'no post yet'}
          </div>
        </div>
      </div>

      {/* Per-fusion breakdown */}
      {data.byFusion.length > 0 && (
        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 sm:p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-stone-500" />
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Subscribers per post</h2>
          </div>
          <div className="space-y-2">
            {data.byFusion.map((row) => {
              const max = data.byFusion[0]?.count || 1;
              const pct = Math.round((row.count / max) * 100);
              return (
                <div key={row.fusionId} className="flex items-center gap-3">
                  <Link
                    to={`/fusion/${row.fusionId}`}
                    className="flex-1 min-w-0 group"
                  >
                    <div className="flex items-center gap-2 text-sm text-stone-700 dark:text-stone-300 group-hover:text-stone-950 dark:group-hover:text-white transition-colors">
                      <span className="truncate">{row.title}</span>
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-amber-600 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </Link>
                  <div className="text-sm font-semibold text-stone-900 dark:text-stone-100 tabular-nums w-12 text-right">
                    {row.count}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters + table */}
      <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 sm:px-5 py-3 border-b border-stone-200 dark:border-stone-800">
          <input
            type="search"
            placeholder="Filter by email, fusion id, or referrer..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-3 py-1.5 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-400 dark:focus:border-stone-700 transition-colors"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as 'newest' | 'oldest' | 'email')}
            className="bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-3 py-1.5 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-400 dark:focus:border-stone-700 transition-colors"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="email">By email</option>
          </select>
        </div>

        {data.subscribers.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="w-12 h-12 bg-stone-100 dark:bg-stone-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail className="h-6 w-6 text-stone-400" />
            </div>
            <h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-1">No subscribers yet</h3>
            <p className="text-sm text-stone-500 dark:text-stone-400 max-w-md mx-auto">
              When someone subscribes from your public fusion pages, they'll show up here. Share a public post to get started.
            </p>
            <Link
              to="/fusion"
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:text-stone-950 dark:hover:text-white transition-colors"
            >
              <Globe className="h-3.5 w-3.5" />
              Go to Fusions <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        ) : filteredSubscribers.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-stone-500 dark:text-stone-400">
            No subscribers match "{filter}"
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                  <th className="px-4 sm:px-5 py-2.5">Email</th>
                  <th className="px-4 sm:px-5 py-2.5 hidden sm:table-cell">Source</th>
                  <th className="px-4 sm:px-5 py-2.5 hidden md:table-cell">Subscribed</th>
                  <th className="px-4 sm:px-5 py-2.5 hidden lg:table-cell">Referrer</th>
                  <th className="px-4 sm:px-5 py-2.5 w-12" />
                </tr>
              </thead>
              <tbody>
                {filteredSubscribers.map((s) => {
                  const sourceFusion = s.sourceFusionId
                    ? data.byFusion.find((b) => b.fusionId === s.sourceFusionId)
                    : null;
                  return (
                    <tr
                      key={s.id}
                      className="border-b border-stone-100 dark:border-stone-800/60 last:border-b-0 hover:bg-stone-50 dark:hover:bg-stone-800/30 transition-colors"
                    >
                      <td className="px-4 sm:px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 text-stone-400 shrink-0" />
                          <a
                            href={`mailto:${s.email}`}
                            className="font-medium text-stone-900 dark:text-stone-100 hover:text-stone-700 dark:hover:text-stone-300 transition-colors truncate"
                          >
                            {s.email}
                          </a>
                        </div>
                        <div className="sm:hidden text-xs text-stone-500 dark:text-stone-500 mt-1">
                          {formatDistanceToNow(new Date(s.subscribedAt), { addSuffix: true })}
                          {sourceFusion && ` · ${sourceFusion.title}`}
                        </div>
                      </td>
                      <td className="px-4 sm:px-5 py-3 hidden sm:table-cell">
                        {sourceFusion ? (
                          <Link
                            to={`/fusion/${sourceFusion.fusionId}`}
                            className="inline-flex items-center gap-1 text-stone-700 dark:text-stone-300 hover:text-stone-950 dark:hover:text-white transition-colors max-w-[200px]"
                          >
                            <span className="truncate">{sourceFusion.title}</span>
                            <ExternalLink className="h-3 w-3 opacity-60 shrink-0" />
                          </Link>
                        ) : s.sourceFusionId ? (
                          <span className="text-stone-400 dark:text-stone-600 text-xs font-mono">
                            {s.sourceFusionId.slice(0, 8)}…
                          </span>
                        ) : (
                          <span className="text-stone-400 dark:text-stone-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 sm:px-5 py-3 hidden md:table-cell">
                        <div className="flex items-center gap-1.5 text-stone-600 dark:text-stone-400">
                          <Calendar className="h-3.5 w-3.5" />
                          <span className="text-xs">
                            {formatDistanceToNow(new Date(s.subscribedAt), { addSuffix: true })}
                          </span>
                        </div>
                        <div className="text-[10px] text-stone-400 dark:text-stone-600 mt-0.5">
                          {format(new Date(s.subscribedAt), 'yyyy-MM-dd HH:mm')}
                        </div>
                      </td>
                      <td className="px-4 sm:px-5 py-3 hidden lg:table-cell">
                        {s.referrer ? (
                          <span className="text-xs text-stone-500 dark:text-stone-500 truncate max-w-[180px] inline-block align-middle" title={s.referrer}>
                            {s.referrer.replace(/^https?:\/\//, '').slice(0, 30)}
                          </span>
                        ) : (
                          <span className="text-stone-400 dark:text-stone-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 sm:px-5 py-3">
                        <button
                          type="button"
                          onClick={() => void handleDelete(s.id)}
                          disabled={deletingId === s.id}
                          className="p-1.5 rounded-md text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors disabled:opacity-50"
                          title="Remove subscriber"
                          aria-label="Remove subscriber"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6 text-xs text-stone-500 dark:text-stone-500 text-center">
        Storage: <code className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 font-mono text-[11px]">/app/data/public/subscribers.json</code> on Cloud Run
      </div>
    </div>
  );
}
