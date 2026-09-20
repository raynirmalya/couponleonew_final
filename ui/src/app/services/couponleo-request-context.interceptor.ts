import { isPlatformServer } from '@angular/common';
import { HttpParams, type HttpInterceptorFn } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { requestContextInterceptor } from '@analogjs/router';

export function couponleoInternalReadUrl(url: string, apiPort: string, uiPort: string): string | null {
  const parsed = new URL(url, 'http://couponleo.internal');
  const api = parsed.pathname.startsWith('/couponleo/api/');
  const page = parsed.pathname.startsWith('/api/_analog/pages/');
  if (!api && !page) return null;
  return `http://127.0.0.1:${api ? apiPort : uiPort}${parsed.pathname}${parsed.search}`;
}

// Analog's internal fetch path omits HttpParams and mishandles URLSearchParams.
// Native server requests preserve the complete market/pagination query.
export const couponleoRequestContextInterceptor: HttpInterceptorFn = (request, next) => {
  if (isPlatformServer(inject(PLATFORM_ID)) && request.method === 'GET') {
    const parsed = new URL(request.urlWithParams, 'https://couponleo.com');
    if (parsed.pathname.startsWith('/couponleo/api/seo/')) {
      // Public SEO snapshots are served by Nginx, outside the busy catalog API.
      return next(request.clone({
        url: `https://couponleo.com${parsed.pathname}${parsed.search}`,
        params: new HttpParams(),
      }));
    }
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    const url = couponleoInternalReadUrl(request.urlWithParams, env['COUPONLEO_API_PORT'] ?? '5000', env['PORT'] ?? '4173');
    if (url) return next(request.clone({ url, params: new HttpParams() }));
  }
  return requestContextInterceptor(request, next);
};
