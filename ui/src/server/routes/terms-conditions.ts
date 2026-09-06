import { defineEventHandler, getRequestURL, sendRedirect } from 'h3';

import { buildCouponleoRedirectLocation } from '../couponleo-legacy-redirect';

export default defineEventHandler((event) => {
  const requestUrl = getRequestURL(event);
  return sendRedirect(
    event,
    buildCouponleoRedirectLocation('/terms-of-use', requestUrl.search),
    301,
  );
});
