'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Braces, Check, Copy, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Toggle that reveals the raw record behind an item, for people who reuse the data. */
export function RawJsonToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const t = useTranslations('rawJson');
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      title={open ? t('hide') : t('show')}
      className={cn(
        'shrink-0 self-start rounded-md p-1 text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground dark:hover:bg-slate-800',
        open && 'bg-slate-100 text-foreground dark:bg-slate-800'
      )}
    >
      <Braces className="h-4 w-4" />
      <span className="sr-only">{open ? t('hide') : t('show')}</span>
    </button>
  );
}

export function RawJsonPanel({ value, apiHref }: { value: unknown; apiHref?: string }) {
  const t = useTranslations('rawJson');
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(value, null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (insecure context); the JSON is still selectable
    }
  };

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800/60">
        <span className="font-mono text-muted-foreground">JSON</span>
        <div className="flex items-center gap-3">
          {apiHref && (
            <a href={apiHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
              <ExternalLink className="h-3.5 w-3.5" />
              {t('api')}
            </a>
          )}
          <button onClick={copy} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? t('copied') : t('copy')}
          </button>
        </div>
      </div>
      <pre className="max-h-80 overflow-auto bg-white p-3 text-xs leading-relaxed dark:bg-slate-950">
        <code>{json}</code>
      </pre>
    </div>
  );
}
