import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.pages.domains' });

  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `https://venezueladigitalobservatory.com/${locale}/domains`,
    },
  };
}

export default function DomainsLayout({ children }: Props) {
  return children;
}
