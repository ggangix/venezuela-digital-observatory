import { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { ArrowRight, RefreshCw, Github, Globe, Shield, Code, Eye, Users, Database, Scale } from 'lucide-react';
import { StatusSummary } from '@/components/StatusSummary';
import { getMonitorCollection } from '@/lib/mongodb';
import { formatRelativeTime } from '@/lib/utils';

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.pages.home' });

  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `https://venezueladigitalobservatory.com/${locale}`,
    },
  };
}

async function getSummary() {
  try {
    const { checks } = await getMonitorCollection();
    const latestCheck = await checks.findOne({}, { sort: { checkedAt: -1 } });

    if (!latestCheck) {
      return null;
    }

    return {
      checkedAt: latestCheck.checkedAt,
      checkDuration: latestCheck.checkDuration,
      summary: latestCheck.summary,
    };
  } catch (error) {
    console.error('Failed to fetch summary:', error);
    return null;
  }
}

export const revalidate = 60; // Revalidate every 60 seconds

export default async function OverviewPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('overview');
  const tHome = await getTranslations('home');

  const data = await getSummary();

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-slate-900 dark:bg-slate-950">
        <div className="container mx-auto px-4 py-10 sm:py-12">
          <div className="flex flex-col items-center text-center sm:flex-row sm:text-left sm:justify-between sm:items-center gap-6">
            {/* Title & Subtitle */}
            <div>
              <h1 className="mb-2 text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
                {t('title')}
              </h1>
              <p className="text-slate-400 sm:text-lg">
                {t('subtitle')}
              </p>
              {/* Badges */}
              <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                  <Globe className="h-3 w-3" />
                  {t('realTime')}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                  <Code className="h-3 w-3" />
                  Open Source
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                  <Shield className="h-3 w-3" />
                  {t('publicData')}
                </span>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex items-center gap-3">
              <Link
                href={`/${locale}/domains`}
                className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100"
              >
                {t('viewAll')}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="https://github.com/ggangix/venezuela-digital-observatory"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
              >
                <Github className="h-4 w-4" />
                GitHub
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="container mx-auto px-4 py-8">
        {data ? (
          <>
            {/* Last Update */}
            <div className="mb-4 flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <RefreshCw className="h-4 w-4" />
              <span>
                {t('lastUpdate')}: {formatRelativeTime(data.checkedAt, locale)}
              </span>
            </div>

            {/* Stats Summary */}
            <StatusSummary
              summary={{
                ...data.summary,
                checkDuration: data.checkDuration,
              }}
              className="mb-8"
            />
          </>
        ) : (
          <div className="card text-center py-12">
            <p className="text-slate-500 dark:text-slate-400">
              {t('loadError')}
            </p>
          </div>
        )}
      </section>

      {/* About Section */}
      <section className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-4xl">
          {/* Section Header */}
          <div className="mb-8 text-center">
            <h2 className="mb-3 text-2xl font-bold sm:text-3xl">
              {tHome('whyTitle')}
            </h2>
            <p className="mx-auto max-w-2xl text-slate-500 dark:text-slate-400">
              {tHome('whySubtitle')}
            </p>
          </div>

          {/* Mission Statement */}
          <div className="card mb-8 border-l-4 border-l-[#00247D] bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
            <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
              {tHome('mission')}
            </p>
          </div>

          {/* Features Grid */}
          <div className="mb-8 grid gap-6 sm:grid-cols-2">
            <div className="card flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Eye className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="mb-1 font-semibold">
                  {tHome('features.monitoring.title')}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {tHome('features.monitoring.description')}
                </p>
              </div>
            </div>

            <div className="card flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                <Database className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="mb-1 font-semibold">
                  {tHome('features.openData.title')}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {tHome('features.openData.description')}
                </p>
              </div>
            </div>

            <div className="card flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Users className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="mb-1 font-semibold">
                  {tHome('features.forEveryone.title')}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {tHome('features.forEveryone.description')}
                </p>
              </div>
            </div>

            <div className="card flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <Scale className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="mb-1 font-semibold">
                  {tHome('features.independent.title')}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {tHome('features.independent.description')}
                </p>
              </div>
            </div>
          </div>

          {/* Technical Details */}
          <div className="card bg-slate-50 dark:bg-slate-900">
            <h3 className="mb-3 font-semibold">
              {tHome('whatWeMonitor')}
            </h3>
            <ul className="grid gap-2 text-sm text-slate-600 dark:text-slate-400 sm:grid-cols-2">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                {tHome('monitorItems.availability')}
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                {tHome('monitorItems.httpCodes')}
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                {tHome('monitorItems.responseTimes')}
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                {tHome('monitorItems.sslCerts')}
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                {tHome('monitorItems.redirects')}
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                {tHome('monitorItems.serverHeaders')}
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
