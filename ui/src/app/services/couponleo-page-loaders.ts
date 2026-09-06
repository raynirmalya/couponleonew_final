import type { PageServerLoad } from '@analogjs/router';
import type { CouponleoCategory, CouponleoCoupon, CouponleoListResponse, CouponleoLocation, CouponleoStore, CouponleoStoreAnalytics } from './couponleo-api.service';
import { fetchCouponleoData, fetchCouponleoList, readCouponleoQueryParam } from './couponleo-server-load.helpers';
import { normalizeCountryRouteValue, locationFilterForCountry } from './couponleo-country.helpers';
const storeDealsPageSize = 12;
const categoryDealsPageSize = 12;
const homeCategoryFetchLimit = 120;
const homeFeaturedCouponFetchLimit = 48;
const homeFeaturedStoreFetchLimit = 48;
const homeLocationFetchLimit = 120;
function emptyListResponse<T>(): CouponleoListResponse<T> { return { items: [], total: 0 }; }
function emptyCouponListResponse<T>(): CouponleoListResponse<T> { return { items: [], total: 0, page: 1, pageCount: 1, pageSize: 12, hasNextPage: false, hasPreviousPage: false }; }
function emptyAnalyticsSummary(): CouponleoStoreAnalytics { return { totalCoupons: 0, totalStores: 0, featuredCoupons: 0, liveMarkets: 0 }; }

export async function loadHome(pageServerLoad: PageServerLoad) {
  const country = normalizeCountryRouteValue(readCouponleoQueryParam(pageServerLoad, 'country'));
  const location = locationFilterForCountry(country);

  return {
    analytics: await fetchCouponleoData<CouponleoStoreAnalytics>(
      pageServerLoad,
      '/stores/analytics/summary',
      emptyAnalyticsSummary(),
    ),
    categories: await fetchCouponleoList(
      pageServerLoad,
      '/categories',
      { location, pageSize: homeCategoryFetchLimit },
      emptyListResponse<CouponleoCategory>(),
    ),
    featuredCoupons: await fetchCouponleoList(
      pageServerLoad,
      '/coupons/featured',
      { active: true, pageSize: homeFeaturedCouponFetchLimit },
      emptyListResponse<CouponleoCoupon>(),
    ),
    locations: await fetchCouponleoList(
      pageServerLoad,
      '/locations',
      { pageSize: homeLocationFetchLimit },
      emptyListResponse<CouponleoLocation>(),
    ),
    stores: await fetchCouponleoList(
      pageServerLoad,
      '/stores',
      { featured: true, location, pageSize: homeFeaturedStoreFetchLimit },
      emptyListResponse<CouponleoStore>(),
    ),
  };
}

export async function loadStore(pageServerLoad: PageServerLoad) {
  const slug = pageServerLoad.params?.['slug'] ?? '';
  const country = normalizeCountryRouteValue(readCouponleoQueryParam(pageServerLoad, 'country'));

  const store = slug
    ? await fetchCouponleoData<CouponleoStore | null>(
      pageServerLoad,
      `/stores/${encodeURIComponent(slug)}`,
      null,
    )
    : null;


  return {
    coupons: store ? await fetchCouponleoList<CouponleoCoupon>(
      pageServerLoad, `/coupons/store/${encodeURIComponent(slug)}`,
      { active: true, location: locationFilterForCountry(country), page: 1, pageSize: storeDealsPageSize },
      emptyCouponListResponse<CouponleoCoupon>(),
    ) : emptyCouponListResponse<CouponleoCoupon>(),
    store,
  };
}

export async function loadCategory(pageServerLoad: PageServerLoad) {
  const slug = pageServerLoad.params?.['slug'] ?? '';
  const country = normalizeCountryRouteValue(readCouponleoQueryParam(pageServerLoad, 'country'));
  const location = country === 'all' ? undefined : country;

  const category = slug
    ? await fetchCouponleoData<CouponleoCategory | null>(
      pageServerLoad,
      `/categories/${encodeURIComponent(slug)}`,
      null,
    )
    : null;


  return {
    category,
    coupons: category ? await fetchCouponleoList<CouponleoCoupon>(
      pageServerLoad, '/coupons',
      { category: slug, location, active: true, page: 1, pageSize: categoryDealsPageSize },
      emptyCouponListResponse<CouponleoCoupon>(),
    ) : emptyCouponListResponse<CouponleoCoupon>(),
    locations: await fetchCouponleoList(
      pageServerLoad,
      '/locations',
      { pageSize: 250 },
      emptyListResponse<CouponleoLocation>(),
    ),
    stores: slug
      ? await fetchCouponleoList(
        pageServerLoad,
        '/stores',
        { category: slug, location, pageSize: 6 },
        emptyListResponse<CouponleoStore>(),
      )
      : emptyListResponse<CouponleoStore>(),
  };
}
