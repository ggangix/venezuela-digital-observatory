import { z } from 'zod';

// API query parameters validation
export const domainsQuerySchema = z.object({
  status: z.enum(['online', 'offline', 'all']).default('all'),
  category: z.enum(['active', 'failing', 'no_dns', 'intermittent', 'all']).default('all'),
  level: z.enum(['national', 'state', 'municipal', 'military', 'all']).default('all'),
  state: z.string().max(40).optional(),
  year: z.coerce.number().int().min(1990).max(2100).optional(),
  ssl: z.enum(['valid', 'invalid', 'none', 'all']).default('all'),
  httpCode: z.enum(['2xx', '3xx', '4xx', '5xx', 'error', 'all']).default('all'),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sort: z.enum(['domain', 'responseTime', 'checkedAt', 'httpCode', 'status', 'since', 'registered']).default('status'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export type DomainsQuery = z.infer<typeof domainsQuerySchema>;

// Change events feed
export const eventsQuerySchema = z.object({
  type: z.enum(['all', 'status', 'new_domain', 'hosting_change', 'ssl_expired', 'ssl_renewed']).default('all'),
  direction: z.enum(['all', 'up', 'down']).default('all'),
  domain: z.string().max(253).optional(),
  intermittent: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

// Trends query parameters
export const trendsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export type TrendsQuery = z.infer<typeof trendsQuerySchema>;

// Export query parameters
export const exportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  status: z.enum(['online', 'offline', 'all']).default('all'),
});

export type ExportQuery = z.infer<typeof exportQuerySchema>;
