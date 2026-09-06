import { createError, defineEventHandler, getRequestURL, sendRedirect } from 'h3';

const aliases: Record<string, string> = {
  '/home': '/', '/index-2': '/', '/about-us': '/about',
  '/stores-details': '/stores', '/stores-details-2': '/stores', '/coupon-style': '/top-deals',
};
const publicSegments = new Set('stores categories country-deals top-deals blog blogs about contact help-center privacy-policy terms-of-use sign-in sign-up signin signup login saved wishlist alerts analytics dashboard settings my-coupons forgot-password extension-bridge help faq faqs collection collections terms-conditions de fr es it pt nl hi ja ar'.split(' '));

export default defineEventHandler(event => {
  const url = getRequestURL(event);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const locale = path.match(/^\/(de|fr|es|it|pt|nl|hi|ja|ar)(?=\/)/)?.[0] ?? '';
  const base = locale ? path.slice(locale.length) : path;
  if (aliases[base]) return sendRedirect(event, `${locale}${aliases[base] === '/' && locale ? '' : aliases[base]}${url.search}`, 301);
  // An unknown single segment would otherwise match the generic [locale] homepage.
  if (/^\/[^/.]+$/.test(path) && !publicSegments.has(path.slice(1))) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' });
  }
});
