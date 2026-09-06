import { createError, defineEventHandler, getRequestURL, getRouterParam, sendRedirect } from 'h3';

import {
  buildCouponleoRedirectLocation,
  resolveCouponleoLegacyTermsLocation,
} from '../../couponleo-legacy-redirect';

export default defineEventHandler((event) => {
  const locale = getRouterParam(event, 'locale');
  const pathname = resolveCouponleoLegacyTermsLocation(locale);

  if (!pathname) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
    });
  }

  const requestUrl = getRequestURL(event);
  return sendRedirect(
    event,
    buildCouponleoRedirectLocation(pathname, requestUrl.search),
    301,
  );
});
