import createMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './i18n';

export default createMiddleware({
  locales,
  defaultLocale,
  localeDetection: true,
  localePrefix: 'always',
});

export const config = {
  // Only run middleware on paths that need i18n
  // Exclude: api, _next, static files, and files with extensions
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|og-image.png|robots.txt|sitemap.xml|data).*)'],
};
