import { createError, defineEventHandler, getQuery, setHeader } from 'h3';

import { isAllowedCouponleoLogoHost } from '../../../app/services/couponleo-logo.helpers';

function parseLogoUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }

    if (!isAllowedCouponleoLogoHost(parsed.hostname)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const logoUrl = parseLogoUrl(query['url']);

  if (!logoUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid logo url.',
    });
  }

  const upstream = await fetch(logoUrl, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'user-agent': 'CouponLeoLogoProxy/1.0',
    },
    redirect: 'follow',
  });

  if (!upstream.ok) {
    throw createError({
      statusCode: upstream.status,
      statusMessage: 'Logo unavailable.',
    });
  }

  const contentType = upstream.headers.get('content-type') || 'image/png';
  const cacheControl = upstream.headers.get('cache-control') || 'public, max-age=3600, stale-while-revalidate=86400';
  const contentLength = upstream.headers.get('content-length');

  setHeader(event, 'Content-Type', contentType);
  setHeader(event, 'Cache-Control', cacheControl);
  if (contentLength) {
    setHeader(event, 'Content-Length', Number(contentLength));
  }

  return new Uint8Array(await upstream.arrayBuffer());
});
