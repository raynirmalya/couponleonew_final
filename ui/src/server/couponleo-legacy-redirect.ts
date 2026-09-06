const COUPONLEO_LOCALIZED_SEGMENTS = new Set([
  'ar',
  'de',
  'es',
  'fr',
  'hi',
  'it',
  'ja',
  'nl',
  'pt',
]);

function normalizeLocaleSegment(locale: string | null | undefined): string | null {
  const normalizedLocale = String(locale ?? '').trim().toLowerCase();
  return COUPONLEO_LOCALIZED_SEGMENTS.has(normalizedLocale) ? normalizedLocale : null;
}

export function buildCouponleoRedirectLocation(pathname: string, search = ''): string {
  return `${pathname}${search || ''}`;
}

export function resolveCouponleoLegacyTermsLocation(locale: string | null | undefined): string | null {
  if (locale == null || String(locale).trim() === '') {
    return '/terms-of-use';
  }

  const normalizedLocale = normalizeLocaleSegment(locale);
  if (!normalizedLocale) {
    return null;
  }

  return `/${normalizedLocale}/terms-of-use`;
}
