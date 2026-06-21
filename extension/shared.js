(function () {
  const extensionApi = globalThis.browser ?? globalThis.chrome;
  const API_BASE = 'https://couponleo.com/couponleo/api';
  const SITE_BASE = 'https://couponleo.com';
  const LOCAL_API_CANDIDATES = [
    'http://127.0.0.1:5000/couponleo/api'
  ];
  const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:']);
  const REQUEST_TIMEOUT_MS = 20000;
  const LOCAL_BASE_DISCOVERY_TIMEOUT_MS = 800;
  const API_BASE_CACHE_TTL_MS = 30000;
  const LOOKUP_CACHE_TTL_MS = 2 * 60 * 1000;
  const TOP_STORES_CACHE_TTL_MS = 5 * 60 * 1000;
  const NON_MERCHANT_HOSTS = new Set([
    'mail.google.com'
  ]);
  const MESSAGE_NAMESPACE = 'couponleo-extension';
  const AUTH_SESSION_STORAGE_KEY = 'couponleoAuthSession';
  const USER_STATE_STORAGE_KEY = 'couponleoUserState';
  const EXTENSION_BRIDGE_PATH = '/extension-bridge';
  const responseCache = new Map();
  const apiBaseAvailabilityCache = new Map();
  const inflightRequests = new Map();
  const MESSAGE_TYPES = {
    lookupByTabUrl: 'lookupByTabUrl',
    getTopStores: 'getTopStores',
    openUrl: 'openUrl'
  };

  function getLastRuntimeError() {
    const lastError = extensionApi?.runtime?.lastError;
    return lastError ? new Error(lastError.message || 'CouponLeo browser API request failed.') : null;
  }

  function invokeBrowserMethod(target, methodName, args = []) {
    const method = target?.[methodName];

    if (typeof method !== 'function') {
      return Promise.reject(new Error(`CouponLeo browser API is missing ${methodName}.`));
    }

    if (globalThis.browser) {
      try {
        return Promise.resolve(method.apply(target, args));
      } catch (error) {
        return Promise.reject(error);
      }
    }

    return new Promise((resolve, reject) => {
      try {
        method.call(target, ...args, (result) => {
          const runtimeError = getLastRuntimeError();

          if (runtimeError) {
            reject(runtimeError);
            return;
          }

          resolve(result);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function queryTabs(queryInfo) {
    return invokeBrowserMethod(extensionApi?.tabs, 'query', [queryInfo]);
  }

  async function getTab(tabId) {
    return invokeBrowserMethod(extensionApi?.tabs, 'get', [tabId]);
  }

  async function createTab(createProperties) {
    return invokeBrowserMethod(extensionApi?.tabs, 'create', [createProperties]);
  }

  async function removeTab(tabId) {
    return invokeBrowserMethod(extensionApi?.tabs, 'remove', [tabId]);
  }

  async function storageGet(areaName, keys) {
    return invokeBrowserMethod(extensionApi?.storage?.[areaName], 'get', [keys]);
  }

  async function storageSet(areaName, items) {
    return invokeBrowserMethod(extensionApi?.storage?.[areaName], 'set', [items]);
  }

  async function storageRemove(areaName, keys) {
    return invokeBrowserMethod(extensionApi?.storage?.[areaName], 'remove', [keys]);
  }

  async function setActionBadgeText(details) {
    return invokeBrowserMethod(extensionApi?.action, 'setBadgeText', [details]);
  }

  async function setActionBadgeBackgroundColor(details) {
    return invokeBrowserMethod(extensionApi?.action, 'setBadgeBackgroundColor', [details]);
  }

  async function setActionTitle(details) {
    return invokeBrowserMethod(extensionApi?.action, 'setTitle', [details]);
  }

  function normalizeUrl(value) {
    if (!value) {
      return null;
    }

    try {
      const parsed = new URL(value);
      return SUPPORTED_PROTOCOLS.has(parsed.protocol) ? parsed : null;
    } catch {
      return null;
    }
  }

  function normalizeHost(value) {
    const parsed = normalizeUrl(value);
    const rawHost = (parsed ? parsed.hostname : String(value || '')).trim().toLowerCase();

    if (!rawHost) {
      return '';
    }

    if (rawHost.startsWith('[') && rawHost.includes(']')) {
      return rawHost.slice(1, rawHost.indexOf(']'));
    }

    let host = rawHost.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];

    while (true) {
      const nextHost = host.replace(/^(www|m|mobile|shop|store)\./, '');

      if (nextHost === host) {
        break;
      }

      host = nextHost;
    }

    return host;
  }

  function isLoopbackHost(value) {
    const host = normalizeHost(value);
    return host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0' || host === '::1';
  }

  function trimTrailingSlashes(value) {
    return String(value || '').replace(/\/+$/, '');
  }

  function readFreshCacheValue(cacheMap, key) {
    const entry = cacheMap.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      cacheMap.delete(key);
      return null;
    }

    return entry.value;
  }

  function writeCachedValue(cacheMap, key, value, ttlMs) {
    cacheMap.set(key, {
      value,
      expiresAt: Date.now() + Math.max(1, ttlMs || 1)
    });

    return value;
  }

  function buildLookupCacheKey(baseUrl, targetHost, couponLimit) {
    return [
      'lookup',
      trimTrailingSlashes(baseUrl),
      normalizeHost(targetHost),
      Number.isFinite(Number(couponLimit)) ? Math.trunc(Number(couponLimit)) : 'default'
    ].join('::');
  }

  function buildTopStoresCacheKey(baseUrl, limit) {
    return [
      'top-stores',
      trimTrailingSlashes(baseUrl),
      Number.isFinite(Number(limit)) ? Math.trunc(Number(limit)) : 'default'
    ].join('::');
  }

  async function fetchWithCache(cacheKey, ttlMs, fetcher) {
    const cachedValue = readFreshCacheValue(responseCache, cacheKey);

    if (cachedValue !== null) {
      return cachedValue;
    }

    if (inflightRequests.has(cacheKey)) {
      return inflightRequests.get(cacheKey);
    }

    const requestPromise = Promise.resolve()
      .then(fetcher)
      .then((value) => writeCachedValue(responseCache, cacheKey, value, ttlMs))
      .finally(() => {
        inflightRequests.delete(cacheKey);
      });

    inflightRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  function shouldSkipLookupUrl(value) {
    const parsed = normalizeUrl(value);

    if (!parsed) {
      return true;
    }

    const normalizedSiteHost = normalizeHost(SITE_BASE);
    const normalizedTargetHost = normalizeHost(parsed.toString());

    if (!normalizedTargetHost) {
      return true;
    }

    return normalizedTargetHost === normalizedSiteHost
      || isLoopbackHost(normalizedTargetHost)
      || NON_MERCHANT_HOSTS.has(normalizedTargetHost);
  }

  function apiBaseForUrl(value) {
    const parsed = normalizeUrl(value);
    const host = parsed?.hostname || normalizeHost(value);
    const port = parsed?.port || '';

    if (!isLoopbackHost(host)) {
      return API_BASE;
    }

    if (port === '5173' || port === '5001') {
      return `http://${host}:5001/couponleo/api`;
    }

    return `http://${host}:5000/couponleo/api`;
  }

  async function canReachApiBase(baseUrl) {
    const normalizedBaseUrl = trimTrailingSlashes(baseUrl);

    if (normalizedBaseUrl === trimTrailingSlashes(API_BASE)) {
      return true;
    }

    const cachedAvailability = readFreshCacheValue(apiBaseAvailabilityCache, normalizedBaseUrl);

    if (cachedAvailability !== null) {
      return cachedAvailability;
    }

    try {
      const response = await fetchWithTimeout(`${normalizedBaseUrl}/health`, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        cache: 'no-store',
        timeoutMs: LOCAL_BASE_DISCOVERY_TIMEOUT_MS
      });
      return writeCachedValue(apiBaseAvailabilityCache, normalizedBaseUrl, response.ok, API_BASE_CACHE_TTL_MS);
    } catch {
      return writeCachedValue(apiBaseAvailabilityCache, normalizedBaseUrl, false, API_BASE_CACHE_TTL_MS);
    }
  }

  async function resolveApiBase(baseHint) {
    const candidates = [];
    const hintedBase = apiBaseForUrl(baseHint || '');

    if (hintedBase && hintedBase !== API_BASE) {
      candidates.push(hintedBase);
    }

    for (const candidate of LOCAL_API_CANDIDATES) {
      if (!candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }

    candidates.push(API_BASE);

    for (const candidate of candidates) {
      if (candidate === API_BASE || await canReachApiBase(candidate)) {
        return candidate;
      }
    }

    return API_BASE;
  }

  async function requestJson(path, options = {}) {
    const baseUrl = trimTrailingSlashes(options.baseUrl || await resolveApiBase(options.baseHint));
    const url = new URL(`${baseUrl}${path}`);

    Object.entries(options.params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });

    try {
      const response = await fetchWithTimeout(url.toString(), {
        method: options.method || 'GET',
        headers: {
          Accept: 'application/json',
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: 'no-store',
        timeoutMs: REQUEST_TIMEOUT_MS
      });

      if (!response.ok) {
        let payload = {};
        try {
          payload = await response.json();
        } catch (_error) {
          payload = {};
        }
        throw new Error(payload?.message || `CouponLeo API returned ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (baseUrl !== API_BASE && options.allowFallback !== false) {
        writeCachedValue(apiBaseAvailabilityCache, baseUrl, false, API_BASE_CACHE_TTL_MS);
        return requestJson(path, {
          ...options,
          baseUrl: API_BASE,
          allowFallback: false
        });
      }

      throw error;
    }
  }

  async function fetchJson(path, params, options = {}) {
    return requestJson(path, {
      ...options,
      params
    });
  }

  function normalizeLookupResult(payload, fallbackValue) {
    const data = payload && typeof payload === 'object' ? payload : {};
    const coupons = Array.isArray(data.coupons) ? data.coupons : [];
    const couponCount = Number.isFinite(Number(data.couponCount))
      ? Math.max(Math.trunc(Number(data.couponCount)), coupons.length)
      : coupons.length;

    return {
      supported: data.supported !== false,
      matched: Boolean(data.matched),
      matchedDomain: data.matchedDomain || normalizeHost(fallbackValue || ''),
      store: data.store || null,
      couponCount,
      coupons
    };
  }

  async function sendRuntimeRequest(type, payload) {
    if (!extensionApi?.runtime?.sendMessage) {
      throw new Error('CouponLeo runtime messaging is unavailable.');
    }

    const message = {
      namespace: MESSAGE_NAMESPACE,
      type,
      payload: payload || {}
    };

    let response;

    if (globalThis.browser?.runtime?.sendMessage) {
      response = await extensionApi.runtime.sendMessage(message);
    } else {
      response = await new Promise((resolve, reject) => {
        extensionApi.runtime.sendMessage(message, (nextResponse) => {
          const lastError = extensionApi.runtime?.lastError;

          if (lastError) {
            reject(new Error(lastError.message || 'CouponLeo background request failed.'));
            return;
          }

          resolve(nextResponse);
        });
      });
    }

    if (!response?.ok) {
      throw new Error(response?.error || 'CouponLeo background request failed.');
    }

    return response.data;
  }

  async function lookupByTabUrl(tabUrl, couponLimit) {
    const parsed = normalizeUrl(tabUrl);

    if (!parsed || shouldSkipLookupUrl(parsed.toString())) {
      return {
        supported: false,
        matched: false,
        matchedDomain: '',
        store: null,
        couponCount: 0,
        coupons: []
      };
    }

    const params = {
      url: parsed.toString()
    };

    if (Number.isFinite(Number(couponLimit)) && Number(couponLimit) > 0) {
      params.coupon_limit = Math.trunc(Number(couponLimit));
    }

    const baseUrl = await resolveApiBase(parsed.toString());
    const cacheKey = buildLookupCacheKey(baseUrl, parsed.hostname, params.coupon_limit);
    const payload = await fetchWithCache(cacheKey, LOOKUP_CACHE_TTL_MS, () => fetchJson('/stores/match', params, {
      baseHint: parsed.toString(),
      baseUrl
    }));

    return normalizeLookupResult(payload?.data, parsed.hostname);
  }

  async function lookupByTabUrlViaRuntime(tabUrl, couponLimit) {
    const parsed = normalizeUrl(tabUrl);

    if (!parsed || shouldSkipLookupUrl(parsed.toString())) {
      return {
        supported: false,
        matched: false,
        matchedDomain: '',
        store: null,
        couponCount: 0,
        coupons: []
      };
    }

    const data = await sendRuntimeRequest(MESSAGE_TYPES.lookupByTabUrl, {
      tabUrl: parsed.toString(),
      couponLimit
    });

    return normalizeLookupResult(data, parsed.hostname);
  }

  async function getTopStores(limit) {
    const normalizedLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.trunc(Number(limit)) : 6;
    const baseUrl = await resolveApiBase();
    const cacheKey = buildTopStoresCacheKey(baseUrl, normalizedLimit);
    const payload = await fetchWithCache(cacheKey, TOP_STORES_CACHE_TTL_MS, () => fetchJson('/stores', {
      limit: normalizedLimit
    }, {
      baseUrl
    }));

    if (Array.isArray(payload?.data)) {
      return payload.data;
    }

    if (Array.isArray(payload?.items)) {
      return payload.items;
    }

    return [];
  }

  async function getTopStoresViaRuntime(limit) {
    const data = await sendRuntimeRequest(MESSAGE_TYPES.getTopStores, { limit });
    return Array.isArray(data) ? data : [];
  }

  function buildStoreUrl(store) {
    const slug = encodeURIComponent(String(store?.slug || '').trim());
    return `${SITE_BASE}${slug ? `/stores/${slug}` : '/stores'}`;
  }

  function buildCouponUrl(coupon, store) {
    const directUrl =
      coupon?.ctaUrl ||
      coupon?.cta_url ||
      coupon?.affiliate_link ||
      coupon?.deeplink ||
      coupon?.url;

    if (directUrl) {
      const normalizedTarget = normalizeHost(directUrl);
      const normalizedSite = normalizeHost(SITE_BASE);

      if (normalizedTarget && normalizedTarget !== normalizedSite) {
        return directUrl;
      }
    }

    return buildStoreUrl(store);
  }

  async function openUrl(url) {
    const parsed = normalizeUrl(url);
    const targetUrl = parsed ? parsed.toString() : SITE_BASE;

    if (extensionApi?.tabs?.create) {
      return createTab({ url: targetUrl });
    }

    if (typeof globalThis.open === 'function') {
      globalThis.open(targetUrl, '_blank', 'noopener');
    }

    return null;
  }

  async function openUrlViaRuntime(url) {
    return sendRuntimeRequest(MESSAGE_TYPES.openUrl, { url });
  }

  function buildAuthUrl(path, options = {}) {
    const siteBase = String(options.siteBase || SITE_BASE).replace(/\/+$/, '');
    const target = new URL(`${siteBase}${path.startsWith('/') ? path : `/${path}`}`);
    if (options.mode) {
      target.searchParams.set('mode', options.mode);
    }
    if (options.next) {
      target.searchParams.set('next', String(options.next));
    }
    if (options.closeAfterAuth) {
      target.searchParams.set('close', '1');
    }
    return target.toString();
  }

  function buildSignInUrl(options = {}) {
    return buildAuthUrl('/sign-in', options);
  }

  function buildSignUpUrl(options = {}) {
    return buildAuthUrl('/sign-up', options);
  }

  function buildExtensionBridgeMatcher(url) {
    const parsed = normalizeUrl(url);
    if (!parsed || parsed.pathname !== EXTENSION_BRIDGE_PATH) {
      return null;
    }
    return parsed;
  }

  async function readAuthSession() {
    const stored = await storageGet('local', AUTH_SESSION_STORAGE_KEY);
    const session = stored?.[AUTH_SESSION_STORAGE_KEY];
    return session && typeof session === 'object' ? session : null;
  }

  async function writeAuthSession(session) {
    await storageSet('local', { [AUTH_SESSION_STORAGE_KEY]: session });
    return session;
  }

  async function clearAuthSession() {
    await storageRemove('local', AUTH_SESSION_STORAGE_KEY);
  }

  async function readUserState() {
    const stored = await storageGet('local', USER_STATE_STORAGE_KEY);
    const state = stored?.[USER_STATE_STORAGE_KEY];
    return state && typeof state === 'object' ? state : {};
  }

  async function writeUserState(state) {
    await storageSet('local', { [USER_STATE_STORAGE_KEY]: state || {} });
    return state || {};
  }

  function getSessionUserKey(session) {
    if (session?.user?.email) {
      return String(session.user.email).trim().toLowerCase();
    }
    if (session?.user?.id !== undefined && session?.user?.id !== null) {
      return String(session.user.id).trim();
    }
    return '';
  }

  async function getAuthUser(sessionToken, baseUrl) {
    const payload = await requestJson('/public/v1/auth/me', { token: sessionToken, baseUrl });
    return payload?.user || null;
  }

  async function logoutAuthSession(sessionToken, baseUrl) {
    return requestJson('/public/v1/auth/logout', { method: 'POST', token: sessionToken, baseUrl });
  }

  function formatBadgeCount(count) {
    const numericValue = Number(count);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return '';
    }

    return numericValue > 9 ? '9+' : String(Math.trunc(numericValue));
  }

  globalThis.CouponLeoExtension = {
    API_BASE,
    SITE_BASE,
    extensionApi,
    normalizeHost,
    normalizeUrl,
    isLoopbackHost,
    shouldSkipLookupUrl,
    apiBaseForUrl,
    resolveApiBase,
    lookupByTabUrl,
    lookupByTabUrlViaRuntime,
    getTopStores,
    getTopStoresViaRuntime,
    buildStoreUrl,
    buildCouponUrl,
    openUrl,
    openUrlViaRuntime,
    queryTabs,
    getTab,
    createTab,
    removeTab,
    storageGet,
    storageSet,
    storageRemove,
    setActionBadgeText,
    setActionBadgeBackgroundColor,
    setActionTitle,
    MESSAGE_NAMESPACE,
    MESSAGE_TYPES,
    AUTH_SESSION_STORAGE_KEY,
    USER_STATE_STORAGE_KEY,
    EXTENSION_BRIDGE_PATH,
    requestJson,
    buildAuthUrl,
    buildSignInUrl,
    buildSignUpUrl,
    buildExtensionBridgeMatcher,
    readAuthSession,
    writeAuthSession,
    clearAuthSession,
    readUserState,
    writeUserState,
    getSessionUserKey,
    getAuthUser,
    logoutAuthSession,
    formatBadgeCount
  };
})();
