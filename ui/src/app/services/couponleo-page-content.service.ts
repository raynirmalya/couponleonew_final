import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { CouponleoThemedPageConfig } from '../components/couponleo-themed-page.component';
import {
  CouponleoApiService,
  type CouponleoCategory,
  type CouponleoCoupon,
  type CouponleoDataResponse,
  type CouponleoListResponse,
  type CouponleoLocation,
  type CouponleoStore,
  type CouponleoStoreAnalytics,
} from './couponleo-api.service';
import { CouponleoAuthService } from './couponleo-auth.service';
import { CouponleoLocaleService } from './couponleo-locale.service';
import { createLoadingState, withRequestState } from './couponleo-request-state.helpers';
import {
  buildCouponleoCategoryCardDescription,
  buildCouponleoStoreCardDescription,
  resolveCouponleoLocationSpotlight,
} from './couponleo-seo-copy.helpers';
import {
  buildCategoryRoute,
  buildStoreRoute,
  formatCount,
  formatExpiryLabel,
  getCategoryPresentation,
  isCouponLive,
  slugifyLabel,
} from './couponleo-ui.helpers';
import { translateCouponleoPhrase } from './couponleo-i18n.catalog';
import { CouponleoSavedService, type CouponleoSavedItem } from './couponleo-saved.service';

function emptyListResponse<T>(): CouponleoListResponse<T> {
  return {
    items: [],
    total: 0,
    page: 1,
    pageSize: 0,
    pageCount: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  };
}

function emptyAnalyticsResponse(): CouponleoDataResponse<CouponleoStoreAnalytics> {
  return {
    data: {
      totalCoupons: 0,
      totalStores: 0,
      featuredCoupons: 0,
      liveMarkets: 0,
    },
  };
}

function formatValue(value: number): string {
  return value.toLocaleString(currentUiLocale());
}

function truncate(value: string, maxLength = 140): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function buildSupportNavLinks(activeHref: string) {
  return [
    { href: '/wishlist', label: 'Wishlist', active: activeHref === '/wishlist' },
    { href: '/help-center', label: 'Help Center', active: activeHref === '/help-center' },
    { href: '/terms-of-use', label: 'Terms of Use', active: activeHref === '/terms-of-use' },
    { href: '/privacy-policy', label: 'Privacy Policy', active: activeHref === '/privacy-policy' },
  ];
}

function daysUntil(expiresAt: string): number | null {
  if (!expiresAt) {
    return null;
  }

  const expiry = new Date(`${expiresAt}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) {
    return null;
  }

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffMs = expiry.getTime() - startOfToday.getTime();
  return Math.ceil(diffMs / 86_400_000);
}

function relativeTimeLabel(value: string | undefined): string {
  const locale = currentUiLocale();
  if (!value) {
    return translateCouponleoPhrase(locale, 'Saved earlier');
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return translateCouponleoPhrase(locale, 'Saved earlier');
  }

  const diffMs = Date.now() - parsed.getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60_000));
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (diffMinutes < 60) {
    return formatter.format(-diffMinutes, 'minute');
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return formatter.format(-diffHours, 'hour');
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 14) {
    return formatter.format(-diffDays, 'day');
  }

  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(parsed);
}

function themeToneFromCategory(tone: 'orange' | 'blue' | 'rose'): 'orange' | 'blue' | 'navy' | 'sand' {
  if (tone === 'rose') {
    return 'navy';
  }

  return tone;
}

function currentUiLocale(): string {
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }

  return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
}

function buildSavedRouteLabel(item: CouponleoSavedItem): string {
  const locale = currentUiLocale();
  switch (item.kind) {
    case 'store':
      return translateCouponleoPhrase(locale, 'Open store');
    case 'category':
      return translateCouponleoPhrase(locale, 'Open category');
    default:
      return item.code
        ? translateCouponleoPhrase(locale, 'Review code')
        : translateCouponleoPhrase(locale, 'Open offer');
  }
}

function buildSavedCard(item: CouponleoSavedItem) {
  const locale = currentUiLocale();
  const categoryHint = item.subtitle.split('|').at(1)?.trim() || item.subtitle.split('|').at(0)?.trim() || item.title;
  const presentation = getCategoryPresentation(slugifyLabel(categoryHint));

  return {
    badge: item.kind === 'coupon' || item.kind === 'deal'
      ? translateCouponleoPhrase(locale, 'Saved offer')
      : item.kind === 'store'
        ? translateCouponleoPhrase(locale, 'Saved store')
        : translateCouponleoPhrase(locale, 'Saved category'),
    title: item.title,
    copy: truncate(item.description || item.subtitle, 140),
    meta: `${item.subtitle} | ${relativeTimeLabel(item.savedAt)}`,
    href: item.route,
    cta: buildSavedRouteLabel(item),
    tone: themeToneFromCategory(presentation.tone),
  } as const;
}

function buildCouponCard(coupon: CouponleoCoupon) {
  const locale = currentUiLocale();
  const presentation = getCategoryPresentation(coupon.categorySlug || slugifyLabel(coupon.categoryName));
  const expiresInDays = daysUntil(coupon.expiresAt);
  const badge = coupon.code
    ? translateCouponleoPhrase(locale, 'Coupon code')
    : translateCouponleoPhrase(locale, 'Merchant offer');

  return {
    badge,
    title: coupon.title,
    copy: truncate(coupon.description || coupon.discountText || coupon.savingsNote || translateCouponleoPhrase(locale, 'Open this live offer for full details.'), 145),
    meta: `${coupon.storeName} | ${formatExpiryLabel(coupon.expiresAt)}${expiresInDays !== null && expiresInDays <= 3 ? ` | ${translateCouponleoPhrase(locale, 'Urgent')}` : ''}`,
    href: buildStoreRoute(coupon.storeSlug || String(coupon.storeId)),
    cta: coupon.code
      ? translateCouponleoPhrase(locale, 'Open coupon')
      : translateCouponleoPhrase(locale, 'Open deal'),
    tone: expiresInDays !== null && expiresInDays <= 3 ? 'orange' : themeToneFromCategory(presentation.tone),
  } as const;
}

function buildStoreCard(store: CouponleoStore) {
  const locale = currentUiLocale();
  return {
    badge: store.featured
      ? translateCouponleoPhrase(locale, 'Featured store')
      : translateCouponleoPhrase(locale, 'Store'),
    title: store.name,
    copy: truncate(buildCouponleoStoreCardDescription(store), 145),
    meta: `${store.location || translateCouponleoPhrase(locale, 'Global coverage')} | ${formatCount(store.activeCoupons, 'live offer', 'live offers')}`,
    href: buildStoreRoute(store.slug),
    cta: translateCouponleoPhrase(locale, 'Open store'),
    tone: store.featured ? 'blue' : 'sand',
  } as const;
}

function buildCategoryCard(category: CouponleoCategory) {
  const locale = currentUiLocale();
  const presentation = getCategoryPresentation(category.slug);

  return {
    badge: translateCouponleoPhrase(locale, 'Live category'),
    title: category.name,
    copy: truncate(buildCouponleoCategoryCardDescription(category), 145),
    meta: `${formatCount(category.couponCount, 'live offer', 'live offers')}${category.storeCount ? ` | ${formatCount(category.storeCount, 'store', 'stores')}` : ''}`,
    href: buildCategoryRoute(category.slug),
    cta: translateCouponleoPhrase(locale, 'Open category'),
    tone: themeToneFromCategory(presentation.tone),
  } as const;
}

const memberWorkspaceLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/wishlist', label: 'Wishlist' },
  { href: '/my-coupons', label: 'My Coupons' },
  { href: '/alerts', label: 'Alerts' },
  { href: '/settings', label: 'Settings' },
];

function withActiveMemberLink(activeHref: string) {
  return memberWorkspaceLinks.map((link) => ({
    ...link,
    active: link.href === activeHref,
  }));
}

@Injectable({ providedIn: 'root' })
export class CouponleoPageContentService {
  private readonly api = inject(CouponleoApiService);
  private readonly auth = inject(CouponleoAuthService);
  private readonly localeService = inject(CouponleoLocaleService);
  private readonly saved = inject(CouponleoSavedService);

  private readonly analyticsState = toSignal(
    withRequestState(this.api.getStoreAnalytics(), emptyAnalyticsResponse()),
    { initialValue: createLoadingState(emptyAnalyticsResponse()) },
  );
  private readonly featuredCouponsState = toSignal(
    withRequestState(this.api.listFeaturedCoupons({ active: true, pageSize: 12 }), emptyListResponse<CouponleoCoupon>()),
    { initialValue: createLoadingState(emptyListResponse<CouponleoCoupon>()) },
  );
  private readonly categoriesState = toSignal(
    withRequestState(this.api.listCategories({ pageSize: 18 }), emptyListResponse<CouponleoCategory>()),
    { initialValue: createLoadingState(emptyListResponse<CouponleoCategory>()) },
  );
  private readonly storesState = toSignal(
    withRequestState(this.api.listStores({ featured: true, pageSize: 12 }), emptyListResponse<CouponleoStore>()),
    { initialValue: createLoadingState(emptyListResponse<CouponleoStore>()) },
  );
  private readonly locationsState = toSignal(
    withRequestState(this.api.listLocations({ pageSize: 24 }), emptyListResponse<CouponleoLocation>()),
    { initialValue: createLoadingState(emptyListResponse<CouponleoLocation>()) },
  );

  readonly loading = computed(() =>
    this.analyticsState().loading
    || this.featuredCouponsState().loading
    || this.categoriesState().loading
    || this.storesState().loading
    || this.locationsState().loading,
  );

  readonly session = this.auth.session;
  readonly savedItems = this.saved.items;
  readonly savedCount = this.saved.count;
  readonly storeCount = this.saved.storeCount;
  readonly categoryCount = this.saved.categoryCount;
  readonly dealCount = this.saved.dealCount;
  readonly locale = this.localeService.locale;
  readonly localeLabel = computed(() => (
    this.localeService.localeOptions().find((option) => option.value === this.locale())?.label ?? 'English'
  ));
  readonly siteSummary = computed(() => this.analyticsState().data.data);
  readonly featuredCoupons = computed(() =>
    this.featuredCouponsState().data.items.filter((coupon) => isCouponLive(coupon.expiresAt))
  );
  readonly topCategories = computed(() =>
    [...this.categoriesState().data.items]
      .sort((left, right) => right.couponCount - left.couponCount || left.name.localeCompare(right.name))
  );
  readonly featuredStores = computed(() =>
    [...this.storesState().data.items]
      .sort((left, right) => right.activeCoupons - left.activeCoupons || left.name.localeCompare(right.name))
  );
  readonly markets = computed(() =>
    [...this.locationsState().data.items]
      .sort((left, right) => (right.couponCount ?? 0) - (left.couponCount ?? 0) || left.name.localeCompare(right.name))
  );
  readonly savedCoupons = computed(() => this.savedItems().filter((item) => item.kind === 'deal' || item.kind === 'coupon'));
  readonly savedStores = computed(() => this.savedItems().filter((item) => item.kind === 'store'));
  readonly savedCategories = computed(() => this.savedItems().filter((item) => item.kind === 'category'));
  readonly expiringCoupons = computed(() =>
    [...this.featuredCoupons()]
      .map((coupon) => ({ coupon, daysRemaining: daysUntil(coupon.expiresAt) }))
      .filter((entry) => entry.daysRemaining !== null)
      .sort((left, right) => (left.daysRemaining ?? 999) - (right.daysRemaining ?? 999))
      .map((entry) => entry.coupon)
  );

  readonly myCouponsPageConfig = computed<CouponleoThemedPageConfig>(() => {
    const readyCards = this.savedCoupons().length
      ? this.savedCoupons().slice(0, 3).map(buildSavedCard)
      : this.featuredCoupons().slice(0, 3).map(buildCouponCard);
    const spotlightStores = this.featuredStores().slice(0, 2).map(buildStoreCard);
    const urgentCount = this.expiringCoupons().filter((coupon) => {
      const remainingDays = daysUntil(coupon.expiresAt);
      return remainingDays !== null && remainingDays <= 3;
    }).length;

    return {
      eyebrow: 'My Coupons',
      title: 'Keep your live coupon shortlist ready for the next checkout.',
      description: 'This page keeps your saved offers close at hand, then fills the gaps with strong live picks so your shortlist still feels useful.',
      navLinks: withActiveMemberLink('/my-coupons'),
      actions: [
        { href: '/wishlist', label: 'Open Wishlist' },
        { href: '/top-deals', label: 'Browse Top Deals', variant: 'ghost' },
      ],
      metrics: [
        { value: formatValue(Math.max(this.dealCount(), readyCards.length)), label: 'Codes ready', detail: 'Saved coupons plus live fallbacks' },
        { value: formatValue(urgentCount), label: 'Expiring soon', detail: 'Featured offers closing fastest' },
        { value: formatValue(this.storeCount()), label: 'Tracked stores', detail: 'Saved storefronts in the workspace' },
      ],
      sections: [
        {
          eyebrow: 'Ready Now',
          title: 'Coupons closest to real use',
          copy: 'Saved offers appear first here, and if that list is still light, CouponLeo brings in strong live picks so you still have somewhere sensible to start.',
          columns: 3,
          cards: readyCards,
        },
        {
          eyebrow: 'Keep Momentum',
          title: 'Stores worth opening next',
          columns: 2,
          cards: spotlightStores.length > 0 ? spotlightStores : this.topCategories().slice(0, 2).map(buildCategoryCard),
        },
      ],
      footnote: `${formatCount(this.siteSummary().totalCoupons, 'live offer', 'live offers')} are currently spread across ${formatCount(this.siteSummary().totalStores, 'store', 'stores')}, so the page can stay grounded in real shopping activity.`,
    };
  });

  readonly alertsPageConfig = computed<CouponleoThemedPageConfig>(() => {
    const urgentCoupons = this.expiringCoupons().slice(0, 3).map(buildCouponCard);
    const marketCards = this.markets().slice(0, 2).map((market) => ({
      badge: 'Market watch',
      title: market.name,
      copy: truncate(resolveCouponleoLocationSpotlight(market), 145),
      meta: `${formatCount(market.couponCount ?? 0, 'live offer', 'live offers')}${market.storeCount ? ` • ${formatCount(market.storeCount, 'store', 'stores')}` : ''}`,
      href: `/country-deals?country=${encodeURIComponent(market.name)}`,
      cta: 'Open market',
      tone: 'blue' as const,
    }));

    return {
      eyebrow: 'Alerts',
      title: 'Stay ahead of coupon drops, price moves, and expiring offers.',
      description: 'Alerts keeps the time-sensitive part of CouponLeo in view: expiring offers, strong markets, and the saved places worth checking again.',
      navLinks: withActiveMemberLink('/alerts'),
      actions: [
        { href: '/top-deals', label: 'Find deals to watch' },
        { href: '/wishlist', label: 'Review Wishlist', variant: 'ghost' },
      ],
      metrics: [
        { value: formatValue(urgentCoupons.length), label: 'Urgent alerts', detail: 'Featured offers expiring first' },
        { value: formatValue(this.storeCount()), label: 'Tracked brands', detail: 'Saved stores already in the workspace' },
        { value: formatValue(this.siteSummary().liveMarkets), label: 'Markets live', detail: 'Country coverage available to monitor' },
      ],
      sections: [
        {
          eyebrow: 'Expiring First',
          title: 'The live offers worth checking today',
          columns: 3,
          cards: urgentCoupons.length > 0 ? urgentCoupons : this.featuredCoupons().slice(0, 3).map(buildCouponCard),
        },
        {
          eyebrow: 'Market Watch',
          title: 'Country pages with strong live deal volume',
          columns: 2,
          cards: marketCards,
        },
      ],
      footnote: 'Alerts now leans on the parts of the catalog that actually create urgency, so the page feels more useful when timing matters.',
    };
  });

  readonly analyticsPageConfig = computed<CouponleoThemedPageConfig>(() => {
    return {
      eyebrow: 'Local Telemetry',
      title: 'Visitor telemetry now lives in a separate localhost dashboard.',
      description: 'The main CouponLeo UI keeps telemetry reads out of the shopper experience. Use the dedicated local console for event, IP, and market-level diagnostics.',
      navLinks: withActiveMemberLink('/dashboard'),
      actions: [
        { href: '/dashboard', label: 'Return to dashboard' },
        { href: '/settings', label: 'Open settings', variant: 'ghost' },
      ],
      metrics: [
        { value: 'Local', label: 'Access mode', detail: 'Telemetry reads stay on localhost' },
        { value: 'Keyed', label: 'Read protection', detail: 'The admin key is handled server-side' },
        { value: 'Moved', label: 'Main UI status', detail: 'Public CouponLeo pages no longer render raw telemetry' },
      ],
      sections: [
        {
          eyebrow: 'Protected Access',
          title: 'Why telemetry moved out of the shopper app',
          columns: 3,
          cards: [
            {
              badge: 'Security',
              title: 'Keep IP-backed data private',
              copy: 'Telemetry reads no longer sit on a publicly linked CouponLeo page.',
              meta: 'Raw request details stay behind the local console.',
              href: '/dashboard',
              cta: 'Back to dashboard',
              tone: 'blue',
            },
            {
              badge: 'Admin key',
              title: 'Avoid shipping secrets to the browser',
              copy: 'The local telemetry dashboard reads the secured API server-side instead of exposing the key in frontend code.',
              meta: 'Better separation between shopper UX and internal ops.',
              href: '/settings',
              cta: 'Open settings',
              tone: 'orange',
            },
            {
              badge: 'Cleaner UX',
              title: 'Keep CouponLeo focused on savings flows',
              copy: 'Member routes stay shopper-first while diagnostics move into the dedicated local tool.',
              meta: 'A simpler main app with less operational clutter.',
              href: '/dashboard',
              cta: 'Open dashboard',
              tone: 'navy',
            },
          ],
        },
        {
          eyebrow: 'Main App',
          title: 'Use the regular CouponLeo routes for shopper workflows',
          columns: 2,
          cards: [
            {
              badge: 'Wishlist',
              title: 'Return to saved offers and store follow-up',
              copy: 'Wishlist, alerts, and coupon workflows remain in the main app where members expect them.',
              href: '/wishlist',
              cta: 'Open wishlist',
              tone: 'sand',
            },
            {
              badge: 'Dashboard',
              title: 'Keep the core member workspace clean',
              copy: 'The dashboard stays focused on savings actions rather than operational analytics.',
              href: '/dashboard',
              cta: 'Open dashboard',
              tone: 'blue',
            },
          ],
        },
      ],
      footnote: 'Telemetry reads have intentionally moved into a separate local dashboard for safer operational access.',
    };
  });

  readonly settingsPageConfig = computed<CouponleoThemedPageConfig>(() => {
    const session = this.session();

    return {
      eyebrow: 'Settings',
      title: 'Manage the member context behind your CouponLeo workflow.',
      description: 'Settings now reflects live account context, language choice, and saved-workspace totals so the page is grounded in real session state.',
      navLinks: withActiveMemberLink('/settings'),
      actions: [
        { href: '/help-center', label: 'Open Help Center' },
        { href: '/privacy-policy', label: 'Review Privacy Policy', variant: 'ghost' },
      ],
      metrics: [
        { value: session ? 'Live' : 'Guest', label: 'Account state', detail: session ? `Signed in ${relativeTimeLabel(session.signedInAt)}` : 'Sign in to persist actions beyond this browser' },
        { value: this.localeLabel(), label: 'Language', detail: 'The current UI locale selected in the header' },
        { value: formatValue(this.savedCount()), label: 'Saved items', detail: 'Wishlist content available in this browser' },
      ],
      sections: [
        {
          eyebrow: 'Current Preferences',
          title: 'The settings inputs already reflected in the app',
          columns: 3,
          cards: [
            {
              badge: 'Profile',
              title: session?.fullName ?? 'Guest session',
              copy: truncate(session?.email ?? 'You are currently browsing without a signed-in account.'),
              meta: session ? `${session.provider === 'google' ? 'Google account' : 'Email account'} • ${relativeTimeLabel(session.signedInAt)}` : 'Local browser mode',
              href: session ? '/dashboard' : '/sign-in',
              cta: session ? 'Open dashboard' : 'Sign in',
              tone: 'blue',
            },
            {
              badge: 'Language',
              title: this.localeLabel(),
              copy: 'CouponLeo now keeps a real UI locale setting separate from country filtering.',
              meta: `Active locale: ${this.locale()}`,
              tone: 'sand',
            },
            {
              badge: 'Wishlist',
              title: `${formatValue(this.savedCount())} saved items`,
              copy: 'Saved routes, categories, and offers are already being tracked from the live catalog.',
              meta: `${formatValue(this.storeCount())} stores • ${formatValue(this.categoryCount())} categories • ${formatValue(this.dealCount())} offers`,
              href: '/wishlist',
              cta: 'Open wishlist',
              tone: 'orange',
            },
          ],
        },
        {
          eyebrow: 'Support & Policy',
          title: 'Next stops when you need detail or control',
          columns: 2,
          cards: [
            {
              badge: 'Support',
              title: 'Help Center',
              copy: 'Use help articles and support routes for account, navigation, and coupon questions.',
              href: '/help-center',
              cta: 'Visit help center',
              tone: 'sand',
            },
            {
              badge: 'Privacy',
              title: 'Privacy and terms',
              copy: 'Open the policy pages for the current guidance around session state, saved items, and site usage.',
              href: '/privacy-policy',
              cta: 'Open policy pages',
              tone: 'blue',
            },
          ],
        },
      ],
      footnote: 'Settings now mirrors live session and locale state, so the page is tied to the real app instead of abstract preference copy.',
    };
  });

  readonly helpCenterPageConfig = computed<CouponleoThemedPageConfig>(() => ({
    eyebrow: 'Help Center',
    title: 'How can we help with CouponLeo?',
    description: 'Find quick help for sign-in, saved items, shopping discovery, and the pages that explain how CouponLeo works.',
    heroTone: 'soft',
    layout: 'help',
    sections: [
      {
        eyebrow: 'Offer information',
        title: 'Offers and affiliate links',
        copy: 'CouponLeo brings together merchant and partner feeds, including CouponAPI. A listing in the catalog does not mean that CouponLeo has tested the offer at checkout or that the merchant endorses CouponLeo.',
        variant: 'list',
        columns: 2,
        cards: [
          { badge: 'Sources', title: 'What an active offer means',
            copy: 'An active listing reflects the information available in the feed. Codes, sale prices, expiry dates, countries, and restrictions can change. Check eligibility, minimum spend, exclusions, and the final price with the merchant before paying.', tone: 'blue' },
          { badge: 'Affiliate disclosure', title: 'How CouponLeo may earn money',
            copy: 'We may earn a commission when you buy through some links on CouponLeo. An affiliate link can send you through a network to the merchant so it can attribute a purchase. Revealing a code does not require you to buy anything.', tone: 'sand' },
          { badge: 'Shopping help', title: 'When a code does not work',
            copy: 'Check the offer country, expiry date, product exclusions, account eligibility, and minimum spend. A sale may apply without a code. Compare the total including delivery before completing checkout.', href: '/stores', cta: 'Browse stores', tone: 'navy' },
          { badge: 'Verification', title: 'What a checkout-tested label means',
            copy: 'A checkout-tested label identifies a recorded test of that exact code, with a date, country, and eligibility conditions. A reviewer must inspect evidence that the code reduced the same cart total. Checkout results remain current for at most 24 hours, and end earlier when the offer expires. Changed offers, missing evidence, failed retests, or withdrawn reviews cannot keep the label. Merchant confirmation is shown separately and does not mean a checkout test succeeded.', tone: 'blue' },
          { badge: 'Automatic checks', title: 'What listing checks can establish',
            copy: 'CouponLeo checks offer identifiers, supplied expiry dates, code presence, link format, and conflicting percentage claims. These checks run when offers are served. They do not open an affiliate link, prove merchant availability, or establish that a code works. Open an offer to see its checks and refresh its latest review.', tone: 'sand' },
          { badge: 'Corrections', title: 'Report an offer or content concern',
            copy: 'Send the CouponLeo page address, merchant name, and the incorrect offer details through Contact. For a logo, image, or description rights concern, include the affected material and the basis of your request so the team can review it.', href: '/contact', cta: 'Contact CouponLeo', tone: 'orange' },
        ],
      },
      {
        eyebrow: 'Common questions',
        title: 'Start with what you need help with',
        copy: 'These are the most common starting points for shoppers using CouponLeo.',
        variant: 'list',
        columns: 2,
        cards: [
          {
            badge: 'Account',
            title: 'Sign-in help and account access',
            copy: 'Start here if you cannot sign in, lost your session, or need to get back to your saved CouponLeo tools.',
            meta: this.session() ? `${this.session()?.email ?? 'Member'} is signed in right now` : 'Guest mode is active until the shopper signs in',
            href: '/sign-in',
            cta: 'Open sign in',
            tone: 'blue',
          },
          {
            badge: 'Wishlist',
            title: 'Saved items and follow-up shopping',
            copy: 'Open Wishlist when you want to return to saved stores, categories, or offers without starting over.',
            meta: `${formatValue(this.savedCount())} saved items are available in this browser workspace`,
            href: '/wishlist',
            cta: 'Open wishlist',
            tone: 'orange',
          },
          {
            badge: 'Catalog',
            title: 'Finding the right store, category, or deal',
            copy: 'Browse the public catalog when the question is less about your account and more about where to start shopping.',
            meta: `${formatCount(this.siteSummary().totalStores, 'store', 'stores')} and ${formatCount(this.topCategories().length, 'category', 'categories')} are already available`,
            href: '/stores',
            cta: 'Browse stores',
            tone: 'sand',
          },
          {
            badge: 'Alerts',
            title: 'Watching expiring offers and deal timing',
            copy: 'Use Alerts when you want to keep track of fast-moving offers or check whether a deal is still worth revisiting.',
            meta: `${formatValue(this.expiringCoupons().slice(0, 4).length)} urgent featured offers are surfaced right now`,
            href: '/alerts',
            cta: 'Open alerts',
            tone: 'navy',
          },
        ],
      },
      {
        eyebrow: 'Quick links',
        title: 'Popular places shoppers go next',
        copy: 'If you already know what you want to do, these links get you there faster.',
        variant: 'list',
        columns: 2,
        cards: [
          {
            badge: 'Stores',
            title: 'Browse stores',
            copy: 'Best when you know the brand and want to check today\'s live savings in one place.',
            meta: `${formatCount(this.siteSummary().totalStores, 'store', 'stores')} are searchable today`,
            href: '/stores',
            cta: 'Browse stores',
            tone: 'blue',
          },
          {
            badge: 'Categories',
            title: 'Explore categories',
            copy: 'Useful when you know what you want to buy but still want to compare more than one store.',
            meta: `${formatCount(this.topCategories().length, 'active category', 'active categories')} are surfaced here`,
            href: '/categories',
            cta: 'Browse categories',
            tone: 'sand',
          },
          {
            badge: 'Markets',
            title: 'Shop by country',
            copy: 'Helpful when prices, delivery, or promo rules change from one market to another.',
            meta: `${formatCount(this.siteSummary().liveMarkets, 'market', 'markets')} supported`,
            href: '/country-deals',
            cta: 'Open country deals',
            tone: 'navy',
          },
          {
            badge: 'Coupons',
            title: 'Review saved coupons',
            copy: 'A good next stop when you want to pick up where you left off with saved offers.',
            meta: `${formatValue(this.savedCount())} saved actions can already be carried into this flow`,
            href: '/my-coupons',
            cta: 'Open my coupons',
            tone: 'orange',
          },
        ],
      },
      {
        eyebrow: 'Policies and contact',
        title: 'Policies, privacy, and direct support',
        copy: 'Use these when the question is about trust, data handling, or you need to contact the team directly.',
        variant: 'list',
        columns: 2,
        cards: [
          {
            badge: 'Privacy',
            title: 'Privacy Policy',
            copy: 'See how CouponLeo handles saved items, account state, locale preferences, and related product data.',
            href: '/privacy-policy',
            cta: 'Read privacy policy',
            tone: 'sand',
          },
          {
            badge: 'Terms',
            title: 'Terms of Use',
            copy: 'Read the ground rules for using CouponLeo and understand where merchant terms take over at checkout.',
            href: '/terms-of-use',
            cta: 'Read terms of use',
            tone: 'navy',
          },
          {
            badge: 'Contact',
            title: 'Reach support directly',
            copy: 'Use Contact when the issue needs a direct reply, involves account details, or relates to partnerships and business requests.',
            href: '/contact',
            cta: 'Contact support',
            tone: 'blue',
          },
          {
            badge: 'Wishlist',
            title: 'Go back to Wishlist',
            copy: 'Jump back into saved items when you already know what you want to revisit.',
            href: '/wishlist',
            cta: 'Open wishlist',
            tone: 'orange',
          },
        ],
      },
    ],
  }));

  readonly termsOfUsePageConfig = computed<CouponleoThemedPageConfig>(() => ({
    eyebrow: 'Legal',
    title: 'CouponLeo Terms of Use',
    description: 'These terms explain how CouponLeo presents offers, where merchant responsibility begins, and what responsible use of the site looks like.',
    heroTone: 'soft',
    layout: 'legal',
    lastUpdated: 'June 17, 2026',
    sections: [
      {
        eyebrow: '1. Using the service',
        title: 'Using CouponLeo',
        copy: 'CouponLeo helps shoppers discover offers and navigate to merchants. The final purchase flow always happens on the merchant site.',
        variant: 'legal',
        cards: [
          {
            badge: 'Catalog',
            title: 'Offer listings are for discovery',
            copy: 'CouponLeo organizes stores, categories, and current offers to help shoppers browse. Listings do not guarantee availability or redemption.',
            meta: `${formatCount(this.siteSummary().totalCoupons, 'live offer', 'live offers')} can currently route out to merchant pages`,
            tone: 'blue',
          },
          {
            badge: 'Merchant sites',
            title: 'Merchant terms still apply',
            copy: 'Pricing, inventory, coupon validity, shipping, and checkout rules remain controlled by the destination merchant.',
            meta: `${formatValue(this.siteSummary().totalStores)} merchant routes are currently listed`,
            tone: 'navy',
          },
          {
            badge: 'Saved tools',
            title: 'Saved pages support research, not guarantees',
            copy: 'Wishlist, alerts, and member pages help shoppers return to offers later, but they do not promise that an offer will remain active.',
            meta: `${formatValue(this.savedCount())} saved items can already be tracked locally`,
            tone: 'sand',
          },
        ],
      },
      {
        eyebrow: '2. Shopper responsibilities',
        title: 'Your responsibilities',
        copy: 'Using the site responsibly helps keep the catalog and member tools useful for everyone.',
        variant: 'legal',
        cards: [
          {
            badge: 'Accounts',
            title: 'Use accurate account information',
            copy: 'Members should use legitimate identity details, protect their credentials, and avoid sharing access in ways that compromise the service or another user.',
            meta: this.session() ? 'An active local member session is available in this workspace' : 'Guest browsing is active until a user signs in',
            tone: 'sand',
          },
          {
            badge: 'Verification',
            title: 'Treat coupon information as time-sensitive',
            copy: 'Coupon copy, timing, eligibility, and campaign rules can change. Shoppers should still verify the final details on the merchant site before completing a purchase.',
            meta: `${formatValue(this.siteSummary().featuredCoupons)} featured offers are surfaced with live context today`,
            tone: 'blue',
          },
          {
            badge: 'Acceptable use',
            title: 'Do not misuse content or abuse platform flows',
            copy: 'Shoppers should not automate abusive scraping, misrepresent CouponLeo content as merchant guarantees, or use the service in ways that interfere with normal platform operation.',
            meta: `${formatValue(this.topCategories().length)} active categories shape the current catalog experience`,
            tone: 'blue',
          },
        ],
      },
      {
        eyebrow: '3. Changes and contact',
        title: 'Changes and support',
        copy: 'Policy text and product behavior may change as CouponLeo grows.',
        variant: 'legal',
        cards: [
          {
            badge: 'Policy updates',
            title: 'These terms may be updated',
            copy: 'CouponLeo can revise policy copy, member tooling, or merchant coverage over time. Updated terms apply to future use of the product.',
            tone: 'sand',
          },
          {
            badge: 'Support',
            title: 'Use Help Center for operational questions',
            copy: 'If the question is about how a route works, where to find something, or how to resolve a shopper workflow issue, Help Center is the right starting point.',
            href: '/help-center',
            cta: 'Visit help center',
            tone: 'navy',
          },
          {
            badge: 'Privacy',
            title: 'Use Privacy Policy for data questions',
            copy: 'Open the Privacy Policy for the current explanation of session handling, local saves, locale preferences, and support-related data.',
            href: '/privacy-policy',
            cta: 'Open privacy page',
            tone: 'blue',
          },
        ],
      },
    ],
  }));

  readonly privacyPolicyPageConfig = computed<CouponleoThemedPageConfig>(() => ({
    eyebrow: 'Legal',
    title: 'CouponLeo Privacy Policy',
    description: 'This policy explains how the CouponLeo website and the CouponLeo Companion browser extension handle account sessions, saved items, current-store matching, browser storage, telemetry, and support requests.',
    heroTone: 'soft',
    layout: 'legal',
    lastUpdated: 'September 7, 2026',
    sections: [
      {
        eyebrow: '1. Information we collect',
        title: 'Information we collect',
        copy: 'CouponLeo collects a limited set of information that is directly tied to visible website and extension features.',
        variant: 'legal',
        cards: [
          {
            badge: 'Session',
            title: 'Account identity and session state',
            copy: 'Email or Google sign-in can create an account session so CouponLeo can personalize the dashboard, restore member context, and keep signed-in routes working across the website and extension.',
            meta: this.session() ? `${this.session()?.email} | ${relativeTimeLabel(this.session()?.signedInAt)}` : 'No active signed-in session right now',
            tone: 'blue',
          },
          {
            badge: 'Browser storage',
            title: 'Saved items and local preferences',
            copy: 'CouponLeo can store wishlist items, saved stores, locale settings, market context, dismissed notices, and similar browser-level preferences so users can resume work without starting over.',
            meta: `${formatValue(this.storeCount())} stores | ${formatValue(this.categoryCount())} categories | ${formatValue(this.dealCount())} offers`,
            tone: 'orange',
          },
          {
            badge: 'Browsing context',
            title: 'Website and extension page context',
            copy: 'The website can use route, market, and browsing context to keep pages relevant. The browser extension can read the current store URL or hostname so it can determine whether CouponLeo has matching offers for the site the user is visiting.',
            meta: `${this.locale()} locale active | ${formatValue(this.siteSummary().liveMarkets)} markets available`,
            tone: 'navy',
          },
          {
            badge: 'Telemetry',
            title: 'Usage events and service diagnostics',
            copy: 'Website analytics stay off until you choose Allow analytics. If allowed, Google Analytics and CouponLeo usage events measure page views and coupon interactions, with browser, device, language, timezone, and approximate IP-based location. CouponLeo website usage events omit account email addresses and URL query strings. The browser extension has separate telemetry behavior, including popup and notice actions, that this website choice does not control.',
            meta: `${formatCount(this.siteSummary().totalCoupons, 'live offer', 'live offers')} can currently be measured through product usage flows`,
            tone: 'sand',
          },
        ],
      },
      {
        eyebrow: '2. How we use and share information',
        title: 'How we use and share information',
        copy: 'CouponLeo uses account and preference information to operate the service and optional website analytics to understand usage. Requests to the website and its providers also carry technical information such as your IP address.',
        variant: 'legal',
        cards: [
          {
            badge: 'Operations',
            title: 'To run website and extension features',
            copy: 'Session state, saved items, locale preferences, store-matching logic, and catalog context are used to power dashboard routes, public browsing pages, extension popup behavior, saved-store flows, and on-page CouponLeo notices.',
            tone: 'blue',
          },
          {
            badge: 'Authentication',
            title: 'To support sign-in and session recovery',
            copy: 'CouponLeo can use account and session data to authenticate members, restore access to saved tools, and complete sign-in handoff between the website and the browser extension.',
            tone: 'sand',
          },
          {
            badge: 'Measurement',
            title: 'To measure performance and improve quality',
            copy: 'Usage events and service diagnostics can be used to understand whether pages, offers, popups, and extension actions are working correctly and to improve the relevance and stability of CouponLeo features over time.',
            tone: 'navy',
          },
          {
            badge: 'Sharing',
            title: 'Website services and external providers',
            copy: 'Website and extension features communicate with CouponLeo APIs. If you allow website analytics, your browser also contacts Google Analytics and IP-location providers ipapi.co or ipwho.is. Using Google sign-in contacts Google for authentication. Following an affiliate link may share referral information with the affiliate network and merchant under their own privacy policies.',
            tone: 'orange',
          },
        ],
      },
      {
        eyebrow: '3. Your choices',
        title: 'Your choices and updates',
        copy: 'Choose Allow analytics or Reject analytics in the website privacy notice. You can change your choice using Privacy choices in the footer. Rejecting analytics keeps sign-in, browsing, and saved-item features available. Withdrawal stops further optional website events and clears local CouponLeo analytics identifiers, queued events, location cache, and accessible Google Analytics cookies; it does not delete data already sent. Contact the team for questions about previously collected data.',
        variant: 'legal',
        cards: [
          {
            badge: 'Control',
            title: 'Manage saved items, preferences, and browser state',
            copy: 'Shoppers can review wishlist content, move between guest and signed-in flows, change locale or market context, sign out, clear local browser data, or remove the extension if they no longer want it active.',
            href: '/settings',
            cta: 'Open settings',
            tone: 'sand',
          },
          {
            badge: 'Questions',
            title: 'Use Help Center or Contact for privacy questions',
            copy: 'Help Center is the fastest place for route-level guidance. Contact is the right path when the question is account-sensitive, extension-specific, or needs a direct response from the CouponLeo team.',
            href: '/help-center',
            cta: 'Visit help center',
            tone: 'blue',
          },
          {
            badge: 'Updates',
            title: 'This policy can change as the product changes',
            copy: 'CouponLeo may update this privacy policy when website features, browser-extension behavior, account tooling, telemetry handling, or support workflows change in a material way.',
            href: '/contact',
            cta: 'Contact the team',
            tone: 'navy',
          },
        ],
      },
    ],
    footnote: 'This privacy policy is intended to cover both couponleo.com and the CouponLeo Companion browser extension so users can review one consistent explanation of account, browsing, storage, and telemetry behavior.',
  }));
}
