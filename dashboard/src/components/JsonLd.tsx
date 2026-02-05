import { getTranslations } from 'next-intl/server';

type JsonLdProps = {
  locale: string;
};

export async function JsonLd({ locale }: JsonLdProps) {
  const t = await getTranslations({ locale, namespace: 'jsonLd' });

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: t('siteName'),
    alternateName: 'VE Digital Observatory',
    url: 'https://venezueladigitalobservatory.com',
    description: t('siteDescription'),
    inLanguage: [t('langCode')],
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `https://venezueladigitalobservatory.com/${locale}/domains?search={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Venezuela Digital Observatory',
    url: 'https://venezueladigitalobservatory.com',
    logo: 'https://venezueladigitalobservatory.com/og-image.png',
    sameAs: [
      'https://github.com/ggangix/venezuela-digital-observatory',
    ],
    founder: {
      '@type': 'Person',
      name: 'Giuseppe Gangi',
      url: 'https://ggangi.com',
    },
  };

  const datasetSchema = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: t('datasetName'),
    description: t('datasetDescription'),
    url: 'https://venezueladigitalobservatory.com',
    license: 'https://creativecommons.org/publicdomain/zero/1.0/',
    isAccessibleForFree: true,
    creator: {
      '@type': 'Person',
      name: 'Giuseppe Gangi',
    },
    distribution: {
      '@type': 'DataDownload',
      encodingFormat: ['application/json', 'text/csv'],
      contentUrl: `https://venezueladigitalobservatory.com/api/monitor/export`,
    },
    temporalCoverage: '2026/..',
    spatialCoverage: {
      '@type': 'Place',
      name: 'Venezuela',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetSchema) }}
      />
    </>
  );
}
