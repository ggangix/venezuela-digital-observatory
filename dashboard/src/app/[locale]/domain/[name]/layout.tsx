import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getMonitorCollection } from '@/lib/mongodb';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string; name: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, name } = await params;
  const domain = decodeURIComponent(name);
  const t = await getTranslations({ locale, namespace: 'meta.pages.domain' });

  // Fetch WHOIS data to get organization name
  let org: string | null = null;
  try {
    const { whois } = await getMonitorCollection();
    const whoisData = await whois.findOne(
      { domain },
      { projection: { org: 1 } }
    );
    org = whoisData?.org || null;
  } catch {
    // Silently fail if DB is not available
  }

  // Build title with organization if available
  const title = org ? `${org} | ${domain}` : t('title', { domain });
  const description = org
    ? t('description', { domain: `${domain} (${org})` })
    : t('description', { domain });

  return {
    title,
    description,
    alternates: {
      canonical: `https://venezueladigitalobservatory.com/${locale}/domain/${name}`,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default function DomainLayout({ children }: Props) {
  return children;
}
