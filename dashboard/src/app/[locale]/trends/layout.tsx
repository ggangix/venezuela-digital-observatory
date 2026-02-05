import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.pages.trends' });

  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `https://venezueladigitalobservatory.com/${locale}/trends`,
    },
  };
}

export default function TrendsLayout({ children }: Props) {
  return children;
}
