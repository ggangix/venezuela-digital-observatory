import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date to a localized string
 */
export function formatDate(date: Date | string, locale: string = 'en'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale === 'es' ? 'es-VE' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a date to a localized string with time
 */
export function formatDateTime(date: Date | string, locale: string = 'en'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(locale === 'es' ? 'es-VE' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string, locale: string = 'en'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  const rtf = new Intl.RelativeTimeFormat(locale === 'es' ? 'es' : 'en', { numeric: 'auto' });

  if (diffMins < 1) return locale === 'es' ? 'ahora' : 'just now';
  if (diffMins < 60) return rtf.format(-diffMins, 'minute');
  if (diffHours < 24) return rtf.format(-diffHours, 'hour');
  if (diffDays < 30) return rtf.format(-diffDays, 'day');

  return formatDate(d, locale);
}

/**
 * Format a number with period as decimal separator (always)
 */
export function formatNumber(num: number, decimals: number = 0): string {
  return num.toFixed(decimals);
}

/**
 * Format a number with thousand separators
 * Spanish uses dots (1.234), English uses commas (1,234)
 */
export function formatNumberWithSeparator(num: number, locale: string = 'en'): string {
  // Spanish: dots for thousands (1.234), English: commas (1,234)
  return num.toLocaleString(locale === 'es' ? 'de-DE' : 'en-US');
}

/**
 * Format response time in milliseconds
 */
export function formatResponseTime(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${formatNumber(ms / 1000, 1)}s`;
}

/**
 * Format duration in seconds to human readable
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

/**
 * Calculate percentage
 */
export function percentage(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

/**
 * Get SSL status color class
 */
export function getSSLStatusClass(ssl: { enabled?: boolean; valid?: boolean } | null): string {
  if (!ssl || !ssl.enabled) return 'badge-ssl-none';
  if (ssl.valid) return 'badge-ssl-valid';
  return 'badge-ssl-invalid';
}

/**
 * Get SSL status text key
 */
export function getSSLStatusKey(ssl: { enabled?: boolean; valid?: boolean } | null): string {
  if (!ssl || !ssl.enabled) return 'ssl.none';
  if (ssl.valid) return 'ssl.valid';
  return 'ssl.invalid';
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Convert data to CSV format
 */
export function toCSV(data: Record<string, unknown>[], headers?: string[]): string {
  if (data.length === 0) return '';

  const keys = headers || Object.keys(data[0]);
  const csvHeaders = keys.join(',');

  const csvRows = data.map((row) =>
    keys
      .map((key) => {
        const value = row[key];
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
        if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        return String(value);
      })
      .join(',')
  );

  return [csvHeaders, ...csvRows].join('\n');
}

/**
 * Format a time span in words ("3 days", "5 meses")
 */
export function formatSpan(ms: number, locale: string = 'en'): string {
  const days = ms / 86400000;
  const fmt = (value: number, unit: 'hour' | 'day' | 'month' | 'year') =>
    new Intl.NumberFormat(locale === 'es' ? 'es' : 'en', {
      style: 'unit',
      unit,
      unitDisplay: 'long',
      maximumFractionDigits: 0,
    }).format(value);
  if (days < 1) return fmt(Math.max(1, Math.round(ms / 3600000)), 'hour');
  if (days < 60) return fmt(Math.round(days), 'day');
  if (days < 730) return fmt(Math.round(days / 30), 'month');
  return fmt(Math.round(days / 365), 'year');
}
