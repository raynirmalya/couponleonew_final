import type { PageServerLoad } from '@analogjs/router';

import type {
  CouponleoDataResponse,
  CouponleoListResponse,
} from './couponleo-api.service';

type QueryParamValue = string | number | boolean | null | undefined;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function localApiPort(): string {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.['COUPONLEO_API_PORT'] ?? '5000';
}

export function getCouponleoRequestUrl(req: PageServerLoad['req']): URL {
  const host = firstHeaderValue(req.headers['x-forwarded-host'])
    ?? firstHeaderValue(req.headers.host)
    ?? 'couponleo.com';
  const hostname = host.split(':')[0] ?? host;
  const protocol = firstHeaderValue(req.headers['x-forwarded-proto'])
    ?? (LOOPBACK_HOSTS.has(hostname) ? 'http' : 'https');

  return new URL(req.url || '/', `${protocol}://${host}`);
}

export function readCouponleoQueryParam(load: PageServerLoad, key: string): string | null {
  return getCouponleoRequestUrl(load.req).searchParams.get(key);
}

function resolveCouponleoApiBase(load: PageServerLoad): string {
  const requestUrl = getCouponleoRequestUrl(load.req);

  if (LOOPBACK_HOSTS.has(requestUrl.hostname)) {
    const hostname = requestUrl.hostname === 'localhost'
      ? '127.0.0.1'
      : requestUrl.hostname;

    return `http://${hostname}:${localApiPort()}/couponleo/api`;
  }

  return `${requestUrl.origin}/couponleo/api`;
}

function buildQueryString(params: Record<string, QueryParamValue> = {}): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

function buildCouponleoApiUrl(
  load: PageServerLoad,
  path: string,
  params: Record<string, QueryParamValue> = {},
): string {
  return `${resolveCouponleoApiBase(load)}${path}${buildQueryString(params)}`;
}

export async function fetchCouponleoList<T>(
  load: PageServerLoad,
  path: string,
  params: Record<string, QueryParamValue>,
  fallback: CouponleoListResponse<T>,
): Promise<CouponleoListResponse<T>> {
  try {
    return await load.fetch<CouponleoListResponse<T>>(buildCouponleoApiUrl(load, path, params));
  } catch {
    return fallback;
  }
}

export async function fetchCouponleoData<T>(
  load: PageServerLoad,
  path: string,
  fallback: T,
  params: Record<string, QueryParamValue> = {},
): Promise<T> {
  try {
    const response = await load.fetch<CouponleoDataResponse<T>>(buildCouponleoApiUrl(load, path, params));
    return response.data;
  } catch {
    return fallback;
  }
}
