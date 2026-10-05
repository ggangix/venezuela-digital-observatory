'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Globe, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './ThemeToggle';

const navItems = [
  { key: 'overview', href: '' },
  { key: 'domains', href: '/domains' },
  { key: 'changes', href: '/changes' },
  { key: 'trends', href: '/trends' },
  { key: 'about', href: '/about' },
];

export function Header() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const otherLocale = locale === 'en' ? 'es' : 'en';
  const currentPath = pathname.replace(`/${locale}`, '') || '/';
  const switchLocalePath = `/${otherLocale}${currentPath === '/' ? '' : currentPath}`;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link href={`/${locale}`} className="flex items-center space-x-2">
          <span className="text-xl font-bold tracking-tight">VE Observatory</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center space-x-6 md:flex">
          {navItems.map((item) => {
            const href = `/${locale}${item.href}`;
            const isActive = pathname === href || (item.href === '' && pathname === `/${locale}`);

            return (
              <Link
                key={item.key}
                href={href}
                className={cn(
                  'text-sm font-medium transition-colors hover:text-primary',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {t(item.key)}
              </Link>
            );
          })}
        </nav>

        {/* Theme Toggle, Language Switcher & Mobile Menu Button */}
        <div className="flex items-center space-x-2 sm:space-x-4">
          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Language Switcher */}
          <Link
            href={switchLocalePath}
            className="flex h-9 items-center space-x-1 rounded-md border border-slate-200 bg-white px-3 text-sm text-muted-foreground transition-colors hover:bg-slate-100 hover:text-primary dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
            title={locale === 'en' ? 'Cambiar a Español' : 'Switch to English'}
          >
            <Globe className="h-4 w-4" />
            <span>{otherLocale.toUpperCase()}</span>
          </Link>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white md:hidden dark:border-slate-700 dark:bg-slate-800"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <nav className="border-t bg-background md:hidden">
          <div className="container mx-auto px-4 py-4">
            {navItems.map((item) => {
              const href = `/${locale}${item.href}`;
              const isActive = pathname === href || (item.href === '' && pathname === `/${locale}`);

              return (
                <Link
                  key={item.key}
                  href={href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'block py-2 text-sm font-medium transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {t(item.key)}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
}
