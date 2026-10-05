import { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { ArrowLeft, Eye, Database, Users, Scale, Github, Coffee, Clock, Tags, MapPin, ShieldCheck, Activity, Archive, Layers } from 'lucide-react';

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.pages.about' });

  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `https://venezueladigitalobservatory.com/${locale}/about`,
    },
  };
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('about');
  const tFooter = await getTranslations('footer');
  const tm = await getTranslations('methodology');
  const tc = await getTranslations('categories');
  const tChanges = await getTranslations('changes');

  const methodology = [
    { icon: Clock, title: tm('frequency'), text: tm('frequencyText') },
    { icon: MapPin, title: tm('vantage'), text: tm('vantageText') },
    { icon: ShieldCheck, title: tm('quality'), text: tm('qualityText') },
    { icon: Activity, title: tm('changesTitle'), text: tChanges('how') },
    { icon: Archive, title: tm('archiveTitle'), text: tm('archiveText') },
    { icon: Layers, title: tm('estimatesTitle'), text: tm('estimatesText') },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back Link */}
      <Link
        href={`/${locale}`}
        className="mb-6 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('backToHome')}
      </Link>

      <div className="mx-auto max-w-4xl">
        {/* Section Header */}
        <div className="mb-8 text-center">
          <h1 className="mb-3 text-2xl font-bold sm:text-3xl">
            {t('title')}
          </h1>
          <p className="mx-auto max-w-2xl text-slate-500 dark:text-slate-400">
            {t('subtitle')}
          </p>
        </div>

        {/* Mission Statement */}
        <div className="card mb-8 border-l-4 border-l-[#00247D] bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
          <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
            {t('mission')}
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
                {t('features.monitoring.title')}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('features.monitoring.description')}
              </p>
            </div>
          </div>

          <div className="card flex gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <Database className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="mb-1 font-semibold">
                {t('features.openData.title')}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('features.openData.description')}
              </p>
            </div>
          </div>

          <div className="card flex gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Users className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="mb-1 font-semibold">
                {t('features.forEveryone.title')}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('features.forEveryone.description')}
              </p>
            </div>
          </div>

          <div className="card flex gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <Scale className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="mb-1 font-semibold">
                {t('features.independent.title')}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('features.independent.description')}
              </p>
            </div>
          </div>
        </div>

        {/* Technical Details */}
        <div className="card mb-8 bg-slate-50 dark:bg-slate-900">
          <h3 className="mb-3 font-semibold">
            {t('whatWeMonitor')}
          </h3>
          <ul className="grid gap-2 text-sm text-slate-600 dark:text-slate-400 sm:grid-cols-2">
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {t('monitorItems.availability')}
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {t('monitorItems.httpCodes')}
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {t('monitorItems.responseTimes')}
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {t('monitorItems.sslCerts')}
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {t('monitorItems.redirects')}
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {t('monitorItems.serverHeaders')}
            </li>
          </ul>
        </div>

        {/* Methodology */}
        <section id="methodology" className="mb-8">
          <h2 className="mb-4 text-xl font-semibold">{tm('title')}</h2>
          <div className="card mb-4">
            <h3 className="mb-3 flex items-center gap-2 font-semibold">
              <Tags className="h-5 w-5 text-blue-600" />
              {tm('categoriesTitle')}
            </h3>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {(['active', 'failing', 'no_dns', 'intermittent'] as const).map((c) => (
                <div key={c}>
                  <dt className="font-medium">{tc(`${c}.label`)}</dt>
                  <dd className="text-slate-600 dark:text-slate-400">{tc(`${c}.description`)}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {methodology.map((m) => (
              <div key={m.title} className="card">
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <m.icon className="h-5 w-5 text-blue-600" />
                  {m.title}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">{m.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Open Source & Support */}
        <div className="card bg-slate-50 dark:bg-slate-900">
          <h3 className="mb-4 font-semibold">{t('support.title')}</h3>
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
            {t('support.description')}
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="https://github.com/ggangix/venezuela-digital-observatory"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
            >
              <Github className="h-4 w-4" />
              {tFooter('viewOnGithub')}
            </a>
            <a
              href="https://buymeacoffee.com/giuseppe.gangi"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
            >
              <Coffee className="h-4 w-4" />
              {tFooter('buyMeCoffee')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
