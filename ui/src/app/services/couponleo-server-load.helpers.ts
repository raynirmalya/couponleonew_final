import type { PageServerLoad } from '@analogjs/router';

import type {
  CouponleoDataResponse,
  CouponleoListResponse,
} from './couponleo-api.service';

type QueryParamValue = string | number | boolean | null | undefined;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const SERVER_FETCH_TIMEOUT_MS = 8000;

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function localApiPort(): string {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.['COUPONLEO_API_PORT'] ?? '5000';
}

function internalCouponleoApiBase(): string | null {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {};
  const port = env['COUPONLEO_API_PORT']?.trim();

  if (!port) {
    return null;
  }

  const protocol = env['COUPONLEO_API_PROTOCOL']?.trim() || 'http';
  const host = env['COUPONLEO_API_HOST']?.trim() || '127.0.0.1';

  return `${protocol}://${host}:${port}/couponleo/api`;
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
  const internalApiBase = internalCouponleoApiBase();
  if (internalApiBase) {
    return internalApiBase;
  }

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

async function fetchCouponleoServerPayload<T>(load: PageServerLoad, url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SERVER_FETCH_TIMEOUT_MS);

  try {
    return await load.fetch<T>(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchCouponleoList<T>(
  load: PageServerLoad,
  path: string,
  params: Record<string, QueryParamValue>,
  fallback: CouponleoListResponse<T>,
): Promise<CouponleoListResponse<T>> {
  try {
    return await fetchCouponleoServerPayload<CouponleoListResponse<T>>(
      load,
      buildCouponleoApiUrl(load, path, params),
    );
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
    const response = await fetchCouponleoServerPayload<CouponleoDataResponse<T>>(
      load,
      buildCouponleoApiUrl(load, path, params),
    );
    return response.data;
  } catch {
    return fallback;
  }
}
