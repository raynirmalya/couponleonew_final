import {
  COUPONLEO_DEFAULT_LOCALE,
  type CouponleoSupportedLocale,
} from './couponleo-i18n.catalog';

const LOCALE_TO_SEGMENT: Record<CouponleoSupportedLocale, string> = {
  'en-US': 'en',
  'de-DE': 'de',
  'fr-FR': 'fr',
  'es-ES': 'es',
  'it-IT': 'it',
  'pt-BR': 'pt',
  'nl-NL': 'nl',
  'hi-IN': 'hi',
  'ja-JP': 'ja',
  'ar-SA': 'ar',
};

const SEGMENT_TO_LOCALE = new Map<string, CouponleoSupportedLocale>(
  Object.entries(LOCALE_TO_SEGMENT).flatMap(([locale, segment]) => [
    [segment, locale as CouponleoSupportedLocale],
    [locale.toLowerCase(), locale as CouponleoSupportedLocale],
  ]),
);

const LOCALIZED_PUBLIC_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/about$/,
  /^\/alerts$/,
  /^\/blog$/,
  /^\/categories$/,
  /^\/categories\/[^/]+$/,
  /^\/contact$/,
  /^\/country-deals$/,
  /^\/dashboard$/,
  /^\/forgot-password$/,
  /^\/help-center$/,
  /^\/my-coupons$/,
  /^\/privacy-policy$/,
  /^\/settings$/,
  /^\/sign-in$/,
  /^\/sign-up$/,
  /^\/stores$/,
  /^\/stores\/[^/]+$/,
  /^\/terms-of-use$/,
  /^\/top-deals$/,
  /^\/wishlist$/,
];

export function couponleoLocalePathSegment(locale: string | null | undefined): string {
  const normalizedLocale = String(locale ?? '').trim() as CouponleoSupportedLocale;
  return LOCALE_TO_SEGMENT[normalizedLocale] ?? '';
}

export function extractCouponleoLocaleFromPathname(pathname: string | null | undefined): CouponleoSupportedLocale | null {
  const normalizedPathname = normalizePathname(pathname);
  const segments = normalizedPathname.split('/').filter(Boolean);
  const candidate = segments[0]?.toLowerCase();

  if (!candidate) {
    return null;
  }

  return SEGMENT_TO_LOCALE.get(candidate) ?? null;
}

export function stripCouponleoLocaleFromPathname(
  pathname: string | null | undefined,
): { locale: CouponleoSupportedLocale | null; pathname: string } {
  const normalizedPathname = normalizePathname(pathname);
  const segments = normalizedPathname.split('/').filter(Boolean);
  const locale = extractCouponleoLocaleFromPathname(normalizedPathname);

  if (!locale) {
    return { locale: null, pathname: normalizedPathname };
  }

  const strippedSegments = segments.slice(1);
  return {
    locale,
    pathname: strippedSegments.length ? `/${strippedSegments.join('/')}` : '/',
  };
}

export function localizeCouponleoPathname(
  pathname: string | null | undefined,
  locale: string | null | undefined,
): string {
  const normalizedLocale = String(locale ?? '').trim() as CouponleoSupportedLocale;
  const basePathname = stripCouponleoLocaleFromPathname(pathname).pathname;
  const localeSegment = couponleoLocalePathSegment(normalizedLocale);

  if (!localeSegment || normalizedLocale === COUPONLEO_DEFAULT_LOCALE) {
    return basePathname;
  }

  return basePathname === '/'
    ? `/${localeSegment}`
    : `/${localeSegment}${basePathname}`;
}

export function isCouponleoLocalizedPublicPath(pathname: string | null | undefined): boolean {
  const basePathname = stripCouponleoLocaleFromPathname(pathname).pathname;
  return LOCALIZED_PUBLIC_ROUTE_PATTERNS.some((pattern) => pattern.test(basePathname));
}

function normalizePathname(pathname: string | null | undefined): string {
  const trimmed = String(pathname ?? '').trim();

  if (!trimmed || trimmed === '/') {
    return '/';
  }

  const normalized = `/${trimmed.replace(/^\/+/, '').replace(/\/{2,}/g, '/').replace(/\/+$/, '')}`;
  return normalized === '' ? '/' : normalized;
}
