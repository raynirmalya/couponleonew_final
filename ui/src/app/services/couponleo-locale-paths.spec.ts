import {
  extractCouponleoLocaleFromPathname,
  isCouponleoLocalizedPublicPath,
  localizeCouponleoPathname,
  stripCouponleoLocaleFromPathname,
} from './couponleo-locale-paths';

describe('couponleo locale paths', () => {
  it('extracts locale segments from path-based localized routes', () => {
    expect(extractCouponleoLocaleFromPathname('/it/categories')).toBe('it-IT');
    expect(extractCouponleoLocaleFromPathname('/de/stores/lenovo-com')).toBe('de-DE');
    expect(extractCouponleoLocaleFromPathname('/')).toBeNull();
  });

  it('strips locale prefixes and rebuilds localized paths', () => {
    expect(stripCouponleoLocaleFromPathname('/pt/top-deals')).toEqual({
      locale: 'pt-BR',
      pathname: '/top-deals',
    });
    expect(localizeCouponleoPathname('/categories/womens-clothing', 'ja-JP')).toBe('/ja/categories/womens-clothing');
    expect(localizeCouponleoPathname('/ja/categories/womens-clothing', 'en-US')).toBe('/categories/womens-clothing');
  });

  it('only marks SEO-facing public routes as localized path candidates', () => {
    expect(isCouponleoLocalizedPublicPath('/categories')).toBe(true);
    expect(isCouponleoLocalizedPublicPath('/stores/lenovo-com')).toBe(true);
    expect(isCouponleoLocalizedPublicPath('/wishlist')).toBe(false);
    expect(isCouponleoLocalizedPublicPath('/sign-in')).toBe(false);
  });
});
