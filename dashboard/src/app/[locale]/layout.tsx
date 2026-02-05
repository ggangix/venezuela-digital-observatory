import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Inter } from 'next/font/google';
import { locales, type Locale } from '@/i18n';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Analytics } from '@/components/Analytics';
import { ThemeProvider } from '@/components/ThemeProvider';
import { JsonLd } from '@/components/JsonLd';

const inter = Inter({ subsets: ['latin'] });

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });

  return {
    title: t('title'),
    description: t('description'),
    keywords: t('keywords'),
    openGraph: {
      title: t('title'),
      description: t('description'),
      url: `https://venezueladigitalobservatory.com/${locale}`,
      siteName: 'Venezuela Digital Observatory',
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: 'Venezuela Digital Observatory',
        },
      ],
      locale: locale === 'es' ? 'es_VE' : 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: t('title'),
      description: t('description'),
      site: '@venezueladigitalobs',
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: 'Venezuela Digital Observatory',
        },
      ],
    },
    alternates: {
      canonical: `https://venezueladigitalobservatory.com/${locale}`,
      languages: {
        en: '/en',
        es: '/es',
      },
    },
  };
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  // Enable static rendering
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-white antialiased dark:bg-slate-950`}>
        <ThemeProvider>
          <NextIntlClientProvider messages={messages}>
            <div className="relative flex min-h-screen flex-col">
              <Header />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
          </NextIntlClientProvider>
          <Analytics />
          <JsonLd locale={locale} />
        </ThemeProvider>
      </body>
    </html>
  );
}
