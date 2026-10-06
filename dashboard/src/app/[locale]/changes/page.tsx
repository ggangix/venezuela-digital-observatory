'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Activity, ChevronDown, Eye, Info, Rss } from 'lucide-react';
import { EventList, type MonitorEvent } from '@/components/EventList';
import { ObservingList, type ObservingItem } from '@/components/ObservingList';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'up' | 'down' | 'new_domain' | 'hosting_change';

const FILTER_PARAMS: Record<Filter, string> = {
  all: 'type=all',
  up: 'type=status&direction=up',
  down: 'type=status&direction=down',
  new_domain: 'type=new_domain',
  hosting_change: 'type=hosting_change',
};

export default function ChangesPage() {
  const t = useTranslations('changes');
  const tEvents = useTranslations('events');
  const tObs = useTranslations('observing');

  const [filter, setFilter] = useState<Filter>('all');
  const [intermittent, setIntermittent] = useState(false);
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [intermittentCount, setIntermittentCount] = useState(0);
  const [observing, setObserving] = useState<ObservingItem[]>([]);
  const [showAllObserving, setShowAllObserving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (before: string | null) => {
      setLoading(true);
      try {
        const params = `${FILTER_PARAMS[filter]}&limit=40&intermittent=${intermittent}${before ? `&before=${encodeURIComponent(before)}` : ''}`;
        const res = await fetch(`/api/monitor/events?${params}`);
        if (res.ok) {
          const data = await res.json();
          setEvents((prev) => (before ? [...prev, ...data.events] : data.events));
          setNextBefore(data.nextBefore);
          setIntermittentCount(data.intermittentLast30Days);
          if (!before) setObserving(filter === 'all' || filter === 'up' || filter === 'down' ? data.observing || [] : []);
        }
      } catch (error) {
        console.error('Failed to fetch events:', error);
      }
      setLoading(false);
    },
    [filter, intermittent]
  );

  useEffect(() => {
    load(null);
  }, [load]);

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: tEvents('all') },
    { key: 'down', label: tEvents('onlyDown') },
    { key: 'up', label: tEvents('onlyUp') },
    { key: 'new_domain', label: tEvents('onlyNew') },
    { key: 'hosting_change', label: tEvents('onlyHosting') },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="mb-2 flex items-center gap-2">
            <Activity className="h-7 w-7 text-blue-600" />
            {t('title')}
          </h1>
          <p className="max-w-2xl text-muted-foreground">{t('subtitle')}</p>
        </div>
        <a href="/feed.xml" className="btn-outline gap-2 self-start sm:self-auto">
          <Rss className="h-4 w-4 text-orange-500" />
          {tEvents('rss')}
        </a>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              filter === f.key
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'
            )}
          >
            {f.label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={intermittent}
            onChange={(e) => setIntermittent(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          {tEvents('showIntermittent')}
          {intermittentCount > 0 && <span className="badge badge-intermittent">{intermittentCount}</span>}
        </label>
      </div>

      {observing.length > 0 && (
        <div id="observing" className="card mb-6 border-amber-200 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/10">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
            <Eye className="h-5 w-5 text-amber-600" />
            {tObs('title')}
            <span className="badge badge-failing">{observing.length}</span>
          </h2>
          <p className="mb-2 text-sm text-muted-foreground">{tObs('description')}</p>
          <ObservingList items={showAllObserving ? observing : observing.slice(0, 8)} />
          {observing.length > 8 && !showAllObserving && (
            <button onClick={() => setShowAllObserving(true)} className="mt-2 text-sm font-medium text-blue-600 hover:underline">
              {tObs('showAll', { count: observing.length })}
            </button>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          {loading && events.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">{tEvents('loadMore')}…</p>
          ) : (
            <EventList events={events} />
          )}
          {nextBefore && (
            <button
              onClick={() => load(nextBefore)}
              disabled={loading}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-slate-50 hover:text-foreground disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <ChevronDown className="h-4 w-4" />
              {tEvents('loadMore')}
            </button>
          )}
        </div>

        <aside className="card h-fit">
          <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
            <Info className="h-4 w-4 text-blue-600" />
            {t('howTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('how')}</p>
        </aside>
      </div>
    </div>
  );
}
