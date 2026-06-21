import type { CouponleoCoupon, CouponleoStore } from './couponleo-api.service';

export const COUPONLEO_ALLOWED_LOGO_HOST_SUFFIXES = [
  'brandlogos.org',
  'brandreward.com',
  'cuelinks.com',
] as const;

export function couponleoStoreLogoUrl(store: Pick<CouponleoStore, 'logo_square_url' | 'logoUrl' | 'logo_horizontal_url' | 'image_url'>): string {
  return store.logo_square_url ?? store.logoUrl ?? store.logo_horizontal_url ?? store.image_url ?? '';
}

export function couponleoCouponLogoUrl(coupon: Pick<CouponleoCoupon, 'brand_logo' | 'image_url'>): string {
  return coupon.brand_logo ?? coupon.image_url ?? '';
}

export function couponleoBrandmarkInitials(name: string): string {
  const parts = name
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function isCouponleoLogoUrlBlocked(url: string): boolean {
  if (!url) {
    return true;
  }

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.endsWith('.r2.dev');
  } catch {
    return false;
  }
}

export function isAllowedCouponleoLogoHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();

  return COUPONLEO_ALLOWED_LOGO_HOST_SUFFIXES.some((suffix) => (
    normalized === suffix || normalized.endsWith(`.${suffix}`)
  ));
}

export function isAllowedCouponleoLogoUrl(url: string): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && isAllowedCouponleoLogoHost(parsed.hostname);
  } catch {
    return false;
  }
}

export function proxiedCouponleoLogoUrl(url: string): string {
  if (!isAllowedCouponleoLogoUrl(url) || isCouponleoLogoUrlBlocked(url)) {
    return '';
  }

  return `/api/logo?url=${encodeURIComponent(url)}`;
}
