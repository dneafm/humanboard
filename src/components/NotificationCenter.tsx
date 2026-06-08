import { useMemo, useState } from 'react';
import { Bell, BellRing, Check, RefreshCw, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '../stores/notificationStore';
import { runNotificationEngine } from './NotificationEngine';

function browserPermission() {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export default function NotificationCenter() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState(browserPermission());
  const {
    notifications,
    settings,
    markRead,
    dismiss,
    clearDismissed,
    updateSettings,
  } = useNotificationStore();

  const active = useMemo(
    () => notifications.filter((item) => item.deliveryState !== 'dismissed' && item.deliveryState !== 'expired'),
    [notifications],
  );
  const unreadCount = active.filter((item) => !item.readAt).length;

  const enableBrowserAlerts = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);
    updateSettings({ browserEnabled: result === 'granted' });
  };

  const openNotification = (id: string, deepLink?: string) => {
    markRead(id);
    if (deepLink) navigate(deepLink);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-stone-600 transition-all hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900/50 dark:hover:text-stone-100"
      >
        {unreadCount ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        <span>Insights</span>
        {unreadCount > 0 && (
          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[11px] font-semibold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] bg-stone-950/45 p-3 md:p-6" onClick={() => setOpen(false)}>
          <section
            className="ml-auto flex h-full w-full max-w-md flex-col overflow-hidden rounded-lg border border-stone-200 bg-white shadow-2xl dark:border-stone-800 dark:bg-stone-950"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4 border-b border-stone-200 px-4 py-4 dark:border-stone-800">
              <div>
                <h2 className="font-semibold text-stone-900 dark:text-stone-100">Second-subconscious insights</h2>
                <p className="mt-1 text-xs text-stone-500">Evidence-backed patterns, memories, and unfinished loops.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-2 hover:bg-stone-100 dark:hover:bg-stone-900" aria-label="Close notifications">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex flex-wrap gap-2 border-b border-stone-200 px-4 py-3 dark:border-stone-800">
              <button
                type="button"
                onClick={runNotificationEngine}
                className="flex items-center gap-2 rounded-md border border-stone-200 px-3 py-2 text-xs font-medium hover:bg-stone-100 dark:border-stone-800 dark:hover:bg-stone-900"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Run insights
              </button>
              {permission !== 'granted' && permission !== 'unsupported' && (
                <button
                  type="button"
                  onClick={() => void enableBrowserAlerts()}
                  className="flex items-center gap-2 rounded-md bg-stone-900 px-3 py-2 text-xs font-medium text-white dark:bg-stone-100 dark:text-stone-950"
                >
                  <Bell className="h-3.5 w-3.5" />
                  Enable browser alerts
                </button>
              )}
              {permission === 'granted' && (
                <button
                  type="button"
                  onClick={() => updateSettings({ browserEnabled: !settings.browserEnabled })}
                  className="flex items-center gap-2 rounded-md border border-stone-200 px-3 py-2 text-xs font-medium hover:bg-stone-100 dark:border-stone-800 dark:hover:bg-stone-900"
                >
                  <Check className="h-3.5 w-3.5" />
                  Browser alerts {settings.browserEnabled ? 'on' : 'off'}
                </button>
              )}
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {active.length === 0 && (
                <div className="px-3 py-12 text-center text-sm text-stone-500">
                  No strong insight is ready yet. HumanBoard will stay quiet until there is enough evidence.
                </div>
              )}
              {active.map((item) => (
                <article key={item.id} className="rounded-md border border-stone-200 p-3 dark:border-stone-800">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => openNotification(item.id, item.action?.deepLink)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-400">
                        {item.type.replaceAll('_', ' ')} - {Math.round(item.insightConfidence * 100)}%
                      </div>
                      <h3 className="mt-1 text-sm font-semibold text-stone-900 dark:text-stone-100">{item.title}</h3>
                      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{item.body}</p>
                      <p className="mt-2 text-xs leading-5 text-stone-500">{item.insight}</p>
                    </button>
                    <button type="button" onClick={() => dismiss(item.id)} className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-800 dark:hover:bg-stone-900" aria-label="Dismiss notification">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <footer className="border-t border-stone-200 p-3 dark:border-stone-800">
              <button type="button" onClick={clearDismissed} className="flex items-center gap-2 text-xs text-stone-500 hover:text-stone-900 dark:hover:text-stone-100">
                <Trash2 className="h-3.5 w-3.5" />
                Clear dismissed
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
