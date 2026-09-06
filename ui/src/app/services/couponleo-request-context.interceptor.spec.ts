import { describe, expect, it } from 'vitest';
import { couponleoInternalReadUrl } from './couponleo-request-context.interceptor';

describe('Server request query preservation', () => {
  it('preserves pagination, country and encoded search in API requests', () => {
    expect(couponleoInternalReadUrl('https://couponleo.com/couponleo/api/coupons?page=2&pageSize=12&location=United%20Kingdom&q=10%25', '9600', '4173'))
      .toBe('http://127.0.0.1:9600/couponleo/api/coupons?page=2&pageSize=12&location=United%20Kingdom&q=10%25');
  });
  it('preserves the market on server route data requests', () => {
    expect(couponleoInternalReadUrl('https://couponleo.com/api/_analog/pages/stores/lenovo-com?country=India', '9601', '4174'))
      .toBe('http://127.0.0.1:4174/api/_analog/pages/stores/lenovo-com?country=India');
  });
  it('leaves unrelated request paths with the existing interceptor', () => {
    expect(couponleoInternalReadUrl('https://example.com/auth', '9600', '4173')).toBeNull();
  });
});
