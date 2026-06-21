import airplaneIconSvg from '@eonui/icons/svg/maps/eon-plane.svg?raw';
import buildingStoreIconSvg from '@eonui/icons/svg/maps/eon-building-store.svg?raw';
import dropletIconSvg from '@eonui/icons/svg/design/eon-droplet-heart.svg?raw';
import laptopIconSvg from '@eonui/icons/svg/system/eon-device-laptop.svg?raw';
import searchIconSvg from '@eonui/icons/svg/system/eon-search.svg?raw';
import shirtIconSvg from '@eonui/icons/svg/commerce/eon-shirt.svg?raw';
import sparklesIconSvg from '@eonui/icons/svg/system/eon-sparkles.svg?raw';
import {
  couponleoGeneratedCategoryAssets,
  type CouponleoGeneratedCategoryTheme,
} from './couponleo-category-assets.generated';
import { couponleoExpiryLabels, translateCouponleoPhrase } from './couponleo-i18n.catalog';
import type {
  CouponleoCategory,
  CouponleoCoupon,
  CouponleoLocation,
} from './couponleo-api.service';

export interface CouponleoCategoryPresentation {
  imageSrc: string;
  imageAlt: string;
  icon: string;
  tone: 'orange' | 'blue' | 'rose';
}

export interface CouponleoCountryOption {
  value: string;
  label: string;
}

export interface CouponleoCategorySummary {
  slug: string;
  name: string;
  couponCount: number;
  storeCount: number;
  headline: string;
}

const browserRegionCountryMap: Record<string, string> = {
  AT: 'Austria',
  AU: 'Australia',
  BE: 'Belgium',
  BG: 'Bulgaria',
  BR: 'Brazil',
  BY: 'Belarus',
  CA: 'Canada',
  CH: 'Switzerland',
  CL: 'Chile',
  CN: 'China',
  CZ: 'Czech Republic',
  DE: 'Germany',
  DK: 'Denmark',
  ES: 'Spain',
  FI: 'Finland',
  FR: 'France',
  GB: 'United Kingdom',
  GR: 'Greece',
  HK: 'Hong Kong',
  HU: 'Hungary',
  ID: 'Indonesia',
  IE: 'Ireland',
  IN: 'India',
  IT: 'Italy',
  KH: 'Cambodia',
  KR: 'South Korea',
  MX: 'Mexico',
  MY: 'Malaysia',
  NL: 'Netherlands',
  NO: 'Norway',
  OM: 'Oman',
  PH: 'Philippines',
  PK: 'Pakistan',
  PL: 'Poland',
  PR: 'Puerto Rico',
  PT: 'Portugal',
  RO: 'Romania',
  RU: 'Russia',
  SE: 'Sweden',
  SG: 'Singapore',
  SK: 'Slovakia',
  TR: 'Turkey',
  UA: 'Ukraine',
  US: 'United States of America',
  VN: 'Vietnam',
};

const timeZoneCountryHints: Array<[string, string]> = [
  ['Asia/Calcutta', 'India'],
  ['Asia/Kolkata', 'India'],
  ['Asia/Shanghai', 'China'],
  ['Asia/Singapore', 'Singapore'],
  ['Asia/Seoul', 'South Korea'],
  ['Asia/Hong_Kong', 'Hong Kong'],
  ['Asia/Jakarta', 'Indonesia'],
  ['Asia/Kuala_Lumpur', 'Malaysia'],
  ['Asia/Dubai', 'United Arab Emirates'],
  ['Asia/Karachi', 'Pakistan'],
  ['Europe/London', 'United Kingdom'],
  ['Europe/Berlin', 'Germany'],
  ['Europe/Paris', 'France'],
  ['Europe/Madrid', 'Spain'],
  ['Europe/Rome', 'Italy'],
  ['Europe/Amsterdam', 'Netherlands'],
  ['Europe/Stockholm', 'Sweden'],
  ['Europe/Oslo', 'Norway'],
  ['Europe/Copenhagen', 'Denmark'],
  ['Europe/Dublin', 'Ireland'],
  ['Europe/Vienna', 'Austria'],
  ['Europe/Prague', 'Czech Republic'],
  ['Europe/Bratislava', 'Slovakia'],
  ['Europe/Brussels', 'Belgium'],
  ['Europe/Athens', 'Greece'],
  ['Europe/Bucharest', 'Romania'],
  ['America/New_York', 'United States of America'],
  ['America/Chicago', 'United States of America'],
  ['America/Denver', 'United States of America'],
  ['America/Los_Angeles', 'United States of America'],
  ['America/Toronto', 'Canada'],
  ['America/Vancouver', 'Canada'],
  ['America/Mexico_City', 'Mexico'],
  ['America/Sao_Paulo', 'Brazil'],
  ['Australia/Sydney', 'Australia'],
  ['Australia/Melbourne', 'Australia'],
  ['Australia/Brisbane', 'Australia'],
  ['Australia/Perth', 'Australia'],
];

const categoryAssetBase = '/assets/images/categories';

const categoryThemePresentationMap: Record<
  CouponleoGeneratedCategoryTheme,
  Pick<CouponleoCategoryPresentation, 'icon' | 'tone'>
> = {
  auto: {
    icon: buildingStoreIconSvg,
    tone: 'orange',
  },
  beauty: {
    icon: dropletIconSvg,
    tone: 'rose',
  },
  books: {
    icon: searchIconSvg,
    tone: 'blue',
  },
  business: {
    icon: buildingStoreIconSvg,
    tone: 'blue',
  },
  electronics: {
    icon: laptopIconSvg,
    tone: 'blue',
  },
  entertainment: {
    icon: sparklesIconSvg,
    tone: 'rose',
  },
  fashion: {
    icon: shirtIconSvg,
    tone: 'orange',
  },
  finance: {
    icon: buildingStoreIconSvg,
    tone: 'blue',
  },
  food: {
    icon: sparklesIconSvg,
    tone: 'orange',
  },
  gifts: {
    icon: sparklesIconSvg,
    tone: 'orange',
  },
  health: {
    icon: dropletIconSvg,
    tone: 'blue',
  },
  home: {
    icon: buildingStoreIconSvg,
    tone: 'blue',
  },
  kids: {
    icon: sparklesIconSvg,
    tone: 'orange',
  },
  office: {
    icon: searchIconSvg,
    tone: 'blue',
  },
  pets: {
    icon: dropletIconSvg,
    tone: 'rose',
  },
  sports: {
    icon: sparklesIconSvg,
    tone: 'orange',
  },
  travel: {
    icon: airplaneIconSvg,
    tone: 'blue',
  },
};

const legacyCategoryPresentationMap: Record<string, CouponleoCategoryPresentation> = {
  food: buildCategoryPresentation(
    `${categoryAssetBase}/food-dining_v2.png`,
    'Food and dining category featuring tableware and takeaway essentials',
    'food',
  ),
  learning: buildCategoryPresentation(
    `${categoryAssetBase}/books-media_v2.png`,
    'Learning category featuring books, headphones, and media picks',
    'books',
  ),
  travel: buildCategoryPresentation(
    `${categoryAssetBase}/travel_v3.png`,
    'Travel category featuring a blue suitcase and airplane',
    'travel',
  ),
};

const defaultCategoryPresentation: CouponleoCategoryPresentation = {
  imageSrc: `${categoryAssetBase}/gift-cards_v2.png`,
  imageAlt: 'Category illustration featuring colorful shopping cards',
  icon: buildingStoreIconSvg,
  tone: 'blue',
};

export function getCategoryPresentation(slug: string): CouponleoCategoryPresentation {
  const normalizedSlug = slugifyLabel(slug);
  const generatedAsset = couponleoGeneratedCategoryAssets[normalizedSlug];

  if (generatedAsset) {
    return buildCategoryPresentation(
      generatedAsset.imageSrc,
      generatedAsset.imageAlt,
      generatedAsset.theme,
    );
  }

  return legacyCategoryPresentationMap[normalizedSlug] ?? defaultCategoryPresentation;
}

export function getStoreIcon(category: string): string {
  return getCategoryPresentation(slugifyLabel(category)).icon;
}

export function isCouponLive(expiresAt: string, now: Date = new Date()): boolean {
  const expiry = parseDate(expiresAt);
  if (!expiry) {
    return true;
  }

  return expiry >= startOfDay(now);
}

export function formatExpiryLabel(expiresAt: string, now: Date = new Date()): string {
  const expiry = parseDate(expiresAt);
  if (!expiry) {
    return couponleoExpiryLabels(resolveUiLocale()).unavailable;
  }

  const formattedDate = expiry.toLocaleDateString(resolveUiLocale(), { month: 'short', day: 'numeric' });
  const labels = couponleoExpiryLabels(resolveUiLocale());
  return isCouponLive(expiresAt, now) ? `${labels.expires} ${formattedDate}` : `${labels.expired} ${formattedDate}`;
}

export function formatCount(value: number, singularLabel: string, pluralLabel: string): string {
  const locale = resolveUiLocale();
  const label = value === 1 ? singularLabel : pluralLabel;
  return `${value.toLocaleString(locale)} ${translateCouponleoPhrase(locale, label)}`;
}

export function buildCountryOptions(
  locations: CouponleoLocation[],
  allLabel: string = 'All Countries',
  includeCounts: boolean = true,
): CouponleoCountryOption[] {
  const sortedLocations = [...locations].sort((left, right) => (
    (right.couponCount ?? 0) - (left.couponCount ?? 0)
    || left.name.localeCompare(right.name)
  ));

  return [
    { value: 'all', label: translateCouponleoPhrase(resolveUiLocale(), allLabel) },
    ...sortedLocations.map((location) => ({
      value: location.name,
      label: includeCounts
        ? `${location.name} (${formatCount(location.couponCount ?? 0, 'deal', 'deals')})`
        : location.name,
    })),
  ];
}

export function buildCategorySummaries(
  coupons: CouponleoCoupon[],
  categories: CouponleoCategory[],
): CouponleoCategorySummary[] {
  const categoryMap = new Map(categories.map((category) => [category.slug, category]));
  const aggregates = new Map<string, { name: string; couponCount: number; stores: Set<string> }>();

  for (const coupon of coupons) {
    const slug = coupon.categorySlug || slugifyLabel(coupon.categoryName);
    const name = coupon.categoryName || categoryMap.get(slug)?.name || 'Other';
    const existing = aggregates.get(slug);

    if (existing) {
      existing.couponCount += 1;
      existing.stores.add(coupon.storeSlug || String(coupon.storeId));
      continue;
    }

    aggregates.set(slug, {
      name,
      couponCount: 1,
      stores: new Set([coupon.storeSlug || String(coupon.storeId)]),
    });
  }

  return [...aggregates.entries()]
    .map(([slug, aggregate]) => {
      const knownCategory = categoryMap.get(slug);
      const storeCount = aggregate.stores.size;

      return {
        slug,
        name: knownCategory?.name ?? aggregate.name,
        couponCount: aggregate.couponCount,
        storeCount,
        headline: knownCategory?.headline ?? `${formatCount(aggregate.couponCount, 'live offer', 'live offers')} across ${formatCount(storeCount, 'store', 'stores')}.`,
      };
    })
    .sort((left, right) => right.couponCount - left.couponCount || left.name.localeCompare(right.name));
}

export function matchesCountry(selectedCountry: string, location: string | undefined | null): boolean {
  if (!selectedCountry || selectedCountry === 'all') {
    return true;
  }

  return (location ?? '').trim().toLowerCase() === selectedCountry.trim().toLowerCase();
}

export function locationFilterForCountry(country: string): string | undefined {
  const normalizedCountry = normalizeCountryRouteValue(country);
  return normalizedCountry === 'all' ? undefined : normalizedCountry;
}

export function paginateItems<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (Math.max(page, 1) - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function pageCountFor(totalItems: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function buildStoreRoute(slug: string): string {
  return `/stores/${encodeURIComponent(slug)}`;
}

export function buildCategoryRoute(slug: string): string {
  return `/categories/${encodeURIComponent(slug)}`;
}

export function normalizeCountryRouteValue(value: string | null | undefined): string {
  const normalizedValue = value?.trim();
  return normalizedValue ? normalizedValue : 'all';
}

export function buildCountryRouteQuery(country: string): Record<string, string | null> {
  const normalizedCountry = normalizeCountryRouteValue(country);
  return { country: normalizedCountry === 'all' ? null : normalizedCountry };
}

export function resolvePreferredCountry(
  availableCountries: readonly string[],
  locale: string | null | undefined,
  timeZone: string | null | undefined,
  storedCountry: string | null | undefined = null,
): string | null {
  const preferredCandidates = [
    normalizePreferredCountryCandidate(storedCountry),
    normalizePreferredCountryCandidate(countryFromLocale(locale)),
    normalizePreferredCountryCandidate(countryFromTimeZone(timeZone)),
  ].filter(Boolean) as string[];

  for (const candidate of preferredCandidates) {
    const matchedCountry = matchAvailableCountry(availableCountries, candidate);
    if (matchedCountry) {
      return matchedCountry;
    }
  }

  return null;
}

export function slugifyLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'other';
}

function parseDate(value: string): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function buildCategoryPresentation(
  imageSrc: string,
  imageAlt: string,
  theme: CouponleoGeneratedCategoryTheme,
): CouponleoCategoryPresentation {
  const themedPresentation = categoryThemePresentationMap[theme];

  return {
    imageSrc,
    imageAlt,
    icon: themedPresentation.icon,
    tone: themedPresentation.tone,
  };
}

function countryFromLocale(locale: string | null | undefined): string | null {
  const normalizedLocale = String(locale ?? '').trim();
  if (!normalizedLocale) {
    return null;
  }

  const regionMatch = normalizedLocale.match(/[-_](?<region>[A-Za-z]{2})$/);
  const regionCode = regionMatch?.groups?.['region']?.toUpperCase();

  return regionCode ? browserRegionCountryMap[regionCode] ?? null : null;
}

function countryFromTimeZone(timeZone: string | null | undefined): string | null {
  const normalizedTimeZone = String(timeZone ?? '').trim();
  if (!normalizedTimeZone) {
    return null;
  }

  for (const [prefix, country] of timeZoneCountryHints) {
    if (normalizedTimeZone === prefix || normalizedTimeZone.startsWith(`${prefix}/`)) {
      return country;
    }
  }

  return null;
}

function matchAvailableCountry(availableCountries: readonly string[], candidate: string): string | null {
  const normalizedCandidate = candidate.trim().toLowerCase();

  for (const availableCountry of availableCountries) {
    if (availableCountry.trim().toLowerCase() === normalizedCandidate) {
      return availableCountry;
    }
  }

  return null;
}

function normalizePreferredCountryCandidate(country: string | null | undefined): string | null {
  const normalizedCountry = String(country ?? '').trim();
  if (!normalizedCountry || normalizedCountry.toLowerCase() === 'all') {
    return null;
  }

  return normalizedCountry;
}

function resolveUiLocale(): string {
  if (typeof document !== 'undefined') {
    const documentLocale = document.documentElement.lang?.trim();
    if (documentLocale) {
      return documentLocale;
    }
  }

  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }

  return 'en-US';
}
