import { Type } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { delay, of } from 'rxjs';

import BlogPage from './blog.page';
import CategoryDealsPage from './categories/[slug].page';
import CategoriesPage from './categories/index.page';
import CountryDealsPage from './country-deals.page';
import Home from './index.page';
import StoreDealsPage from './stores/[slug].page';
import StoresPage from './stores/index.page';
import TopDealsPage from './top-deals.page';
import {
  CouponleoApiService,
  type CouponleoBlogArticle,
  type CouponleoCategory,
  type CouponleoCoupon,
  type CouponleoDataResponse,
  type CouponleoListResponse,
  type CouponleoLocation,
  type CouponleoStore,
} from '../services/couponleo-api.service';
import { CouponleoSavedService } from '../services/couponleo-saved.service';

const mockCategories: CouponleoCategory[] = [
  { id: 'fashion', name: 'Fashion', slug: 'fashion', headline: 'Style picks', couponCount: 2, storeCount: 2 },
  { id: 'electronics', name: 'Electronics', slug: 'electronics', headline: 'Gadgets and gear', couponCount: 1, storeCount: 1 },
  { id: 'travel', name: 'Travel', slug: 'travel', headline: 'Flights and stays', couponCount: 1, storeCount: 1 },
];

const mockCoupons: CouponleoCoupon[] = [
  {
    id: 1,
    slug: 'dooxi-fashion-deal',
    title: '10% OFF Home Decor Purchase',
    description: 'Live India fashion offer from Dooxi.',
    code: 'DOOXI10',
    discountText: '10% off',
    type: 'code',
    storeId: 'store-dooxi',
    storeName: 'dooxi.com',
    storeSlug: 'dooxi-com',
    categorySlug: 'fashion',
    categoryName: 'Fashion',
    featured: true,
    verified: true,
    expiresAt: '2099-12-31',
    ctaUrl: 'https://dooxi.com',
    savingsNote: 'Save 10%',
    score: 98,
    location: 'India',
    primary_location: 'India',
    locations: 'IN',
  },
  {
    id: 2,
    slug: 'techmart-electronics-deal',
    title: '20% Off Gadgets',
    description: 'Fresh electronics coupon from TechMart.',
    code: 'TECH20',
    discountText: '20% off',
    type: 'code',
    storeId: 'store-techmart',
    storeName: 'TechMart',
    storeSlug: 'techmart',
    categorySlug: 'electronics',
    categoryName: 'Electronics',
    featured: true,
    verified: true,
    expiresAt: '2099-12-31',
    ctaUrl: 'https://techmart.example',
    savingsNote: 'Used 320 times',
    score: 91,
    location: 'United States of America',
    primary_location: 'United States of America',
    locations: 'US',
  },
  {
    id: 3,
    slug: 'flyaway-travel-deal',
    title: 'Flat $30 Off Flights',
    description: 'Global travel coupon for FlyAway.',
    code: 'FLY30',
    discountText: '$30 off',
    type: 'code',
    storeId: 'store-flyaway',
    storeName: 'FlyAway',
    storeSlug: 'flyaway',
    categorySlug: 'travel',
    categoryName: 'Travel',
    featured: true,
    verified: true,
    expiresAt: '2099-12-31',
    ctaUrl: 'https://flyaway.example',
    savingsNote: 'Best travel rate',
    score: 87,
    location: 'Global',
    primary_location: 'Global',
    locations: 'GLOBAL',
  },
];

const mockStores: CouponleoStore[] = [
  {
    id: 1,
    name: 'dooxi.com',
    slug: 'dooxi-com',
    headline: 'Indian home decor and style deals.',
    location: 'India',
    category: 'Fashion',
    activeCoupons: 5,
    savings: 'Save 10%',
    featured: true,
  },
  {
    id: 2,
    name: 'TechMart',
    slug: 'techmart',
    headline: 'Electronics deals for US shoppers.',
    location: 'United States of America',
    category: 'Electronics',
    activeCoupons: 3,
    savings: '20% off',
    featured: true,
  },
  {
    id: 3,
    name: 'FlyAway',
    slug: 'flyaway',
    headline: 'Global travel savings.',
    location: 'Global',
    category: 'Travel',
    activeCoupons: 4,
    savings: '$30 off',
    featured: true,
  },
  {
    id: 4,
    name: 'Zeal Wear',
    slug: 'zeal-wear',
    headline: 'Fashion picks for India shoppers.',
    location: 'India',
    category: 'Fashion',
    activeCoupons: 2,
    savings: '15% off',
    featured: false,
  },
];

const mockLocations: CouponleoLocation[] = [
  { id: 'IN', code: 'IN', name: 'India', country: 'India', spotlight: 'India market', couponCount: 1, storeCount: 2 },
  {
    id: 'US',
    code: 'US',
    name: 'United States of America',
    country: 'United States of America',
    spotlight: 'US market',
    couponCount: 1,
    storeCount: 1,
  },
  { id: 'GLOBAL', code: 'GLOBAL', name: 'Global', country: 'Global', spotlight: 'Global market', couponCount: 1, storeCount: 1 },
];

const mockBlogArticles: CouponleoBlogArticle[] = [
  {
    id: 1,
    sourceName: 'Slickdeals',
    sourceHomeUrl: 'https://slickdeals.net/',
    articleUrl: 'https://slickdeals.net/f/featured-home-tech',
    canonicalUrl: 'https://slickdeals.net/f/featured-home-tech',
    slug: 'slickdeals-featured-home-tech',
    title: 'Best home tech deals this week',
    excerpt: 'A live source story covering notable home tech discounts.',
    imageUrl: 'https://images.example/slickdeals-tech.png',
    authorName: 'Team Slickdeals',
    publishedAt: '2026-06-15T12:00:00Z',
    topic: 'Deals',
    languageCode: 'en-US',
    marketScope: 'United States of America',
    featured: true,
    active: true,
  },
  {
    id: 2,
    sourceName: 'DealNews',
    sourceHomeUrl: 'https://www.dealnews.com/',
    articleUrl: 'https://www.dealnews.com/features/travel-savings',
    canonicalUrl: 'https://www.dealnews.com/features/travel-savings',
    slug: 'dealnews-travel-savings',
    title: 'Travel savings guide for summer',
    excerpt: 'A current travel-savings editorial pulled from the new article feed.',
    imageUrl: 'https://images.example/dealnews-travel.png',
    authorName: 'DealNews Editors',
    publishedAt: '2026-06-14T08:00:00Z',
    topic: 'Travel',
    languageCode: 'en-US',
    marketScope: 'Global',
    featured: true,
    active: true,
  },
];

function listResponse<T>(items: T[]): CouponleoListResponse<T> {
  return { items, total: items.length };
}

function paginatedListResponse<T>(
  items: T[],
  page = 1,
  pageSize = items.length || 1,
): CouponleoListResponse<T> {
  const total = items.length;
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    hasNextPage: page * pageSize < total,
    hasPreviousPage: page > 1,
  };
}

function createActivatedRouteStub(
  params: Record<string, string> = {},
  queryParams: Record<string, string> = {},
) {
  const paramMap = convertToParamMap(params);
  const queryParamMap = convertToParamMap(queryParams);

  return {
    snapshot: {
      paramMap,
      queryParamMap,
    },
    paramMap: of(paramMap),
    queryParamMap: of(queryParamMap),
  };
}

function createApiMock(responseDelay = 5): Pick<
  CouponleoApiService,
  'getCategory' | 'getStore' | 'getStoreAnalytics' | 'listAllStores' | 'listBlogArticles' | 'listCategories' | 'listCoupons' | 'listCouponsByCategory' | 'listCouponsByStore' | 'listFeaturedCoupons' | 'listStores' | 'listLocations'
> {
  return {
    getCategory: (identifier: string) => of({
      data: mockCategories.find((category) => category.slug === identifier) ?? mockCategories[0],
    } satisfies CouponleoDataResponse<CouponleoCategory>).pipe(delay(responseDelay)),
    getStore: (identifier: string) => of({
      data: mockStores.find((store) => store.slug === identifier) ?? mockStores[0],
    } satisfies CouponleoDataResponse<CouponleoStore>).pipe(delay(responseDelay)),
    getStoreAnalytics: () => of({
      data: {
        totalCoupons: mockCoupons.length,
        totalStores: mockStores.length,
        featuredCoupons: mockCoupons.filter((coupon) => coupon.featured).length,
        liveMarkets: mockLocations.length,
      },
    }).pipe(delay(responseDelay)),
    listCategories: () => of(listResponse(mockCategories)).pipe(delay(responseDelay)),
    listCoupons: (params = {}) => {
      const query = params.q?.toLowerCase().trim() ?? '';
      const location = params.location?.toLowerCase().trim() ?? '';
      const page = params.page ?? 1;
      const pageSize = params.pageSize ?? mockCoupons.length;
      const items = mockCoupons.filter((coupon) => (
        (!location || [coupon.location, coupon.primary_location].some((value) => value?.toLowerCase() === location))
        && (!query || [coupon.title, coupon.description, coupon.discountText, coupon.storeName, coupon.categoryName].some((value) => value.toLowerCase().includes(query)))
      ));
      return of(paginatedListResponse(items, page, pageSize)).pipe(delay(responseDelay));
    },
    listCouponsByCategory: (categorySlug: string, params = {}) => {
      const query = params.q?.toLowerCase().trim() ?? '';
      const location = params.location?.toLowerCase().trim() ?? '';
      const page = params.page ?? 1;
      const pageSize = params.pageSize ?? mockCoupons.length;
      const items = mockCoupons.filter((coupon) => (
        coupon.categorySlug === categorySlug
        && (!location || [coupon.location, coupon.primary_location].some((value) => value?.toLowerCase() === location))
        && (!query || [coupon.title, coupon.description, coupon.discountText].some((value) => value.toLowerCase().includes(query)))
      ));
      return of(paginatedListResponse(items, page, pageSize)).pipe(delay(responseDelay));
    },
    listCouponsByStore: (storeSlug: string, params = {}) => {
      const query = params.q?.toLowerCase().trim() ?? '';
      const location = params.location?.toLowerCase().trim() ?? '';
      const page = params.page ?? 1;
      const pageSize = params.pageSize ?? mockCoupons.length;
      const items = mockCoupons.filter((coupon) => (
        coupon.storeSlug === storeSlug
        && (!location || [coupon.location, coupon.primary_location].some((value) => value?.toLowerCase() === location))
        && (!query || [coupon.title, coupon.description, coupon.discountText].some((value) => value.toLowerCase().includes(query)))
      ));
      return of(paginatedListResponse(items, page, pageSize)).pipe(delay(responseDelay));
    },
    listFeaturedCoupons: () => of(listResponse(mockCoupons.filter((coupon) => coupon.featured))).pipe(delay(responseDelay)),
    listStores: (params = {}) => {
      const category = params.category?.toLowerCase().trim() ?? '';
      const location = params.location?.toLowerCase().trim() ?? '';
      const page = params.page ?? 1;
      const pageSize = params.pageSize ?? mockStores.length;
      const items = mockStores.filter((store) => (
        (!category || [store.category, store.slug].some((value) => value.toLowerCase() === category))
        && (!location || store.location.toLowerCase() === location)
      ));
      return of(paginatedListResponse(items, page, pageSize)).pipe(delay(responseDelay));
    },
    listAllStores: (params = {}) => {
      const category = params.category?.toLowerCase().trim() ?? '';
      const location = params.location?.toLowerCase().trim() ?? '';
      const items = mockStores.filter((store) => (
        (!category || [store.category, store.slug].some((value) => value.toLowerCase() === category))
        && (!location || store.location.toLowerCase() === location)
      ));
      return of(listResponse(items)).pipe(delay(responseDelay));
    },
    listBlogArticles: (params = {}) => {
      const query = params.q?.toLowerCase().trim() ?? '';
      const source = params.source?.toLowerCase().trim() ?? '';
      const items = mockBlogArticles.filter((article) => (
        (!query || [article.title, article.excerpt, article.sourceName, article.topic].some((value) => value.toLowerCase().includes(query)))
        && (!source || article.sourceName.toLowerCase() === source)
      ));
      return of(listResponse(items)).pipe(delay(responseDelay));
    },
    listLocations: () => of(listResponse(mockLocations)).pipe(delay(responseDelay)),
  };
}

async function createFixture<T>(component: Type<T>, extraProviders: object[] = []): Promise<ComponentFixture<T>> {
  TestBed.resetTestingModule();

  await TestBed.configureTestingModule({
    imports: [component],
    providers: [
      provideRouter([]),
      provideLocationMocks(),
      { provide: CouponleoApiService, useValue: createApiMock() },
      {
        provide: CouponleoSavedService,
        useValue: {
          has: () => false,
          toggle: () => true,
        },
      },
      ...extraProviders,
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  return fixture;
}

async function resolveLoader<T>(fixture: ComponentFixture<T>): Promise<void> {
  expect(fixture.nativeElement.querySelector('app-couponleo-page-loader')).not.toBeNull();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await fixture.whenStable();
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('app-couponleo-page-loader')).toBeNull();
}

function setSearch<T>(fixture: ComponentFixture<T>, value: string): void {
  const input = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement | null;
  expect(input).not.toBeNull();
  input!.value = value;
  input!.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function clickButton<T>(fixture: ComponentFixture<T>, selector: string, label: string): void {
  const button = [...fixture.nativeElement.querySelectorAll(selector)]
    .find((node) => node.textContent?.trim() === label) as HTMLButtonElement | undefined;

  expect(button).toBeDefined();
  button!.click();
  fixture.detectChanges();
}

function queryTexts<T>(fixture: ComponentFixture<T>, selector: string): string[] {
  return [...fixture.nativeElement.querySelectorAll(selector)]
    .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean);
}

function queryHrefs<T>(fixture: ComponentFixture<T>, selector: string): string[] {
  return [...fixture.nativeElement.querySelectorAll(selector)]
    .map((node) => node.getAttribute('href') ?? '')
    .filter(Boolean);
}

describe('CouponLeo public pages', () => {
  it('shows a loader on the home page and applies country filtering from the route', async () => {
    const fixture = await createFixture(Home, [
      { provide: ActivatedRoute, useValue: createActivatedRouteStub({}, { country: 'India' }) },
    ]);

    await resolveLoader(fixture);

    setSearch(fixture, 'Fashion');

    expect(queryTexts(fixture, '.couponleo-deal-card')).toEqual([expect.stringContaining('dooxi.com')]);
    expect(queryTexts(fixture, '.couponleo-orb-card')).toEqual([expect.stringContaining('Fashion')]);
    expect(queryTexts(fixture, '.couponleo-store-pill').join(' ')).toContain('dooxi.com');
    expect(queryTexts(fixture, '.couponleo-store-pill').join(' ')).not.toContain('TechMart');
    expect((fixture.nativeElement.querySelector('.couponleo-orb-card') as HTMLAnchorElement | null)?.getAttribute('href'))
      .toContain('/categories/fashion?country=India');
    expect((fixture.nativeElement.querySelector('.couponleo-store-pill__link') as HTMLAnchorElement | null)?.getAttribute('href'))
      .toContain('/stores/dooxi-com?country=India');
  });

  it('filters top deals from a route-level country context', async () => {
    const fixture = await createFixture(TopDealsPage, [
      { provide: ActivatedRoute, useValue: createActivatedRouteStub({}, { country: 'India' }) },
    ]);

    await resolveLoader(fixture);

    setSearch(fixture, 'Fashion');

    expect(queryTexts(fixture, '.couponleo-deal-card')).toEqual([expect.stringContaining('dooxi.com')]);
    expect((fixture.nativeElement.querySelector('.couponleo-store-rail__link') as HTMLAnchorElement | null)?.getAttribute('href'))
      .toContain('/stores/dooxi-com?country=India');
  });

  it('filters stores from a route-level country context with alphabetical search still working', async () => {
    const fixture = await createFixture(StoresPage, [
      { provide: ActivatedRoute, useValue: createActivatedRouteStub({}, { country: 'India' }) },
    ]);

    await resolveLoader(fixture);

    expect(queryTexts(fixture, '.couponleo-store-showcase-card').join(' ')).toContain('dooxi.com');
    expect(queryTexts(fixture, '.couponleo-store-showcase-card').join(' ')).toContain('Zeal Wear');

    clickButton(fixture, '.couponleo-letter-pill', 'Z');

    expect(queryTexts(fixture, '.couponleo-store-showcase-card')).toEqual([expect.stringContaining('Zeal Wear')]);

    setSearch(fixture, 'Zeal');

    expect(queryTexts(fixture, '.couponleo-store-showcase-card')).toEqual([expect.stringContaining('Zeal Wear')]);
    expect((fixture.nativeElement.querySelector('.couponleo-store-showcase-card a.couponleo-button') as HTMLAnchorElement | null)?.getAttribute('href'))
      .toContain('/stores/zeal-wear?country=India');
  });

  it('filters the category directory from the route-level market context and preserves country links', async () => {
    const fixture = await createFixture(CategoriesPage, [
      { provide: ActivatedRoute, useValue: createActivatedRouteStub({}, { country: 'India' }) },
    ]);

    await resolveLoader(fixture);

    expect(fixture.nativeElement.querySelector('app-couponleo-country-filter')).toBeNull();
    expect(queryTexts(fixture, '.couponleo-categories-browse-card').join(' ')).toContain('Fashion');
    expect(queryTexts(fixture, '.couponleo-categories-browse-card').join(' ')).not.toContain('Travel');
    expect(queryHrefs(fixture, '.couponleo-categories-browse-card a')).toContain('/categories/fashion?country=India');

    setSearch(fixture, 'Travel');

    expect(queryTexts(fixture, '.couponleo-categories-browse-card')).toEqual([]);
  });

  it('renders country-specific browsing on the dedicated country deals page', async () => {
    const fixture = await createFixture(CountryDealsPage, [
      { provide: ActivatedRoute, useValue: createActivatedRouteStub({}, { country: 'India' }) },
    ]);

    await resolveLoader(fixture);

    expect(fixture.nativeElement.querySelector('app-couponleo-country-filter')).toBeNull();
    expect(queryTexts(fixture, '.couponleo-country-market-card').join(' ')).toContain('India');
    expect(queryTexts(fixture, '.couponleo-country-category-card')).toEqual([expect.stringContaining('Fashion')]);
    expect(queryTexts(fixture, '.couponleo-country-store-card').join(' ')).toContain('dooxi.com');
    expect(queryTexts(fixture, '.couponleo-country-store-card').join(' ')).toContain('Zeal Wear');
    expect(queryTexts(fixture, '.couponleo-country-store-card').join(' ')).not.toContain('TechMart');
    expect(queryHrefs(fixture, '.couponleo-country-category-card a')).toContain('/categories/fashion?country=India');
    expect(queryHrefs(fixture, '.couponleo-country-store-card a')).toContain('/stores/dooxi-com?country=India');
  });

  it('renders a category deals page from the category slug route and preserves country links', async () => {
    const fixture = await createFixture(CategoryDealsPage, [
      {
        provide: ActivatedRoute,
        useValue: createActivatedRouteStub({ slug: 'fashion' }, { country: 'India' }),
      },
    ]);

    await resolveLoader(fixture);

    expect(fixture.nativeElement.textContent).toContain('Fashion');
    expect(fixture.nativeElement.textContent).toContain('Deals in Fashion');
    expect(queryTexts(fixture, '.couponleo-category-store-card').join(' ')).toContain('dooxi.com');
    expect(queryTexts(fixture, '.couponleo-deal-card')).toEqual([expect.stringContaining('dooxi.com')]);
    expect((fixture.nativeElement.querySelector('.couponleo-category-store-card a.couponleo-button') as HTMLAnchorElement | null)?.getAttribute('href'))
      .toContain('/stores/dooxi-com?country=India');
  });

  it('renders a store deals page from the store slug route and preserves the current country on back links', async () => {
    const fixture = await createFixture(StoreDealsPage, [
      {
        provide: ActivatedRoute,
        useValue: createActivatedRouteStub({ slug: 'dooxi-com' }, { country: 'India' }),
      },
    ]);

    await resolveLoader(fixture);

    expect(fixture.nativeElement.textContent).toContain('Deals from dooxi.com');
    expect(queryTexts(fixture, '.couponleo-deal-card')).toEqual([expect.stringContaining('10% off')]);
    expect((fixture.nativeElement.querySelector('.couponleo-store-deals-hero__actions a') as HTMLAnchorElement | null)?.getAttribute('href'))
      .toContain('/stores?country=India');
  });

  it('renders live source stories on the blog page from the articles API', async () => {
    const fixture = await createFixture(BlogPage);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Best home tech deals this week');
    expect(fixture.nativeElement.textContent).toContain('Travel savings guide for summer');
    expect(queryHrefs(fixture, '.couponleo-story-card__cta')).toContain('https://slickdeals.net/f/featured-home-tech');
    expect(queryTexts(fixture, '.couponleo-blog-shell__chip')).toContain('Slickdeals');
  });
});
