'use client';

import { useTranslations } from 'next-intl';
import { Heart } from 'lucide-react';
import { SiGithub, SiX, SiLinkedin, SiBuymeacoffee, SiYoutube, SiInstagram } from 'react-icons/si';

const socialLinks = [
  {
    name: 'YouTube',
    href: 'https://www.youtube.com/@ggangix',
    icon: SiYoutube,
  },
  {
    name: 'X (Twitter)',
    href: 'https://twitter.com/ggangix',
    icon: SiX,
  },
  {
    name: 'Instagram',
    href: 'https://instagram.com/giuseppe.gangi',
    icon: SiInstagram,
  },
  {
    name: 'LinkedIn',
    href: 'https://linkedin.com/in/giuseppe.gangi',
    icon: SiLinkedin,
  },
  {
    name: 'GitHub',
    href: 'https://github.com/ggangix',
    icon: SiGithub,
  },
];

export function Footer() {
  const t = useTranslations('footer');

  return (
    <footer className="border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="container mx-auto px-4 py-8">
        {/* Made by */}
        <div className="mb-6 text-center">
          <p className="flex items-center justify-center gap-1 text-sm text-slate-500 dark:text-slate-400">
            {t('madeBy')}{' '}
            <Heart className="h-4 w-4 text-red-500" />
            <a
              href="https://ggangi.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-slate-900 hover:underline dark:text-slate-100"
            >
              Giuseppe Gangi
            </a>
          </p>
        </div>

        {/* Social Links */}
        <div className="mb-6 flex justify-center gap-4">
          {socialLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
              aria-label={link.name}
            >
              <link.icon className="h-5 w-5" />
            </a>
          ))}
        </div>

        {/* Buy Me a Coffee */}
        <div className="mb-6 flex justify-center">
          <a
            href="https://buymeacoffee.com/giuseppe.gangi"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-[#FFDD00] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-[#FFDD00]/90"
          >
            <SiBuymeacoffee className="h-4 w-4" />
            {t('buyMeCoffee')}
          </a>
        </div>

        {/* Open Source & License */}
        <div className="text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('openSource')} •{' '}
            <a
              href="https://github.com/ggangix/venezuela-digital-observatory"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {t('viewOnGithub')}
            </a>
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('license')}</p>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{t('disclaimer')}</p>
        </div>
      </div>
    </footer>
  );
}
