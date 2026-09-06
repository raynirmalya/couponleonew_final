import { describe, expect, it } from 'vitest';
import { isCouponLive, formatExpiryLabel } from './couponleo-ui.helpers';

describe('Consistent coupon expiry dates', () => {
  it('keeps date-only expiry live through its UTC day even after midnight in India', () => {
    const now = new Date('2026-09-07T03:00:00+05:30');
    expect(isCouponLive('2026-09-06', now)).toBe(true);
    expect(formatExpiryLabel('2026-09-06', now)).toBe('Expires Sep 6');
  });
  it('expires the offer when the API day changes', () => {
    expect(isCouponLive('2026-09-06', new Date('2026-09-07T00:00:00Z'))).toBe(false);
  });
  it('does not invent an expiry date for unknown feed values', () => {
    expect(isCouponLive('', new Date())).toBe(true);
    expect(formatExpiryLabel('', new Date())).toContain('Expiry not provided');
  });
});
