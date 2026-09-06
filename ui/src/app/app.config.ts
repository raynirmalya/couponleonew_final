import { couponleoRequestContextInterceptor } from './services/couponleo-request-context.interceptor';
import { isPlatformServer } from '@angular/common';
import {
  provideHttpClient,
  withInterceptors,
  withFetch,
} from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  PLATFORM_ID,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideFileRouter, withExtraRoutes } from '@analogjs/router';
import { injectRequest } from '@analogjs/router/tokens';
import { type Routes } from '@angular/router';
import { COUPONLEO_API_BASE_URL } from './services/couponleo-api.service';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function couponleoApiPort(): string {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.['COUPONLEO_API_PORT'] ?? '5000';
}

function parseHostname(hostHeader: string): string {
  if (!hostHeader) {
    return '';
  }

  if (hostHeader.startsWith('[')) {
    return hostHeader.slice(1, hostHeader.indexOf(']'));
  }

  return hostHeader.split(':')[0] ?? hostHeader;
}

function couponleoApiBaseUrlFactory(): string {
  const platformId = inject(PLATFORM_ID);

  if (!isPlatformServer(platformId)) {
    return '/couponleo/api';
  }

  const request = injectRequest();

  if (!request) {
    return '/couponleo/api';
  }

  const forwardedProto = request.headers['x-forwarded-proto'];
  const protocol = Array.isArray(forwardedProto)
    ? (forwardedProto[0] ?? 'https')
    : (forwardedProto ?? 'https');
  const hostHeader = request.headers.host ?? '';
  const hostname = parseHostname(hostHeader);

  if (LOOPBACK_HOSTS.has(hostname)) {
    return `http://127.0.0.1:${couponleoApiPort()}/couponleo/api`;
  }

  return `${protocol}://${hostHeader}/couponleo/api`;
}

export const couponleoLegacyRedirectRoutes: Routes = [
  { path: 'blogs', pathMatch: 'full', redirectTo: 'blog' },
  { path: 'login', pathMatch: 'full', redirectTo: 'sign-in' },
  { path: 'saved', pathMatch: 'full', redirectTo: 'wishlist' },
  { path: 'signin', pathMatch: 'full', redirectTo: 'sign-in' },
  { path: 'signup', pathMatch: 'full', redirectTo: 'sign-up' },
  { path: 'terms-conditions', pathMatch: 'full', redirectTo: 'terms-of-use' },
  { path: ':locale/login', pathMatch: 'full', redirectTo: ':locale/sign-in' },
  { path: ':locale/saved', pathMatch: 'full', redirectTo: ':locale/wishlist' },
  { path: ':locale/signin', pathMatch: 'full', redirectTo: ':locale/sign-in' },
  { path: ':locale/signup', pathMatch: 'full', redirectTo: ':locale/sign-up' },
  { path: ':locale/terms-conditions', pathMatch: 'full', redirectTo: ':locale/terms-of-use' },
];

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideFileRouter(
      withExtraRoutes(couponleoLegacyRedirectRoutes),
    ),
    provideHttpClient(
      withFetch(),
      withInterceptors([couponleoRequestContextInterceptor])
    ),
    provideClientHydration(withEventReplay()),
    { provide: COUPONLEO_API_BASE_URL, useFactory: couponleoApiBaseUrlFactory },
  ],
};
