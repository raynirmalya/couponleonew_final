import { computed, signal, Type } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { CouponleoFooterComponent } from '../components/couponleo-footer.component';
import { CouponleoHeaderComponent } from '../components/couponleo-header.component';
import DashboardPage from './dashboard.page';
import HelpCenterPage from './help-center.page';
import AlertsPage from './alerts.page';
import WishlistPage from './wishlist-content';
import {
  CouponleoAuthService,
  type CouponleoSession,
} from '../services/couponleo-auth.service';
import {
  CouponleoSavedService,
  type CouponleoSavedItem,
} from '../services/couponleo-saved.service';
import { CouponleoApiService } from '../services/couponleo-api.service';

function createAuthMock(session: CouponleoSession | null = null): Pick<
  CouponleoAuthService,
  'isAuthenticated' | 'session' | 'signOut'
> {
  const sessionState = signal<CouponleoSession | null>(session);

  return {
    session: sessionState.asReadonly(),
    isAuthenticated: computed(() => sessionState() !== null),
    signOut: () => undefined,
  };
}

function createSavedMock(items: CouponleoSavedItem[] = []): Pick<
  CouponleoSavedService,
  'categoryCount' | 'count' | 'dealCount' | 'items' | 'offerCount' | 'remove' | 'storeCount'
> {
  const itemsState = signal(items);

  return {
    items: itemsState.asReadonly(),
    count: computed(() => itemsState().length),
    storeCount: computed(() => itemsState().filter((item) => item.kind === 'store').length),
    categoryCount: computed(() => itemsState().filter((item) => item.kind === 'category').length),
    dealCount: computed(() => itemsState().filter((item) => item.kind === 'deal' || item.kind === 'coupon').length),
    offerCount: computed(() => itemsState().filter((item) => item.kind === 'deal' || item.kind === 'coupon').length),
    remove: () => undefined,
  };
}

function createApiMock(): Pick<CouponleoApiService, 'listLocations'> {
  return {
    listLocations: () => of({
      items: [
        { id: 'global', name: 'Global', country: 'Global', spotlight: 'Global market', code: 'GLOBAL', storeCount: 1143, couponCount: 28360 },
        { id: 'india', name: 'India', country: 'India', spotlight: 'India market', code: 'IN', storeCount: 14, couponCount: 560 },
      ],
      total: 2,
    }),
  };
}

function createContentApiMock(): Pick<
  CouponleoApiService,
  'getStoreAnalytics' | 'listCategories' | 'listFeaturedCoupons' | 'listLocations' | 'listStores'
> {
  const emptyList = {
    items: [],
    total: 0,
    page: 1,
    pageSize: 0,
    pageCount: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  return {
    getStoreAnalytics: () => of({
      data: {
        totalCoupons: 42,
        totalStores: 12,
        featuredCoupons: 4,
        liveMarkets: 2,
      },
    }),
    listCategories: () => of(emptyList),
    listFeaturedCoupons: () => of(emptyList),
    listLocations: () => of({
      ...emptyList,
      items: [
        { id: 'global', name: 'Global', country: 'Global', spotlight: 'Global market', code: 'GLOBAL', storeCount: 12, couponCount: 42 },
        { id: 'india', name: 'India', country: 'India', spotlight: 'India market', code: 'IN', storeCount: 6, couponCount: 20 },
      ],
      total: 2,
    }),
    listStores: () => of(emptyList),
  };
}

async function createFixture<T>(component: Type<T>, providers: object[] = []): Promise<ComponentFixture<T>> {
  TestBed.resetTestingModule();

  await TestBed.configureTestingModule({
    imports: [component],
    providers: [provideRouter([]), provideLocationMocks(), ...providers],
  }).compileComponents();

  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function findAnchorByText<T>(fixture: ComponentFixture<T>, text: string): HTMLAnchorElement | undefined {
  return [...fixture.nativeElement.querySelectorAll('a')]
    .find((node) => node.textContent?.replace(/\s+/g, ' ').trim() === text) as HTMLAnchorElement | undefined;
}

function findAnchorByAriaLabel<T>(fixture: ComponentFixture<T>, label: string): HTMLAnchorElement | undefined {
  return [...fixture.nativeElement.querySelectorAll('a')]
    .find((node) => node.getAttribute('aria-label') === label) as HTMLAnchorElement | undefined;
}

describe('CouponLeo navigation shell', () => {
  it('shows Wishlist in the header and routes footer links to real pages', async () => {
    const headerFixture = await createFixture(CouponleoHeaderComponent, [
      { provide: CouponleoApiService, useValue: createApiMock() },
      { provide: CouponleoAuthService, useValue: createAuthMock() },
      { provide: CouponleoSavedService, useValue: createSavedMock([{ id: '1', kind: 'coupon', title: 'A', subtitle: 'B', description: 'C', route: '/top-deals' }]) },
    ]);

    const wishlistHeaderLink = findAnchorByAriaLabel(headerFixture, 'Wishlist');
    expect(wishlistHeaderLink?.getAttribute('href')).toContain('/wishlist');
    expect(headerFixture.nativeElement.querySelector('.couponleo-nav__saved app-couponleo-eon-icon')).not.toBeNull();
    expect((headerFixture.nativeElement.querySelector('.couponleo-nav__saved-count') as HTMLElement | null)?.textContent?.trim()).toBe('1');
    expect(findAnchorByText(headerFixture, 'Country Deals')?.getAttribute('href')).toContain('/country-deals');

    const footerFixture = await createFixture(CouponleoFooterComponent);

    expect(findAnchorByText(footerFixture, 'Country Deals')?.getAttribute('href')).toContain('/country-deals');
    expect(findAnchorByText(footerFixture, 'Careers')).toBeUndefined();
    expect(findAnchorByText(footerFixture, 'Press')).toBeUndefined();
    expect(findAnchorByText(footerFixture, 'Wishlist')?.getAttribute('href')).toContain('/wishlist');
    expect(findAnchorByText(footerFixture, 'Help Center')?.getAttribute('href')).toContain('/help-center');
    expect(findAnchorByText(footerFixture, 'Terms of Use')?.getAttribute('href')).toContain('/terms-of-use');
    expect(findAnchorByText(footerFixture, 'Privacy Policy')?.getAttribute('href')).toContain('/privacy-policy');
  });

  it('renders working auth hrefs in the header', async () => {
    const fixture = await createFixture(CouponleoHeaderComponent, [
      { provide: CouponleoApiService, useValue: createApiMock() },
      { provide: CouponleoAuthService, useValue: createAuthMock() },
      { provide: CouponleoSavedService, useValue: createSavedMock() },
    ]);

    const signInLink = findAnchorByText(fixture, 'Sign In');
    const signUpLink = findAnchorByText(fixture, 'Sign Up');

    expect(signInLink?.getAttribute('href')).toContain('/sign-in');
    expect(signUpLink?.getAttribute('href')).toContain('/sign-up');
  });

  it('renders the header wishlist as an icon control', async () => {
    const fixture = await createFixture(CouponleoHeaderComponent, [
      { provide: CouponleoApiService, useValue: createApiMock() },
      { provide: CouponleoAuthService, useValue: createAuthMock() },
      { provide: CouponleoSavedService, useValue: createSavedMock() },
    ]);

    const wishlistHeaderLink = findAnchorByAriaLabel(fixture, 'Wishlist');
    const visibleLabel = fixture.nativeElement.querySelector('.couponleo-nav__saved-label') as HTMLElement | null;

    expect(wishlistHeaderLink).toBeDefined();
    expect(wishlistHeaderLink?.getAttribute('title')).toBe('Wishlist');
    expect(wishlistHeaderLink?.querySelector('app-couponleo-eon-icon')).not.toBeNull();
    expect(visibleLabel).not.toBeNull();
  });

  it('keeps country and language controls before wishlist and hides market counts in the header', async () => {
    const fixture = await createFixture(CouponleoHeaderComponent, [
      { provide: CouponleoApiService, useValue: createApiMock() },
      { provide: CouponleoAuthService, useValue: createAuthMock() },
      { provide: CouponleoSavedService, useValue: createSavedMock() },
    ]);

    const actions = fixture.nativeElement.querySelector('.couponleo-nav__actions') as HTMLElement | null;
    const marketLabel = fixture.nativeElement.querySelector('.couponleo-nav__market') as HTMLElement | null;
    const localeLabel = fixture.nativeElement.querySelector('.couponleo-nav__locale') as HTMLElement | null;
    const wishlistLink = findAnchorByAriaLabel(fixture, 'Wishlist');
    const signInLink = findAnchorByText(fixture, 'Sign In');
    const signUpLink = findAnchorByText(fixture, 'Sign Up');
    const marketSelect = fixture.nativeElement.querySelector('.couponleo-nav__market select') as HTMLSelectElement | null;
    const optionTexts = [...fixture.nativeElement.querySelectorAll('.couponleo-nav__market option')]
      .map((node) => node.textContent?.trim() ?? '');

    expect(actions).not.toBeNull();
    expect(marketLabel).not.toBeNull();
    expect(marketSelect).not.toBeNull();
    expect(localeLabel).not.toBeNull();
    expect(wishlistLink).toBeDefined();
    expect(signInLink).toBeDefined();
    expect(signUpLink).toBeDefined();
    expect(actions!.children[0]).toBe(marketLabel);
    expect(actions!.children[1]).toBe(localeLabel);
    expect(actions!.children[2]).toBe(wishlistLink);
    expect(marketLabel!.compareDocumentPosition(wishlistLink!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(localeLabel!.compareDocumentPosition(wishlistLink!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(wishlistLink!.compareDocumentPosition(signInLink!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(wishlistLink!.compareDocumentPosition(signUpLink!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(marketSelect!.value).toBe('all');
    expect(optionTexts).toContain('All Markets');
    expect(optionTexts).toContain('Global');
    expect(optionTexts).toContain('India');
    expect(optionTexts.join(' ')).not.toContain('deal');
    expect(optionTexts.join(' ')).not.toContain('(');
  });

  it('wires dashboard sidebar and action links to the completed routes', async () => {
    const fixture = await createFixture(DashboardPage, [
      { provide: CouponleoApiService, useValue: createContentApiMock() },
      {
        provide: CouponleoAuthService,
        useValue: createAuthMock({
          fullName: 'Coupon Leo',
          email: 'shopper@couponleo.com',
          provider: 'email',
          signedInAt: '2026-06-13T00:00:00.000Z',
        }),
      },
    ]);

    expect(findAnchorByText(fixture, 'Wishlist')?.getAttribute('href')).toContain('/wishlist');
    expect(findAnchorByText(fixture, 'My Coupons')?.getAttribute('href')).toContain('/my-coupons');
    expect(findAnchorByText(fixture, 'Alerts')?.getAttribute('href')).toContain('/alerts');
    expect(findAnchorByText(fixture, 'Settings')?.getAttribute('href')).toContain('/settings');
    expect(findAnchorByText(fixture, 'Stores')).toBeUndefined();
    expect(findAnchorByText(fixture, 'Categories')).toBeUndefined();
    expect(findAnchorByText(fixture, 'Top Deals')).toBeUndefined();
    expect(findAnchorByText(fixture, 'Analytics')).toBeUndefined();
    expect(findAnchorByText(fixture, 'Cashback')).toBeUndefined();
    expect(findAnchorByText(fixture, 'Rewards')).toBeUndefined();

    expect((fixture.nativeElement.querySelector('.couponleo-dashboard-shell__topbar-actions a.couponleo-button') as HTMLAnchorElement | null)?.getAttribute('href'))
      .toContain('/alerts');
    expect((fixture.nativeElement.querySelector('.couponleo-dashboard-card--saved .couponleo-dashboard-card__header a') as HTMLAnchorElement | null)?.getAttribute('href'))
      .toContain('/wishlist');
    expect((fixture.nativeElement.querySelector('.couponleo-dashboard-card--activity .couponleo-dashboard-card__header a') as HTMLAnchorElement | null)?.getAttribute('href'))
      .toContain('/my-coupons');
    expect(fixture.nativeElement.querySelector('.couponleo-dashboard-shell__invite')).toBeNull();
    expect(fixture.nativeElement.querySelector('.couponleo-dashboard-shell__search')).toBeNull();
    expect(fixture.nativeElement.querySelector('.couponleo-dashboard-card--browse')).toBeNull();
    expect(fixture.nativeElement.querySelector('.couponleo-dashboard-card__alert-summary')).not.toBeNull();
  }, 25_000);

  it('renders the member utility pages with active dashboard navigation', async () => {
    const fixture = await createFixture(AlertsPage, [
      { provide: CouponleoApiService, useValue: createContentApiMock() },
    ]);

    expect(fixture.nativeElement.textContent).toContain('Stay ahead of coupon drops, price moves, and expiring offers.');
    expect((fixture.nativeElement.querySelector('.couponleo-themed-page__nav-link.is-active') as HTMLAnchorElement | null)?.textContent)
      .toContain('Alerts');
    expect(findAnchorByText(fixture, 'Find deals to watch')?.getAttribute('href')).toContain('/top-deals');
  }, 25_000);

  it('renders the footer support pages with the shared theme', async () => {
    const fixture = await createFixture(HelpCenterPage, [
      { provide: CouponleoApiService, useValue: createContentApiMock() },
    ]);

    expect(fixture.nativeElement.textContent).toContain('How can we help with CouponLeo?');
    expect(findAnchorByText(fixture, 'Contact support')?.getAttribute('href')).toContain('/contact');
    expect(findAnchorByText(fixture, 'Read privacy policy')?.getAttribute('href')).toContain('/privacy-policy');
    expect(findAnchorByText(fixture, 'Read terms of use')?.getAttribute('href')).toContain('/terms-of-use');
  }, 25_000);

  it('renders the wishlist page with updated copy and ASCII code masking', async () => {
    const fixture = await createFixture(WishlistPage, [
      { provide: CouponleoAuthService, useValue: createAuthMock() },
      {
        provide: CouponleoSavedService,
        useValue: createSavedMock([
          {
            id: 'coupon-1',
            kind: 'coupon',
            title: 'dooxi.com',
            subtitle: '10% off',
            description: 'Verified wishlist coupon.',
            route: '/top-deals',
            code: 'SAVE10',
          },
        ]),
      },
    ]);

    expect(fixture.nativeElement.textContent).toContain('Wishlist');
    expect(fixture.nativeElement.textContent).toContain('Wishlist items');
    expect(fixture.nativeElement.textContent).toContain('Favorite Deals');
    expect(fixture.nativeElement.textContent).toContain('Favorite Deal');
    expect((fixture.nativeElement.querySelector('.couponleo-code--masked') as HTMLButtonElement | null)?.textContent)
      .toContain('SAV***');
  });
});
