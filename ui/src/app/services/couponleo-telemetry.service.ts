import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, firstValueFrom, takeUntil } from 'rxjs';
import { CouponleoConsentService } from './couponleo-consent.service';
import {
  COUPONLEO_LOCALE_STORAGE_KEY,
  COUPONLEO_SESSION_STORAGE_KEY,
  COUPONLEO_TELEMETRY_GEO_STORAGE_KEY,
  COUPONLEO_TELEMETRY_QUEUE_STORAGE_KEY,
  COUPONLEO_TELEMETRY_SESSION_STORAGE_KEY,
  COUPONLEO_TELEMETRY_VISITOR_STORAGE_KEY,
} from './couponleo-client-state';
import {
  CouponleoApiService,
  type CouponleoTelemetryEventPayload,
  type CouponleoTelemetryMetadata,
} from './couponleo-api.service';
import { extractCouponleoLocaleFromPathname } from './couponleo-locale-paths';

interface CouponleoStoredSessionSnapshot {
  email?: string;
  fullName?: string;
}

const DEFAULT_LOCALE = 'en';
const MAX_QUEUE_SIZE = 200;
const FLUSH_BATCH_SIZE = 20;
const FLUSH_DELAY_MS = 4000;
const RETRY_DELAY_MS = 15000;
const GEO_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const GEO_REQUEST_TIMEOUT_MS = 3000;

function normalizeText(value: unknown, limit = 255): string {
  return String(value ?? '').trim().slice(0, limit);
}

interface CouponleoDetectedLocation {
  countryCode: string;
  countryName: string;
  regionName: string;
  cityName: string;
  source: string;
  resolvedAt: string;
}

interface CouponleoRouteTelemetryContext {
  countryFilter: string;
  entitySlug: string;
  locale: string;
  localized: boolean;
  pageType: string;
  routeGroup: string;
  segmentCount: number;
}

@Injectable({ providedIn: 'root' })
export class CouponleoTelemetryService {
  private readonly api = inject(CouponleoApiService);
  private readonly consent = inject(CouponleoConsentService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly browser = isPlatformBrowser(this.platformId);

  private started = false;
  private consentGeneration = 0;
  private geoController: AbortController | null = null;
  private sending = false;
  private flushTimer: number | null = null;
  private lastPageViewKey = '';
  private queue: CouponleoTelemetryEventPayload[] = [];
  private detectedLocation: CouponleoDetectedLocation | null = null;
  private detectedLocationPromise: Promise<CouponleoDetectedLocation | null> | null = null;

  start(): void {
    if (!this.browser || this.started) {
      return;
    }

    this.started = true;
    this.registerRouterTracking();
    this.registerDomTracking();
    this.registerLifecycleTracking();
    this.consent.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.applyConsent());
    if (this.consent.ready()) this.applyConsent();
  }

  private applyConsent(): void {
    this.consentGeneration += 1;
    if (this.consent.analyticsAllowed()) {
      this.detectedLocation = this.readStoredDetectedLocation();
      this.restorePersistedQueue();
      void this.ensureDetectedLocation();
      window.setTimeout(() => this.trackPageView('initial_load'), 120);
      this.scheduleFlush(1400);
      return;
    }
    this.geoController?.abort();
    this.detectedLocation = null;
    this.detectedLocationPromise = null;
    this.lastPageViewKey = '';
    this.queue = [];
    if (this.flushTimer !== null) window.clearTimeout(this.flushTimer);
    this.flushTimer = null;
    for (const key of [COUPONLEO_TELEMETRY_GEO_STORAGE_KEY, COUPONLEO_TELEMETRY_QUEUE_STORAGE_KEY,
      COUPONLEO_TELEMETRY_VISITOR_STORAGE_KEY, COUPONLEO_TELEMETRY_SESSION_STORAGE_KEY]) {
      try { window.localStorage.removeItem(key); window.sessionStorage.removeItem(key); } catch {
        // Optional storage may be disabled by the browser.
      }
    }
  }

  trackStructured(event: Omit<CouponleoTelemetryEventPayload, 'sessionId' | 'visitorId'>): void {
    if (!this.browser || !this.consent.analyticsAllowed()) {
      return;
    }

    const location = window.location;
    const searchParams = new URLSearchParams(location.search);
    const session = this.readSessionSnapshot();
    const locationContext = this.resolveLocationContext(event, searchParams);
    const routeContext = this.resolveRouteContext(location.pathname, searchParams);

    const telemetryEvent: CouponleoTelemetryEventPayload = {
      eventId: this.createId(),
      occurredAt: new Date().toISOString(),
      eventType: normalizeText(event.eventType || 'custom', 64),
      eventName: normalizeText(event.eventName || event.eventType || 'custom', 160),
      pagePath: normalizeText(event.pagePath || location.pathname || '/', 512),
      pageQuery: '', // Search strings can contain account details and authentication tokens.
      pageTitle: normalizeText(event.pageTitle || this.document.title, 255),
      referrerUrl: this.analyticsUrl(event.referrerUrl || this.document.referrer),
      targetUrl: this.analyticsUrl(event.targetUrl),
      actionLabel: this.redactText(event.actionLabel, 255),
      elementTag: normalizeText(event.elementTag, 32).toLowerCase(),
      elementRole: normalizeText(event.elementRole, 64).toLowerCase(),
      sessionId: this.readOrCreateStorageValue(COUPONLEO_TELEMETRY_SESSION_STORAGE_KEY, 'sessionStorage'),
      visitorId: this.readOrCreateStorageValue(COUPONLEO_TELEMETRY_VISITOR_STORAGE_KEY, 'localStorage'),
      authState: normalizeText(event.authState || (session.email ? 'authenticated' : 'anonymous'), 32),
      selectedCountry: locationContext.selectedCountry,
      countryCode: locationContext.countryCode,
      countryName: locationContext.countryName,
      regionName: locationContext.regionName,
      cityName: locationContext.cityName,
      selectedLocale: normalizeText(
        event.selectedLocale || routeContext.locale || searchParams.get('lang') || this.readStoredLocale(),
        32,
      ),
      browserLanguage: normalizeText(event.browserLanguage || window.navigator.language, 32),
      timezone: normalizeText(event.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone, 64),
      screenWidth: event.screenWidth ?? window.screen?.width ?? undefined,
      screenHeight: event.screenHeight ?? window.screen?.height ?? undefined,
      viewportWidth: event.viewportWidth ?? window.innerWidth,
      viewportHeight: event.viewportHeight ?? window.innerHeight,
      userAgent: normalizeText(event.userAgent || window.navigator.userAgent, 1024),
      source: normalizeText(event.source || 'couponleo-ui', 32),
      metadata: this.safeMetadata(this.normalizeMetadata(event.metadata, routeContext)) as CouponleoTelemetryMetadata,
    };

    this.queue.push(telemetryEvent);
    if (this.queue.length > MAX_QUEUE_SIZE) {
      this.queue = this.queue.slice(-MAX_QUEUE_SIZE);
    }

    this.persistQueue();
    if (!locationContext.countryName && !locationContext.countryCode) {
      void this.ensureDetectedLocation();
    }

    if (this.queue.length >= FLUSH_BATCH_SIZE) {
      void this.flush();
      return;
    }

    this.scheduleFlush();
  }

  private registerRouterTracking(): void {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        window.setTimeout(() => this.trackPageView('route_navigation'), 80);
      });
  }

  private registerDomTracking(): void {
    this.document.addEventListener('click', (event) => this.handleClick(event), true);
    this.document.addEventListener('change', (event) => this.handleChange(event), true);
    this.document.addEventListener('submit', (event) => this.handleSubmit(event), true);
  }

  private registerLifecycleTracking(): void {
    this.document.addEventListener('visibilitychange', () => {
      if (this.document.visibilityState === 'hidden') {
        void this.flush();
      }
    });

    window.addEventListener('online', () => {
      void this.flush();
    });
  }

  private handleClick(event: Event): void {
    const element = this.findInteractiveElement(event.target);
    if (!element) {
      return;
    }

    const href = element instanceof HTMLAnchorElement ? element.href : element.getAttribute('href');
    this.trackStructured({
      eventType: 'click',
      eventName: normalizeText(element.getAttribute('data-telemetry-event') || 'click', 160),
      actionLabel: this.resolveElementLabel(element),
      elementTag: element.tagName,
      elementRole: normalizeText(element.getAttribute('role') || 'button', 64),
      targetUrl: normalizeText(href, 2048),
      metadata: {
        text: normalizeText(element.textContent, 180),
        className: normalizeText((element as HTMLElement).className, 180),
      },
    });
  }

  private handleChange(event: Event): void {
    const element = this.findFormElement(event.target);
    if (!element || this.shouldIgnoreField(element)) {
      return;
    }

    this.trackStructured({
      eventType: 'change',
      eventName: normalizeText(element.getAttribute('data-telemetry-event') || 'change', 160),
      actionLabel: this.resolveElementLabel(element),
      elementTag: element.tagName,
      elementRole: normalizeText(element.getAttribute('role') || 'field', 64),
      metadata: this.resolveFieldMetadata(element),
    });
  }

  private handleSubmit(event: Event): void {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (!form) {
      return;
    }

    const submitEvent = typeof SubmitEvent !== 'undefined' && event instanceof SubmitEvent ? event : null;
    const submitter = submitEvent?.submitter instanceof HTMLElement ? submitEvent.submitter : null;

    this.trackStructured({
      eventType: 'submit',
      eventName: normalizeText(form.getAttribute('data-telemetry-event') || 'submit', 160),
      actionLabel: normalizeText(
        submitter?.getAttribute('aria-label')
          || submitter?.textContent
          || form.getAttribute('aria-label')
          || form.getAttribute('name')
          || 'form submit',
        255,
      ),
      elementTag: 'form',
      elementRole: 'form',
      targetUrl: normalizeText(form.getAttribute('action') || window.location.href, 2048),
      metadata: {
        formName: normalizeText(form.getAttribute('name'), 120),
        formId: normalizeText(form.id, 120),
      },
    });
  }

  private trackPageView(reason: string): void {
    if (!this.browser || !this.consent.analyticsAllowed()) {
      return;
    }

    const location = window.location;
    const pageKey = `${location.pathname}${location.search}|${this.document.title}`;
    if (pageKey === this.lastPageViewKey) {
      return;
    }

    this.lastPageViewKey = pageKey;
    this.trackStructured({
      eventType: 'page_view',
      eventName: 'page_view',
      actionLabel: reason,
      pagePath: location.pathname || '/',
      pageQuery: location.search.replace(/^\?/, ''),
      pageTitle: this.document.title,
      referrerUrl: this.document.referrer,
      targetUrl: location.href,
      elementTag: 'document',
      elementRole: 'page',
      metadata: {
        routeUrl: this.router.url,
      },
    });
  }

  private async flush(): Promise<void> {
    if (!this.browser || !this.consent.analyticsAllowed() || this.sending || !this.queue.length) {
      return;
    }

    if (this.flushTimer !== null) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const generation = this.consentGeneration;
    if (this.detectedLocationPromise) {
      await this.detectedLocationPromise.catch(() => null);
    }

    if (!this.consent.analyticsAllowed() || generation !== this.consentGeneration || !this.queue.length) return;
    const batch = this.queue.slice(0, FLUSH_BATCH_SIZE);
    this.sending = true;

    try {
      await firstValueFrom(this.api.recordTelemetryEvents(batch).pipe(
        takeUntil(this.consent.changes.pipe(filter((allowed) => !allowed))),
      ));
      if (!this.consent.analyticsAllowed() || generation !== this.consentGeneration) return;
      this.queue = this.queue.slice(batch.length);
      this.persistQueue();
    } catch {
      if (this.consent.analyticsAllowed() && generation === this.consentGeneration) this.scheduleFlush(RETRY_DELAY_MS);
      return;
    } finally {
      this.sending = false;
    }

    if (this.queue.length) {
      this.scheduleFlush(800);
    }
  }

  private scheduleFlush(delay = FLUSH_DELAY_MS): void {
    if (!this.browser || !this.consent.analyticsAllowed() || this.flushTimer !== null) {
      return;
    }

    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, delay);
  }

  private persistQueue(): void {
    if (!this.browser || !this.consent.analyticsAllowed()) {
      return;
    }

    try { window.localStorage.setItem(COUPONLEO_TELEMETRY_QUEUE_STORAGE_KEY, JSON.stringify(this.queue)); } catch {
      // Keep the in-memory queue usable when optional storage is unavailable.
    }
  }

  private restorePersistedQueue(): void {
    if (!this.browser || !this.consent.analyticsAllowed()) {
      return;
    }

    try {
      const rawValue = window.localStorage.getItem(COUPONLEO_TELEMETRY_QUEUE_STORAGE_KEY);
      const parsed = rawValue ? JSON.parse(rawValue) : [];
      if (Array.isArray(parsed)) {
        this.queue = parsed.filter((item): item is CouponleoTelemetryEventPayload => Boolean(item && typeof item === 'object'));
        return;
      }
    } catch {
      // Ignore invalid persisted queue values.
    }

    this.queue = [];
    this.persistQueue();
  }

  private readStoredLocale(): string {
    if (!this.browser || !this.consent.analyticsAllowed()) {
      return DEFAULT_LOCALE;
    }

    try { return normalizeText(window.localStorage.getItem(COUPONLEO_LOCALE_STORAGE_KEY) || DEFAULT_LOCALE, 32) || DEFAULT_LOCALE; } catch { return DEFAULT_LOCALE; }
  }

  private readSessionSnapshot(): CouponleoStoredSessionSnapshot {
    if (!this.browser || !this.consent.analyticsAllowed()) {
      return {};
    }

    try {
      const rawValue = window.localStorage.getItem(COUPONLEO_SESSION_STORAGE_KEY);
      const parsed = rawValue ? JSON.parse(rawValue) : null;
      if (parsed && typeof parsed === 'object') {
        return {
          email: normalizeText((parsed as CouponleoStoredSessionSnapshot).email, 255),
          fullName: normalizeText((parsed as CouponleoStoredSessionSnapshot).fullName, 160),
        };
      }
    } catch {
      // Ignore corrupted session payloads.
    }

    return {};
  }

  private resolveLocationContext(
    event: Omit<CouponleoTelemetryEventPayload, 'sessionId' | 'visitorId'>,
    searchParams: URLSearchParams,
  ): Pick<CouponleoTelemetryEventPayload, 'selectedCountry' | 'countryCode' | 'countryName' | 'regionName' | 'cityName'> {
    const selectedCountry = normalizeText(event.selectedCountry || searchParams.get('country') || 'all', 160) || 'all';
    const detectedLocation = this.detectedLocation ?? this.readStoredDetectedLocation();

    return {
      selectedCountry,
      countryCode: normalizeText(event.countryCode || detectedLocation?.countryCode, 16).toUpperCase(),
      countryName: normalizeText(event.countryName || detectedLocation?.countryName, 160),
      regionName: normalizeText(event.regionName || detectedLocation?.regionName, 160),
      cityName: normalizeText(event.cityName || detectedLocation?.cityName, 160),
    };
  }

  private readStoredDetectedLocation(): CouponleoDetectedLocation | null {
    if (!this.browser || !this.consent.analyticsAllowed()) {
      return null;
    }

    try {
      const rawValue = window.localStorage.getItem(COUPONLEO_TELEMETRY_GEO_STORAGE_KEY);
      const parsed = rawValue ? JSON.parse(rawValue) : null;
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      const resolvedAt = normalizeText((parsed as CouponleoDetectedLocation).resolvedAt, 64);
      const resolvedAtMs = resolvedAt ? Date.parse(resolvedAt) : Number.NaN;
      if (!Number.isFinite(resolvedAtMs) || Date.now() - resolvedAtMs > GEO_CACHE_TTL_MS) {
        window.localStorage.removeItem(COUPONLEO_TELEMETRY_GEO_STORAGE_KEY);
        return null;
      }

      const location: CouponleoDetectedLocation = {
        countryCode: normalizeText((parsed as CouponleoDetectedLocation).countryCode, 16).toUpperCase(),
        countryName: normalizeText((parsed as CouponleoDetectedLocation).countryName, 160),
        regionName: normalizeText((parsed as CouponleoDetectedLocation).regionName, 160),
        cityName: normalizeText((parsed as CouponleoDetectedLocation).cityName, 160),
        source: normalizeText((parsed as CouponleoDetectedLocation).source, 32),
        resolvedAt,
      };

      if (!location.countryCode && !location.countryName && !location.regionName && !location.cityName) {
        return null;
      }

      return location;
    } catch {
      return null;
    }
  }

  private async ensureDetectedLocation(forceRefresh = false): Promise<CouponleoDetectedLocation | null> {
    if (!this.browser || !this.consent.analyticsAllowed()) {
      return null;
    }

    if (!forceRefresh && this.detectedLocation) {
      return this.detectedLocation;
    }

    if (this.detectedLocationPromise) {
      return this.detectedLocationPromise;
    }

    const generation = this.consentGeneration;
    this.detectedLocationPromise = this.lookupDetectedLocation()
      .then((location) => {
        if (!this.consent.analyticsAllowed() || generation !== this.consentGeneration) return null;
        if (location) {
          const previousLocation = this.detectedLocation;
          this.detectedLocation = location;
          try { window.localStorage.setItem(COUPONLEO_TELEMETRY_GEO_STORAGE_KEY, JSON.stringify(location)); } catch { /* Optional cache. */ }
          this.backfillQueuedLocation(location, previousLocation);
        }

        return location;
      })
      .catch(() => null)
      .finally(() => {
        if (generation === this.consentGeneration) this.detectedLocationPromise = null;
      });

    return this.detectedLocationPromise;
  }

  private async lookupDetectedLocation(): Promise<CouponleoDetectedLocation | null> {
    const providers = [
      async () => this.lookupIpApiLocation(),
      async () => this.lookupIpWhoisLocation(),
    ];

    const generation = this.consentGeneration;
    for (const provider of providers) {
      if (!this.consent.analyticsAllowed() || generation !== this.consentGeneration) return null;
      try {
        const location = await provider();
        if (location) {
          return location;
        }
      } catch {
        // Fall through to the next provider.
      }
    }

    return null;
  }

  private async lookupIpApiLocation(): Promise<CouponleoDetectedLocation | null> {
    const payload = await this.fetchGeoJson('https://ipapi.co/json/');
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const locationPayload = payload as Record<string, unknown>;
    const countryName = normalizeText(locationPayload['country_name'], 160);
    const countryCode = normalizeText(locationPayload['country_code'], 16).toUpperCase();
    const regionName = normalizeText(locationPayload['region'], 160);
    const cityName = normalizeText(locationPayload['city'], 160);

    if (!countryName && !countryCode && !regionName && !cityName) {
      return null;
    }

    return {
      countryCode,
      countryName,
      regionName,
      cityName,
      source: 'browser_geo',
      resolvedAt: new Date().toISOString(),
    };
  }

  private async lookupIpWhoisLocation(): Promise<CouponleoDetectedLocation | null> {
    const payload = await this.fetchGeoJson('https://ipwho.is/');
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const locationPayload = payload as Record<string, unknown>;
    const success = locationPayload['success'];
    if (success === false) {
      return null;
    }

    const countryName = normalizeText(locationPayload['country'], 160);
    const countryCode = normalizeText(locationPayload['country_code'], 16).toUpperCase();
    const regionName = normalizeText(locationPayload['region'], 160);
    const cityName = normalizeText(locationPayload['city'], 160);

    if (!countryName && !countryCode && !regionName && !cityName) {
      return null;
    }

    return {
      countryCode,
      countryName,
      regionName,
      cityName,
      source: 'browser_geo',
      resolvedAt: new Date().toISOString(),
    };
  }

  private async fetchGeoJson(url: string): Promise<unknown> {
    if (!this.consent.analyticsAllowed()) return null;
    const controller = new AbortController();
    this.geoController = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), GEO_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          accept: 'application/json',
        },
        mode: 'cors',
        signal: controller.signal,
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeoutId);
      if (this.geoController === controller) this.geoController = null;
    }
  }

  private backfillQueuedLocation(
    location: CouponleoDetectedLocation,
    previousLocation: CouponleoDetectedLocation | null = null,
  ): void {
    let changed = false;

    this.queue = this.queue.map((event) => {
      const hasTrackedLocation = Boolean(event.countryName || event.countryCode || event.regionName || event.cityName);
      const matchesPreviousLocation = previousLocation
        ? normalizeText(event.countryCode, 16).toUpperCase() === normalizeText(previousLocation.countryCode, 16).toUpperCase()
          && normalizeText(event.countryName, 160).toLowerCase() === normalizeText(previousLocation.countryName, 160).toLowerCase()
        : false;

      if (hasTrackedLocation && !matchesPreviousLocation) {
        return event;
      }

      changed = true;
      return {
        ...event,
        countryCode: normalizeText(location.countryCode, 16).toUpperCase(),
        countryName: normalizeText(location.countryName, 160),
        regionName: normalizeText(location.regionName, 160),
        cityName: normalizeText(location.cityName, 160),
      };
    });

    if (changed) {
      this.persistQueue();
    }
  }

  private readOrCreateStorageValue(
    storageKey: string,
    storageType: 'localStorage' | 'sessionStorage',
  ): string {
    try {
    const storage = storageType === 'localStorage' ? window.localStorage : window.sessionStorage;
    const existingValue = normalizeText(storage.getItem(storageKey), 64);
    if (existingValue) {
      return existingValue;
    }

    const nextValue = this.createId();
    storage.setItem(storageKey, nextValue);
    return nextValue;
    } catch { return this.createId(); }
  }

  private createId(): string {
    if (typeof window !== 'undefined' && typeof window.crypto?.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }

    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private findInteractiveElement(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) {
      return null;
    }

    const matchedElement = target.closest('a, button, [role="button"], summary');
    return matchedElement instanceof HTMLElement ? matchedElement : null;
  }

  private findFormElement(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) {
      return null;
    }

    const matchedElement = target.closest('select, input, textarea');
    return matchedElement instanceof HTMLElement ? matchedElement : null;
  }

  private resolveElementLabel(element: HTMLElement): string {
    if (element instanceof HTMLInputElement) {
      const inputType = normalizeText(element.type || 'text', 32).toLowerCase();
      const fallbackLabel = normalizeText(
        element.getAttribute('data-telemetry-label')
          || element.getAttribute('aria-label')
          || element.getAttribute('placeholder')
          || element.getAttribute('title')
          || element.getAttribute('name')
          || element.id
          || inputType
          || 'input',
        255,
      );

      if (['button', 'submit', 'reset'].includes(inputType)) {
        return normalizeText(element.value || fallbackLabel, 255);
      }

      return fallbackLabel;
    }

    if (element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
      return normalizeText(
        element.getAttribute('data-telemetry-label')
          || element.getAttribute('aria-label')
          || element.getAttribute('title')
          || element.getAttribute('name')
          || element.id
          || element.tagName.toLowerCase(),
        255,
      );
    }

    return normalizeText(
      element.getAttribute('data-telemetry-label')
        || element.getAttribute('aria-label')
        || element.getAttribute('title')
        || element.textContent
        || element.getAttribute('name')
        || element.tagName.toLowerCase(),
      255,
    );
  }

  private resolveFieldMetadata(element: HTMLElement): CouponleoTelemetryMetadata {
    if (element instanceof HTMLSelectElement) {
      const selectedOption = element.selectedOptions?.[0];
      return {
        fieldName: normalizeText(element.name || element.id, 120),
        inputType: 'select',
        selectedValue: normalizeText(element.value, 120),
        selectedLabel: normalizeText(selectedOption?.label, 160),
      };
    }

    if (element instanceof HTMLInputElement) {
      return {
        fieldName: normalizeText(element.name || element.id, 120),
        inputType: normalizeText(element.type || 'text', 32),
        checked: ['checkbox', 'radio'].includes(element.type) ? element.checked : undefined,
      };
    }

    return {
      fieldName: normalizeText((element as HTMLTextAreaElement).name || element.id, 120),
      inputType: 'textarea',
    };
  }

  private shouldIgnoreField(element: HTMLElement): boolean {
    if (!(element instanceof HTMLInputElement)) {
      return false;
    }

    const inputType = normalizeText(element.type || 'text', 32).toLowerCase();
    if (['hidden', 'password', 'file'].includes(inputType)) {
      return true;
    }

    const fieldName = normalizeText(
      element.name || element.id || element.getAttribute('autocomplete') || '',
      120,
    ).toLowerCase();

    return ['password', 'passcode', 'secret', 'token', 'otp'].some((marker) => fieldName.includes(marker));
  }

  private resolveRouteContext(pathname: string, searchParams: URLSearchParams): CouponleoRouteTelemetryContext {
    const localizedPathLocale = extractCouponleoLocaleFromPathname(pathname);
    const normalizedPath = this.stripLocalePrefix(pathname, localizedPathLocale);
    const segments = normalizedPath.split('/').filter(Boolean);
    const topLevelSegment = normalizeText(segments[0] || 'home', 120).toLowerCase();
    const entitySlug = normalizeText(segments[1], 160);

    let pageType = 'unknown';
    let routeGroup = topLevelSegment || 'home';

    if (segments.length === 0) {
      pageType = 'home';
      routeGroup = 'home';
    } else if (topLevelSegment === 'stores') {
      pageType = entitySlug ? 'store_detail' : 'stores_index';
      routeGroup = 'stores';
    } else if (topLevelSegment === 'categories') {
      pageType = entitySlug ? 'category_detail' : 'categories_index';
      routeGroup = 'categories';
    } else if (topLevelSegment === 'country-deals') {
      pageType = 'country_deals';
      routeGroup = 'country-deals';
    } else if (topLevelSegment === 'top-deals') {
      pageType = 'top_deals';
      routeGroup = 'top-deals';
    } else if (topLevelSegment === 'blog') {
      pageType = 'blog';
      routeGroup = 'blog';
    } else if (topLevelSegment === 'wishlist') {
      pageType = 'wishlist';
      routeGroup = 'wishlist';
    } else if (topLevelSegment === 'dashboard') {
      pageType = 'dashboard';
      routeGroup = 'dashboard';
    } else if (topLevelSegment === 'sign-in') {
      pageType = 'sign_in';
      routeGroup = 'auth';
    } else if (topLevelSegment === 'sign-up') {
      pageType = 'sign_up';
      routeGroup = 'auth';
    } else if (topLevelSegment === 'about') {
      pageType = 'about';
      routeGroup = 'about';
    } else if (topLevelSegment === 'contact') {
      pageType = 'contact';
      routeGroup = 'contact';
    } else if (topLevelSegment === 'help-center') {
      pageType = 'help_center';
      routeGroup = 'help-center';
    } else if (topLevelSegment === 'terms-of-use') {
      pageType = 'terms_of_use';
      routeGroup = 'terms-of-use';
    } else if (topLevelSegment === 'privacy-policy') {
      pageType = 'privacy_policy';
      routeGroup = 'privacy-policy';
    } else {
      pageType = topLevelSegment || 'unknown';
    }

    return {
      countryFilter: normalizeText(searchParams.get('country') || 'all', 160) || 'all',
      entitySlug,
      locale: normalizeText(localizedPathLocale || DEFAULT_LOCALE, 32) || DEFAULT_LOCALE,
      localized: Boolean(localizedPathLocale),
      pageType,
      routeGroup,
      segmentCount: segments.length,
    };
  }

  private stripLocalePrefix(pathname: string, locale: string | null): string {
    if (!locale) {
      return pathname || '/';
    }

    const prefix = `/${locale}`;
    if (pathname === prefix) {
      return '/';
    }

    return pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) || '/' : pathname || '/';
  }

  private redactText(value: unknown, limit = 255): string {
    return normalizeText(value, limit).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]');
  }

  private analyticsUrl(value: unknown): string {
    if (!value) return '';
    try {
      const url = new URL(String(value), window.location.origin);
      return /^https?:$/.test(url.protocol) ? this.redactText(`${url.origin}${url.pathname}`, 2048) : '';
    } catch { return ''; }
  }

  private safeMetadata(value: unknown, key = '', depth = 0): unknown {
    if (depth > 6 || /email|password|token|secret|fullName|userName/i.test(key)) return undefined;
    if (typeof value === 'string') {
      if (/url|path/i.test(key) || /^https?:\/\//i.test(value)) return this.analyticsUrl(value);
      return this.redactText(value, 1000);
    }
    if (Array.isArray(value)) return value.map((entry) => this.safeMetadata(entry, key, depth + 1));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, this.safeMetadata(entry, name, depth + 1)]));
    }
    return value;
  }

  private normalizeMetadata(
    metadata: CouponleoTelemetryMetadata | undefined,
    routeContext: CouponleoRouteTelemetryContext,
  ): CouponleoTelemetryMetadata {
    const baseMetadata = {
      countryFilter: routeContext.countryFilter,
      entitySlug: routeContext.entitySlug || undefined,
      localeInPath: routeContext.locale,
      localizedPath: routeContext.localized,
      pageType: routeContext.pageType,
      routeGroup: routeContext.routeGroup,
      segmentCount: routeContext.segmentCount,
    };

    if (metadata === undefined || metadata === null || metadata === '') {
      return baseMetadata;
    }

    if (Array.isArray(metadata)) {
      return {
        ...baseMetadata,
        values: metadata,
      };
    }

    if (typeof metadata === 'object') {
      return {
        ...(metadata as Record<string, unknown>),
        ...baseMetadata,
      };
    }

    return {
      ...baseMetadata,
      value: metadata,
    };
  }
}
