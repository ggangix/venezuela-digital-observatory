import { MetadataRoute } from 'next';
import { getMonitorCollection } from '@/lib/mongodb';

const BASE_URL = 'https://venezueladigitalobservatory.com';
const locales = ['en', 'es'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages = [
    { path: '', priority: 1.0, changeFrequency: 'hourly' as const },
    { path: '/domains', priority: 0.9, changeFrequency: 'hourly' as const },
    { path: '/trends', priority: 0.8, changeFrequency: 'daily' as const },
  ];

  // Generate static page entries for each locale
  const staticEntries: MetadataRoute.Sitemap = staticPages.flatMap((page) =>
    locales.map((locale) => ({
      url: `${BASE_URL}/${locale}${page.path}`,
      lastModified: new Date(),
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    }))
  );

  // Get all domains for dynamic pages
  let domainEntries: MetadataRoute.Sitemap = [];

  try {
    const { domains } = await getMonitorCollection();
    const allDomains = await domains
      .aggregate([
        { $sort: { checkedAt: -1 } },
        { $group: { _id: '$domain', lastChecked: { $first: '$checkedAt' } } },
        { $limit: 1000 }, // Limit to top 1000 domains for sitemap
      ])
      .toArray();

    domainEntries = allDomains.flatMap((d) =>
      locales.map((locale) => ({
        url: `${BASE_URL}/${locale}/domain/${encodeURIComponent(d._id)}`,
        lastModified: d.lastChecked ? new Date(d.lastChecked) : new Date(),
        changeFrequency: 'daily' as const,
        priority: 0.6,
      }))
    );
  } catch (error) {
    console.error('Error generating sitemap domain entries:', error);
  }

  return [...staticEntries, ...domainEntries];
}
