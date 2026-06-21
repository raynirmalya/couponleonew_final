(function () {
  const {
    normalizeUrl,
    shouldSkipLookupUrl,
    lookupByTabUrl,
    lookupByTabUrlViaRuntime,
    getTopStores,
    getTopStoresViaRuntime,
    queryTabs,
    buildStoreUrl,
    buildCouponUrl,
    openUrl,
    openUrlViaRuntime,
    readAuthSession,
    writeAuthSession,
    clearAuthSession,
    readUserState,
    writeUserState,
    getSessionUserKey,
    apiBaseForUrl,
    getAuthUser,
    logoutAuthSession,
    buildSignInUrl,
    buildSignUpUrl
  } = window.CouponLeoExtension;

  const popupShell = document.querySelector('.popup-shell');
  const statusCard = document.getElementById('status-card');
  const heroContent = document.getElementById('hero-content');
  const accountCard = document.getElementById('account-card');
  const offerContent = document.getElementById('offer-content');
  const footerCard = document.getElementById('footer-card');
  const headerMenu = document.getElementById('header-menu');
  const siteHomeLink = document.querySelector('[data-site-home-link]');

  let activeCategoryKey = 'all';
  let activeCouponPage = 1;
  let activeCouponQuery = '';
  let activeCouponType = 'all';
  let activeSession = null;
  let allUserState = {};
  let activeLookupResult = null;
  let activeSiteHost = 'Checking tab...';
  let preferredSiteBase = 'https://couponleo.com';
  let isHeaderMenuOpen = false;

  const POPUP_COUPON_FETCH_LIMIT = 250;
  const COUPONS_PER_PAGE = 8;
  const SESSION_RESTORE_TIMEOUT_MS = 3000;
  const LOOKUP_TIMEOUT_MS = 9000;
  const TOP_STORES_TIMEOUT_MS = 5000;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeCompare(value) {
    return String(value || '').trim().toLowerCase();
  }

  function iconSvg(name) {
    const paths = {
      globe: '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path><path d="M12 3a14.5 14.5 0 0 1 0 18"></path><path d="M12 3a14.5 14.5 0 0 0 0 18"></path>',
      refresh: '<path d="M20 12a8 8 0 1 1-2.34-5.66"></path><path d="M20 4v6h-6"></path>',
      external: '<path d="M14 5h5v5"></path><path d="M10 14 19 5"></path><path d="M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4"></path>',
      arrowRight: '<path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path>',
      scan: '<path d="M4 12h3"></path><path d="M17 12h3"></path><path d="M12 4v3"></path><path d="M12 17v3"></path><circle cx="12" cy="12" r="4"></circle>',
      check: '<path d="m5 13 4 4L19 7"></path>',
      search: '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>',
      block: '<circle cx="12" cy="12" r="9"></circle><path d="m7 7 10 10"></path>',
      alert: '<path d="M12 9v4"></path><path d="M12 17h.01"></path><path d="M10.3 4.9 2.9 18.2A1 1 0 0 0 3.8 20h16.4a1 1 0 0 0 .9-1.5L13.7 4.9a1 1 0 0 0-1.7 0Z"></path>',
      user: '<path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"></path><path d="M5 20a7 7 0 0 1 14 0"></path>',
      bookmark: '<path d="M8 4h8a1 1 0 0 1 1 1v15l-5-3-5 3V5a1 1 0 0 1 1-1Z"></path>',
      bell: '<path d="M15 17H9"></path><path d="M10 20a2 2 0 0 0 4 0"></path><path d="M18 17V11a6 6 0 0 0-12 0v6l-2 2h16Z"></path>',
      ticket: '<path d="M4 8a2 2 0 0 0 0 4v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4a2 2 0 0 0 0-4V4a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1Z"></path><path d="M12 3v14"></path>',
      star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z"></path>',
      tag: '<path d="m20 10-8.5 8.5a2 2 0 0 1-2.8 0L3 12.8V4h8.8L20 10Z"></path><circle cx="8.5" cy="8.5" r="1"></circle>',
      store: '<path d="M4 10h16"></path><path d="M5 10V7l2-3h10l2 3v3"></path><path d="M6 10v9h12v-9"></path><path d="M10 14h4"></path>'
    };

    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.alert}</svg>`;
  }

  function formatOfferCountLabel(count) {
    const numericCount = Math.max(0, Math.trunc(Number(count) || 0));
    return `${numericCount} live offer${numericCount === 1 ? '' : 's'}`;
  }

  function formatHostLabel(value) {
    const raw = String(value || '').trim();
    if (!raw) {
      return 'Checking tab...';
    }

    return raw.replace(/^www\./i, '');
  }

  function buildBrowseStoresUrl() {
    return `${trimTrailingSlashes(preferredSiteBase)}/stores`;
  }

  function updateSiteHomeLinks() {
    if (siteHomeLink) {
      siteHomeLink.setAttribute('href', preferredSiteBase);
    }
  }

  function setHeaderMenuOpen(nextOpen) {
    isHeaderMenuOpen = Boolean(nextOpen);

    if (!headerMenu) {
      return;
    }

    headerMenu.className = isHeaderMenuOpen ? 'header-menu header-menu-open' : 'header-menu';
    headerMenu.setAttribute('aria-hidden', isHeaderMenuOpen ? 'false' : 'true');
  }

  function renderHeaderMenu() {
    if (!headerMenu) {
      return;
    }

    const items = [
      `<a class="header-menu-item" href="${escapeHtml(preferredSiteBase)}" target="_blank" rel="noreferrer">${iconSvg('external')}<span>Open CouponLeo</span></a>`,
      `<a class="header-menu-item" href="${escapeHtml(buildBrowseStoresUrl())}" target="_blank" rel="noreferrer">${iconSvg('store')}<span>Browse stores</span></a>`
    ];

    if (activeSession?.token && activeSession?.user) {
      items.push(`<button type="button" class="header-menu-item" data-auth-action="signout">${iconSvg('user')}<span>Sign out</span></button>`);
    } else {
      items.push(`<button type="button" class="header-menu-item" data-auth-action="signin">${iconSvg('user')}<span>Sign in</span></button>`);
      items.push(`<button type="button" class="header-menu-item" data-auth-action="signup">${iconSvg('tag')}<span>Create account</span></button>`);
    }

    headerMenu.innerHTML = items.join('');
    setHeaderMenuOpen(false);
  }

  function setStatus(mode, eyebrow, title, message, badgeText) {
    const statusIconByMode = {
      loading: 'scan',
      matched: 'check',
      fallback: 'search',
      unsupported: 'block',
      error: 'alert'
    };
    const badgeMarkup = badgeText
      ? `<div class="status-badges"><span class="status-badge">${iconSvg('tag')}${escapeHtml(badgeText)}</span></div>`
      : '';

    statusCard.className = `status-strip status-strip-${mode}`;
    statusCard.innerHTML = `
      <div class="status-strip-grid">
        <div class="status-cell">
          <span class="status-cell-icon status-cell-icon-site">${iconSvg('globe')}</span>
          <div class="status-cell-copy">
            <p class="eyebrow">Current site</p>
            <h2 class="status-title">${escapeHtml(formatHostLabel(activeSiteHost))}</h2>
          </div>
        </div>
        <div class="status-divider">
          <span class="status-divider-button">${iconSvg('arrowRight')}</span>
        </div>
        <div class="status-cell">
          <span class="status-cell-icon status-cell-icon-${mode}">${iconSvg(statusIconByMode[mode])}</span>
          <div class="status-cell-copy">
            <p class="eyebrow">${escapeHtml(eyebrow)}</p>
            <h2 class="status-title">${escapeHtml(title)}</h2>
            ${message ? `<p class="status-copy">${escapeHtml(message)}</p>` : ''}
            ${badgeMarkup}
          </div>
        </div>
      </div>
    `;
  }

  function sessionUserState() {
    const key = getSessionUserKey(activeSession);
    if (!key) {
      return { savedStores: {}, alertStoreSlugs: {} };
    }

    const record = allUserState?.[key];
    return {
      savedStores: record?.savedStores && typeof record.savedStores === 'object' ? record.savedStores : {},
      alertStoreSlugs: record?.alertStoreSlugs && typeof record.alertStoreSlugs === 'object' ? record.alertStoreSlugs : {}
    };
  }

  function trimTrailingSlashes(value) {
    return String(value || '').replace(/\/+$/, '');
  }

  function withTimeout(promise, timeoutMs, message) {
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        globalThis.setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  }

  function capturePopupViewState() {
    const scrollTop = Number(document.documentElement?.scrollTop || document.body?.scrollTop || 0);
    const activeElement = document.activeElement;

    if (activeElement?.id !== 'coupon-search-input') {
      return { scrollTop, searchSelection: null };
    }

    return {
      scrollTop,
      searchSelection: {
        start: Number.isFinite(Number(activeElement.selectionStart)) ? Number(activeElement.selectionStart) : String(activeElement.value || '').length,
        end: Number.isFinite(Number(activeElement.selectionEnd)) ? Number(activeElement.selectionEnd) : String(activeElement.value || '').length,
      }
    };
  }

  function restorePopupViewState(viewState) {
    if (!viewState) {
      return;
    }

    const apply = () => {
      if (Number.isFinite(Number(viewState.scrollTop))) {
        document.documentElement.scrollTop = Number(viewState.scrollTop);
        document.body.scrollTop = Number(viewState.scrollTop);
      }

      if (!viewState.searchSelection) {
        return;
      }

      const searchInput = popupShell.querySelector('#coupon-search-input');
      if (!searchInput) {
        return;
      }

      const maxLength = String(searchInput.value || '').length;
      const selectionStart = Math.max(0, Math.min(maxLength, Number(viewState.searchSelection.start) || 0));
      const selectionEnd = Math.max(selectionStart, Math.min(maxLength, Number(viewState.searchSelection.end) || selectionStart));

      try {
        searchInput.focus({ preventScroll: true });
      } catch {
        searchInput.focus();
      }

      if (typeof searchInput.setSelectionRange === 'function') {
        searchInput.setSelectionRange(selectionStart, selectionEnd);
      }

      document.documentElement.scrollTop = Number(viewState.scrollTop);
      document.body.scrollTop = Number(viewState.scrollTop);
    };

    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(apply);
      return;
    }

    apply();
  }

  function preferredStoreUrl(store) {
    const slug = encodeURIComponent(String(store?.slug || '').trim());
    return `${trimTrailingSlashes(preferredSiteBase)}${slug ? `/stores/${slug}` : '/stores'}`;
  }

  function preferredCouponUrl(coupon, store) {
    const defaultStoreUrl = buildStoreUrl(store);
    const resolvedUrl = buildCouponUrl(coupon, store);

    return resolvedUrl === defaultStoreUrl
      ? preferredStoreUrl(store)
      : resolvedUrl;
  }

  async function persistSessionUserState(nextState) {
    const key = getSessionUserKey(activeSession);
    if (!key) {
      return;
    }

    allUserState = {
      ...(allUserState || {}),
      [key]: {
        savedStores: nextState?.savedStores || {},
        alertStoreSlugs: nextState?.alertStoreSlugs || {}
      }
    };
    await writeUserState(allUserState);
  }

  async function ensureSession() {
    const storedSession = await readAuthSession();
    allUserState = await readUserState();

    if (!storedSession?.token) {
      activeSession = null;
      return null;
    }

    let nextSession = storedSession;
    if (!storedSession.user) {
      try {
        const user = await withTimeout(
          getAuthUser(storedSession.token, storedSession.apiBase || apiBaseForUrl(storedSession.siteBase || '')),
          SESSION_RESTORE_TIMEOUT_MS,
          'CouponLeo session restore timed out.',
        );
        nextSession = { ...storedSession, user };
        await writeAuthSession(nextSession);
      } catch {
        await clearAuthSession();
        activeSession = null;
        return null;
      }
    }

    activeSession = nextSession;
    return nextSession;
  }

  function renderFooterCard(label, url) {
    if (!label || !url) {
      footerCard.innerHTML = '';
      return;
    }

    footerCard.innerHTML = `
      <a class="footer-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">
        <span class="footer-link-main">
          <span class="footer-link-icon">${iconSvg('store')}</span>
          <span>${escapeHtml(label)}</span>
        </span>
        ${iconSvg('arrowRight')}
      </a>
    `;
  }

  function getStoreLogoUrl(store) {
    return String(
      store?.logo_square_url
      || store?.logoUrl
      || store?.image_url
      || store?.logo_horizontal_url
      || ''
    ).trim();
  }

  function storeInitials(store) {
    const source = String(store?.name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('');

    return source ? source.toLowerCase() : 'cl';
  }

  function renderStoreLogo(store) {
    const logoUrl = getStoreLogoUrl(store);
    if (logoUrl) {
      return `
        <div class="store-logo-shell">
          <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(store?.name || 'Store logo')}">
        </div>
      `;
    }

    return `
      <div class="store-logo-shell">
        <span class="store-logo-fallback">${escapeHtml(storeInitials(store))}</span>
      </div>
    `;
  }

  function renderAccountMiniTile({ icon, count, title, actionAttr, actionValue, active, alertTone }) {
    const isAction = Boolean(actionAttr && actionValue);
    const tagName = isAction ? 'button' : 'div';
    const attributeMarkup = isAction
      ? ` type="button" ${actionAttr}="${escapeHtml(actionValue)}"`
      : '';
    const className = `${isAction ? 'account-mini-card' : 'account-mini-panel'}${active ? ' account-mini-card-active' : ''}`;
    const iconClass = alertTone ? 'account-mini-icon account-mini-icon-alert' : 'account-mini-icon';

    return `
      <${tagName} class="${className}"${attributeMarkup}>
        <span class="${iconClass}">${iconSvg(icon)}</span>
        <span class="account-mini-body">
          <strong>${escapeHtml(String(count))}</strong>
          <span class="account-mini-title">${escapeHtml(title)}</span>
        </span>
        <span class="account-mini-chevron">${iconSvg('arrowRight')}</span>
      </${tagName}>
    `;
  }

  function renderSignedOutAccount() {
    const matchedStore = activeLookupResult?.matched && activeLookupResult?.store ? activeLookupResult.store : null;
    const copy = matchedStore
      ? `Sign in to save ${matchedStore.name} and keep alerts ready for later visits.`
      : 'Sign in to save stores, keep alerts ready, and reuse your CouponLeo session.';

    accountCard.innerHTML = `
      <div class="account-stack">
        <div class="account-row">
          <span class="account-avatar">${iconSvg('user')}</span>
          <div class="account-summary">
            <p class="account-label">Extension account</p>
            <h2>Keep CouponLeo ready for later visits.</h2>
          </div>
          <span class="pill-inline">Logged out</span>
          <span class="account-row-chevron">${iconSvg('arrowRight')}</span>
        </div>
        <p class="account-copy">${escapeHtml(copy)}</p>
        <div class="account-actions">
          <button type="button" class="primary-link" data-auth-action="signin">Sign in</button>
          <button type="button" class="secondary-link" data-auth-action="signup">Create account</button>
        </div>
      </div>
    `;
  }

  function getStoreState(store) {
    const state = sessionUserState();
    const storeSlug = String(store?.slug || '').trim();
    return {
      isSaved: Boolean(storeSlug && state.savedStores?.[storeSlug]),
      alertsOn: Boolean(storeSlug && state.alertStoreSlugs?.[storeSlug])
    };
  }

  function renderSignedInAccount() {
    const state = sessionUserState();
    const savedCount = Object.keys(state.savedStores || {}).length;
    const alertCount = Object.keys(state.alertStoreSlugs || {}).length;
    const displayName = String(activeSession?.user?.displayName || activeSession?.user?.email || 'CouponLeo user').trim();
    const matchedStore = activeLookupResult?.matched && activeLookupResult?.store ? activeLookupResult.store : null;
    const storeState = matchedStore ? getStoreState(matchedStore) : { isSaved: false, alertsOn: false };

    accountCard.innerHTML = `
      <div class="account-stack">
        <div class="account-row">
          <span class="account-avatar">${iconSvg('user')}</span>
          <div class="account-summary">
            <p class="account-label">Signed in</p>
            <h2>${escapeHtml(displayName)}</h2>
            <span class="account-user">${escapeHtml(activeSession?.user?.email || '')}</span>
          </div>
          <span class="account-pill">${iconSvg('check')}<span>Account active</span></span>
          <span class="account-row-chevron">${iconSvg('arrowRight')}</span>
        </div>
        <div class="account-mini-grid">
          ${matchedStore
            ? renderAccountMiniTile({
              icon: 'bookmark',
              count: savedCount,
              title: 'Saved stores',
              actionAttr: 'data-store-save',
              actionValue: matchedStore.slug,
              active: storeState.isSaved,
              alertTone: false
            })
            : renderAccountMiniTile({
              icon: 'bookmark',
              count: savedCount,
              title: 'Saved stores',
              actionAttr: '',
              actionValue: '',
              active: false,
              alertTone: false
            })}
          ${matchedStore
            ? renderAccountMiniTile({
              icon: 'bell',
              count: alertCount,
              title: 'Alerted stores',
              actionAttr: 'data-store-alert',
              actionValue: matchedStore.slug,
              active: storeState.alertsOn,
              alertTone: true
            })
            : renderAccountMiniTile({
              icon: 'bell',
              count: alertCount,
              title: 'Alerted stores',
              actionAttr: '',
              actionValue: '',
              active: false,
              alertTone: true
            })}
        </div>
      </div>
    `;
  }

  function renderAccountCard() {
    renderHeaderMenu();

    if (activeSession?.token && activeSession?.user) {
      renderSignedInAccount();
      return;
    }
    renderSignedOutAccount();
  }

  async function resolvePreferredSiteBase() {
    if (activeSession?.siteBase) {
      return activeSession.siteBase;
    }

    try {
      const tabs = await queryTabs({});
      const localTab = ['4300', '5173']
        .map((port) => (tabs || []).find((tab) => {
          const parsed = normalizeUrl(tab?.url);
          return parsed
            && ['127.0.0.1', 'localhost'].includes(parsed.hostname)
            && parsed.port === port;
        }))
        .find(Boolean);
      if (localTab?.url) {
        const parsed = normalizeUrl(localTab.url);
        if (parsed) {
          return `${parsed.protocol}//${parsed.host}`;
        }
      }
    } catch {
      // Fall through to the production site base.
    }

    return 'https://couponleo.com';
  }

  async function getActiveTab() {
    const queryCandidates = [
      { active: true, currentWindow: true },
      { active: true, lastFocusedWindow: true },
    ];

    for (const queryInfo of queryCandidates) {
      try {
        const tabs = await queryTabs(queryInfo);
        if (Array.isArray(tabs) && tabs.length > 0) {
          return tabs[0];
        }
      } catch {
        // Try the next browser query strategy.
      }
    }

    throw new Error('CouponLeo could not resolve the active browser tab.');
  }

  async function openAuthFlow(mode) {
    const siteBase = await resolvePreferredSiteBase();
    const targetUrl = mode === 'signup'
      ? buildSignUpUrl({ mode: 'extension', next: '/extension-bridge', closeAfterAuth: true, siteBase })
      : buildSignInUrl({ mode: 'extension', next: '/extension-bridge', closeAfterAuth: true, siteBase });

    try {
      await openUrlViaRuntime(targetUrl);
    } catch {
      await openUrl(targetUrl);
    }
  }

  async function signOut() {
    const sessionToken = activeSession?.token || '';
    try {
      if (sessionToken && activeSession?.authMode !== 'local') {
        await logoutAuthSession(sessionToken, activeSession?.apiBase || apiBaseForUrl(activeSession?.siteBase || ''));
      }
    } catch {
      // Clearing the local session is still the right recovery path here.
    }

    await clearAuthSession();
    activeSession = null;
    renderAccountCard();

    if (activeLookupResult?.matched && activeLookupResult?.store) {
      renderMatched(activeLookupResult);
    }
  }

  function formatCategoryLabel(category) {
    const rawValue = String(category || '').trim();

    if (!rawValue) {
      return 'Other offers';
    }

    return rawValue
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function couponCategoryKey(coupon) {
    return String(coupon?.categorySlug || coupon?.categoryName || 'other-offers').trim().toLowerCase() || 'other-offers';
  }

  function couponTypeKey(coupon) {
    const normalizedType = String(coupon?.type || '').trim().toLowerCase();

    if (normalizedType === 'code') {
      return 'code';
    }

    if (normalizedType === 'deal') {
      return 'deal';
    }

    return coupon?.code ? 'code' : 'deal';
  }

  function couponMatchesCategory(coupon, categoryKey) {
    const normalizedKey = String(categoryKey || 'all').trim().toLowerCase() || 'all';
    return normalizedKey === 'all' || couponCategoryKey(coupon) === normalizedKey;
  }

  function couponMatchesType(coupon, typeKey) {
    const normalizedKey = String(typeKey || 'all').trim().toLowerCase() || 'all';
    return normalizedKey === 'all' || couponTypeKey(coupon) === normalizedKey;
  }

  function couponMatchesQuery(coupon, query) {
    const normalizedQuery = String(query || '').trim().toLowerCase();

    if (!normalizedQuery) {
      return true;
    }

    const haystack = [
      coupon?.title,
      coupon?.description,
      coupon?.discountText,
      coupon?.code,
      coupon?.type,
      coupon?.storeName,
      coupon?.categoryName,
      coupon?.categorySlug,
    ]
      .map((value) => String(value || '').trim().toLowerCase())
      .join(' ');

    return haystack.includes(normalizedQuery);
  }

  function groupCouponsByCategory(coupons) {
    const groups = [];
    const lookup = new Map();

    coupons.forEach((coupon) => {
      const key = couponCategoryKey(coupon);

      if (!lookup.has(key)) {
        const group = {
          key,
          label: formatCategoryLabel(coupon.categoryName || coupon.categorySlug),
          coupons: []
        };
        lookup.set(key, group);
        groups.push(group);
      }

      lookup.get(key).coupons.push(coupon);
    });

    return groups;
  }

  function countCouponsByType(coupons) {
    return coupons.reduce(
      (counts, coupon) => {
        const key = couponTypeKey(coupon);
        counts[key] = (counts[key] || 0) + 1;
        counts.all += 1;
        return counts;
      },
      { all: 0, code: 0, deal: 0 }
    );
  }

  function renderFilterChips(searchScopedCoupons) {
    const totalCount = searchScopedCoupons.length;
    const typeCounts = countCouponsByType(searchScopedCoupons);
    const categoryGroups = groupCouponsByCategory(searchScopedCoupons);
    const chips = [
      {
        kind: 'all',
        value: 'all',
        label: 'All offers',
        count: totalCount,
        active: activeCouponType === 'all' && activeCategoryKey === 'all'
      }
    ];

    if (typeCounts.deal > 0) {
      chips.push({
        kind: 'type',
        value: 'deal',
        label: 'Deals',
        count: typeCounts.deal,
        active: activeCouponType === 'deal' && activeCategoryKey === 'all'
      });
    }

    if (typeCounts.code > 0) {
      chips.push({
        kind: 'type',
        value: 'code',
        label: 'Codes',
        count: typeCounts.code,
        active: activeCouponType === 'code' && activeCategoryKey === 'all'
      });
    }

    categoryGroups.forEach((group) => {
      chips.push({
        kind: 'category',
        value: group.key,
        label: group.label,
        count: group.coupons.length,
        active: activeCategoryKey === group.key && activeCouponType === 'all'
      });
    });

    return `
      <div class="coupon-filter-chips" role="tablist" aria-label="Offer filters">
        ${chips
          .map(
            (chip) => `
              <button
                class="${chip.active ? 'coupon-filter-chip coupon-filter-chip-active' : 'coupon-filter-chip'}"
                type="button"
                role="tab"
                data-filter-kind="${escapeHtml(chip.kind)}"
                data-filter-value="${escapeHtml(chip.value)}"
                aria-selected="${escapeHtml(String(chip.active))}"
              >
                <span>${escapeHtml(chip.label)}</span>
                <span class="coupon-tab-count">${escapeHtml(String(chip.count))}</span>
              </button>
            `
          )
          .join('')}
      </div>
    `;
  }

  function renderSearchBar(matchCount) {
    return `
      <div class="coupon-search-shell">
        <label class="coupon-search-label" for="coupon-search-input">Search offers</label>
        <div class="coupon-search-field">
          <span class="coupon-search-icon">${iconSvg('search')}</span>
          <input
            id="coupon-search-input"
            class="coupon-search-input"
            type="search"
            inputmode="search"
            autocomplete="off"
            spellcheck="false"
            placeholder="Search code, deal, or keyword"
            value="${escapeHtml(activeCouponQuery)}"
          >
          ${activeCouponQuery
            ? `<button type="button" class="coupon-search-clear" data-search-clear="true" aria-label="Clear offer search">Clear</button>`
            : `<span class="coupon-search-count">${escapeHtml(String(matchCount))}</span>`}
        </div>
      </div>
    `;
  }

  function renderPaginationControls(page, pageCount) {
    if (pageCount <= 1) {
      return '';
    }

    return `
      <div class="coupon-pagination">
        <button
          type="button"
          class="coupon-pagination-button"
          data-page-direction="prev"
          ${page <= 1 ? 'disabled' : ''}
        >
          Prev
        </button>
        <span class="coupon-pagination-copy">Page ${escapeHtml(String(page))} of ${escapeHtml(String(pageCount))}</span>
        <button
          type="button"
          class="coupon-pagination-button"
          data-page-direction="next"
          ${page >= pageCount ? 'disabled' : ''}
        >
          Next
        </button>
      </div>
    `;
  }

  function resetCouponBrowserState() {
    activeCategoryKey = 'all';
    activeCouponPage = 1;
    activeCouponQuery = '';
    activeCouponType = 'all';
  }

  function applyCategoryFilter(categoryKey) {
    const normalizedKey = String(categoryKey || 'all').trim().toLowerCase() || 'all';
    activeCategoryKey = normalizedKey;
    activeCouponType = 'all';
    activeCouponPage = 1;

    if (activeLookupResult?.matched && activeLookupResult?.store) {
      renderMatched(activeLookupResult);
    }
  }

  function applyTypeFilter(typeKey) {
    const normalizedKey = ['code', 'deal'].includes(String(typeKey || '').trim().toLowerCase())
      ? String(typeKey || '').trim().toLowerCase()
      : 'all';

    activeCouponType = normalizedKey;
    activeCategoryKey = 'all';
    activeCouponPage = 1;

    if (activeLookupResult?.matched && activeLookupResult?.store) {
      renderMatched(activeLookupResult);
    }
  }

  function applyCouponSearch(query) {
    activeCouponQuery = String(query || '').trim();
    activeCouponPage = 1;

    if (activeLookupResult?.matched && activeLookupResult?.store) {
      renderMatched(activeLookupResult);
    }
  }

  function goToCouponPage(direction) {
    const delta = direction === 'prev' ? -1 : 1;
    activeCouponPage = Math.max(1, activeCouponPage + delta);

    if (activeLookupResult?.matched && activeLookupResult?.store) {
      renderMatched(activeLookupResult);
    }
  }

  function renderStoreCard(store, couponCount) {
    const storeUrl = preferredStoreUrl(store);
    const merchantUrl = store.url || storeUrl;
    const storeHeadline = String(store?.headline || '').trim()
      || 'CouponLeo found this merchant and loaded live offers from the real coupon feed.';

    return `
      <section class="store-card">
        <div class="store-hero">
          ${renderStoreLogo(store)}
          <div class="store-body">
            <p class="store-copy store-copy-lead">${escapeHtml(storeHeadline)}</p>
          </div>
        </div>
        <div class="store-actions">
          <a class="primary-link store-action-link" href="${escapeHtml(storeUrl)}" target="_blank" rel="noreferrer">
            <span>Open store page</span>
            <span class="store-action-icon">${iconSvg('external')}</span>
          </a>
          <a class="secondary-link store-action-link" href="${escapeHtml(merchantUrl)}" target="_blank" rel="noreferrer">
            <span>Visit merchant</span>
            <span class="store-action-icon">${iconSvg('external')}</span>
          </a>
        </div>
        <div class="store-stats">
          <div class="store-stat">
            <div class="store-stat-top">
              <span class="store-stat-icon">${iconSvg('ticket')}</span>
              <strong>${escapeHtml(String(Math.max(0, Math.trunc(Number(couponCount) || 0))))}</strong>
            </div>
            <span>Live offers</span>
          </div>
          <div class="store-stat">
            <div class="store-stat-top">
              <span class="store-stat-icon store-stat-icon-score">${iconSvg('star')}</span>
              <strong>${escapeHtml(String(store?.qualityScore || 'Tracked'))}</strong>
            </div>
            <span>Store score</span>
          </div>
        </div>
      </section>
    `;
  }

  function renderMatched(result) {
    const viewState = capturePopupViewState();
    const store = result.store;
    const coupons = Array.isArray(result.coupons) ? result.coupons : [];
    const couponCount = Number.isFinite(Number(result.couponCount)) ? Math.trunc(Number(result.couponCount)) : coupons.length;
    const loadedCouponCount = coupons.length;
    const searchScopedCoupons = coupons.filter((coupon) => couponMatchesQuery(coupon, activeCouponQuery));
    let categoryScopedCoupons = searchScopedCoupons.filter((coupon) => couponMatchesCategory(coupon, activeCategoryKey));
    let typeCounts = countCouponsByType(categoryScopedCoupons);

    if (activeCouponType !== 'all' && !(typeCounts[activeCouponType] > 0)) {
      activeCouponType = 'all';
    }

    const typeScopedCoupons = searchScopedCoupons.filter((coupon) => couponMatchesType(coupon, activeCouponType));
    const categoryGroups = groupCouponsByCategory(typeScopedCoupons);
    const activeCategoryAvailable = activeCategoryKey === 'all' || categoryGroups.some((group) => group.key === activeCategoryKey);

    if (!activeCategoryAvailable) {
      activeCategoryKey = 'all';
      categoryScopedCoupons = searchScopedCoupons;
    } else {
      categoryScopedCoupons = searchScopedCoupons.filter((coupon) => couponMatchesCategory(coupon, activeCategoryKey));
    }

    typeCounts = countCouponsByType(categoryScopedCoupons);

    const filteredCoupons = categoryScopedCoupons.filter((coupon) => couponMatchesType(coupon, activeCouponType));
    const pageCount = Math.max(1, Math.ceil(filteredCoupons.length / COUPONS_PER_PAGE));
    activeCouponPage = Math.min(Math.max(activeCouponPage, 1), pageCount);
    const pageStart = filteredCoupons.length ? (activeCouponPage - 1) * COUPONS_PER_PAGE : 0;
    const pageCoupons = filteredCoupons.slice(pageStart, pageStart + COUPONS_PER_PAGE);
    const visibleRangeStart = filteredCoupons.length ? pageStart + 1 : 0;
    const visibleRangeEnd = pageStart + pageCoupons.length;
    const couponGroups = groupCouponsByCategory(pageCoupons);
    const loadedAllCoupons = loadedCouponCount >= couponCount;

    activeLookupResult = result;
    renderAccountCard();
    renderFooterCard('Browse stores', buildBrowseStoresUrl());

    if (couponCount <= 0) {
      setStatus(
        'matched',
        'Store matched',
        store.name || 'Matched store',
        store.headline || 'CouponLeo recognizes this merchant, but there are no live offers right now.',
        '0 live offers'
      );
      heroContent.innerHTML = renderStoreCard(store, 0);
      offerContent.innerHTML = '';
      restorePopupViewState(viewState);
      return;
    }

    const statusMessage = activeCouponQuery
      ? `${searchScopedCoupons.length} offer matches are visible for this merchant.`
      : loadedAllCoupons
        ? ''
        : `${loadedCouponCount} offers loaded in the popup right now.`;

    setStatus(
      'matched',
      'Store matched',
      store.name || 'Matched store',
      statusMessage,
      formatOfferCountLabel(couponCount)
    );

    heroContent.innerHTML = renderStoreCard(store, couponCount);
    offerContent.innerHTML = `
      <section class="coupon-browser">
        <div class="coupon-browser-toolbar">
          ${renderSearchBar(searchScopedCoupons.length)}
          ${renderFilterChips(searchScopedCoupons)}
          ${renderPaginationControls(activeCouponPage, pageCount)}
        </div>
        <section class="coupon-list">
          ${couponGroups.length
            ? couponGroups.map((group) => renderCouponGroup(group, store)).join('')
            : renderEmptyCouponState()}
        </section>
      </section>
    `;
    restorePopupViewState(viewState);
  }

  function renderCouponGroup(group, store) {
    return `
      <section class="coupon-group" data-category-group="${escapeHtml(group.key)}">
        <div class="coupon-group-heading">
          <div>
            <p class="eyebrow">Coupon category</p>
            <h3 class="coupon-group-title">${escapeHtml(group.label)}</h3>
          </div>
          <span class="pill-inline">${escapeHtml(`${group.coupons.length} offers`)}</span>
        </div>
        <div class="coupon-group-list">
          ${group.coupons.map((coupon) => renderCoupon(coupon, store)).join('')}
        </div>
      </section>
    `;
  }

  function renderCoupon(coupon, store) {
    const hasCode = Boolean(coupon.code);
    const buttonLabel = hasCode ? 'Copy code' : 'Open deal';
    const actionUrl = preferredCouponUrl(coupon, store);
    const typeLabel = hasCode ? 'Code' : 'Deal';
    const title = String(coupon.title || coupon.discountText || 'CouponLeo offer').trim();
    const subtitle = formatCategoryLabel(coupon.categoryName || coupon.categorySlug || couponTypeKey(coupon));
    const description = String(coupon.description || coupon.discountText || '').trim();
    const showDescription = Boolean(
      description
      && normalizeCompare(description) !== normalizeCompare(title)
      && normalizeCompare(description) !== normalizeCompare(subtitle)
    );
    const expiresCopy = coupon.expiresAt ? `Ends ${coupon.expiresAt}` : 'Freshly ranked';

    return `
      <article class="coupon-card">
        <div class="coupon-body">
          <div class="coupon-topline">
            <span class="coupon-tag">${iconSvg('tag')}<span>${escapeHtml(typeLabel)}</span></span>
            ${coupon.verified ? `<span class="coupon-verified">${iconSvg('check')}<span>Verified</span></span>` : ''}
          </div>
          <h3>${escapeHtml(title)}</h3>
          <p class="coupon-subtitle">${escapeHtml(subtitle)}</p>
          ${showDescription ? `<p class="coupon-description">${escapeHtml(description)}</p>` : ''}
          <div class="coupon-footer">
            <div class="coupon-info-block">
              ${hasCode ? `<div class="coupon-code">${escapeHtml(coupon.code)}</div>` : '<div class="coupon-code">No code needed</div>'}
              <div class="coupon-meta">${escapeHtml(expiresCopy)}</div>
            </div>
            <div class="coupon-actions">
              <button class="coupon-button coupon-button-copy" data-copy="${escapeHtml(coupon.code || '')}" data-open="${escapeHtml(actionUrl)}">${escapeHtml(buttonLabel)}</button>
              <a class="coupon-button coupon-button-open" href="${escapeHtml(actionUrl)}" target="_blank" rel="noreferrer">Open</a>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function renderEmptyCouponState() {
    const message = activeCouponQuery
      ? 'Try a different keyword or clear the search to see more live offers.'
      : 'Try another type or category to bring matching offers back into view.';

    return `
      <article class="coupon-empty-state">
        <h3>No offers match this view</h3>
        <p class="coupon-description">${escapeHtml(message)}</p>
      </article>
    `;
  }

  function renderFallback(host, stores) {
    const storeList = Array.isArray(stores) ? stores : [];

    activeLookupResult = null;
    renderAccountCard();
    setStatus(
      'fallback',
      'No direct match',
      'Start with stronger brands',
      `CouponLeo does not have a direct store match for ${host} yet.`,
      storeList.length ? `${storeList.length} store picks` : ''
    );

    heroContent.innerHTML = `
      <section class="fallback-card">
        <p class="eyebrow">Top stores right now</p>
        <h2>Browse stronger CouponLeo brands</h2>
        <p class="store-copy">No merchant mapping was found for this domain, so the popup is offering better-known stores from CouponLeo instead.</p>
        <ul class="fallback-list">
          ${storeList
            .map(
              (store) => `
                <li>
                  <a href="${escapeHtml(preferredStoreUrl(store))}" target="_blank" rel="noreferrer">
                    <span>
                      <span class="fallback-store-name">${escapeHtml(store.name)}</span>
                      <span class="fallback-store-copy">${escapeHtml(store.headline || store.savings || '')}</span>
                    </span>
                    <span class="pill-inline">${escapeHtml(store.savings || formatOfferCountLabel(store.activeCoupons || store.couponCount || 0))}</span>
                  </a>
                </li>
              `
            )
            .join('')}
        </ul>
      </section>
    `;
    offerContent.innerHTML = '';
    renderFooterCard('Browse stores', buildBrowseStoresUrl());
  }

  function renderUnsupported() {
    activeLookupResult = null;
    renderAccountCard();
    setStatus('unsupported', 'Unsupported page', 'Use a merchant page', 'CouponLeo works on normal store websites, not browser pages or local development URLs.');
    heroContent.innerHTML = `
      <section class="fallback-card">
        <p class="eyebrow">Where it works</p>
        <h2>Open this popup on a live merchant domain</h2>
        <p class="store-copy">The extension scans regular shopping or brand pages. Browser tabs, settings pages, and localhost or loopback URLs are intentionally skipped.</p>
      </section>
    `;
    offerContent.innerHTML = '';
    renderFooterCard('Open CouponLeo', preferredSiteBase);
  }

  function renderError() {
    activeLookupResult = null;
    renderAccountCard();
    setStatus('error', 'Temporary issue', 'Lookup unavailable', 'CouponLeo could not finish the store lookup right now. Try again in a moment.');
    heroContent.innerHTML = `
      <section class="fallback-card">
        <p class="eyebrow">Need a backup path?</p>
        <h2>Open CouponLeo directly</h2>
        <p class="store-copy">The popup is live, but the latest request could not complete. You can still browse stores and offers directly on CouponLeo.</p>
      </section>
    `;
    offerContent.innerHTML = '';
    renderFooterCard('Open CouponLeo', preferredSiteBase);
  }

  async function copyCouponOrOpen(button) {
    const code = (button.dataset.copy || '').trim();
    const targetUrl = button.dataset.open || preferredSiteBase;

    if (!code) {
      try {
        await openUrlViaRuntime(targetUrl);
      } catch {
        await openUrl(targetUrl);
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      const previousLabel = button.textContent;
      button.textContent = 'Copied';
      window.setTimeout(() => {
        button.textContent = previousLabel;
      }, 1200);
    } catch {
      try {
        await openUrlViaRuntime(targetUrl);
      } catch {
        await openUrl(targetUrl);
      }
    }
  }

  async function toggleSavedStore() {
    if (!activeSession?.token || !activeLookupResult?.store?.slug) {
      await openAuthFlow('signin');
      return;
    }

    const store = activeLookupResult.store;
    const state = sessionUserState();
    const savedStores = { ...(state.savedStores || {}) };
    const slug = String(store.slug).trim();

    if (savedStores[slug]) {
      delete savedStores[slug];
    } else {
      savedStores[slug] = {
        slug,
        name: store.name || slug,
        url: preferredStoreUrl(store)
      };
    }

    await persistSessionUserState({
      ...state,
      savedStores
    });

    if (activeLookupResult?.matched && activeLookupResult?.store) {
      renderMatched(activeLookupResult);
      return;
    }

    renderAccountCard();
  }

  async function toggleStoreAlert() {
    if (!activeSession?.token || !activeLookupResult?.store?.slug) {
      await openAuthFlow('signin');
      return;
    }

    const store = activeLookupResult.store;
    const state = sessionUserState();
    const alertStoreSlugs = { ...(state.alertStoreSlugs || {}) };
    const slug = String(store.slug).trim();

    if (alertStoreSlugs[slug]) {
      delete alertStoreSlugs[slug];
    } else {
      alertStoreSlugs[slug] = true;
    }

    await persistSessionUserState({
      ...state,
      alertStoreSlugs
    });

    if (activeLookupResult?.matched && activeLookupResult?.store) {
      renderMatched(activeLookupResult);
      return;
    }

    renderAccountCard();
  }

  popupShell.addEventListener('click', async (event) => {
    const refreshTrigger = event.target.closest('[data-refresh-popup]');
    if (refreshTrigger) {
      event.preventDefault();
      globalThis.location.reload();
      return;
    }

    const menuTrigger = event.target.closest('[data-menu-trigger]');
    if (menuTrigger) {
      event.preventDefault();
      setHeaderMenuOpen(!isHeaderMenuOpen);
      return;
    }

    const authTrigger = event.target.closest('[data-auth-action]');
    if (authTrigger) {
      event.preventDefault();
      setHeaderMenuOpen(false);
      const action = authTrigger.getAttribute('data-auth-action');
      if (action === 'signin') {
        await openAuthFlow('signin');
        return;
      }
      if (action === 'signup') {
        await openAuthFlow('signup');
        return;
      }
      if (action === 'signout') {
        await signOut();
      }
      return;
    }

    const filterTrigger = event.target.closest('[data-filter-kind]');
    if (filterTrigger) {
      event.preventDefault();
      const filterKind = String(filterTrigger.getAttribute('data-filter-kind') || '').trim().toLowerCase();
      const filterValue = String(filterTrigger.getAttribute('data-filter-value') || '').trim().toLowerCase();

      if (filterKind === 'type') {
        applyTypeFilter(filterValue);
        return;
      }

      if (filterKind === 'category') {
        applyCategoryFilter(filterValue);
        return;
      }

      activeCouponType = 'all';
      activeCategoryKey = 'all';
      activeCouponPage = 1;

      if (activeLookupResult?.matched && activeLookupResult?.store) {
        renderMatched(activeLookupResult);
      }
      return;
    }

    const searchClear = event.target.closest('[data-search-clear]');
    if (searchClear) {
      event.preventDefault();
      applyCouponSearch('');
      return;
    }

    const pagerTrigger = event.target.closest('[data-page-direction]');
    if (pagerTrigger) {
      event.preventDefault();
      if (pagerTrigger.disabled) {
        return;
      }
      goToCouponPage(pagerTrigger.dataset.pageDirection);
      return;
    }

    const copyTrigger = event.target.closest('[data-copy]');
    if (copyTrigger) {
      event.preventDefault();
      await copyCouponOrOpen(copyTrigger);
      return;
    }

    const saveTrigger = event.target.closest('[data-store-save]');
    if (saveTrigger) {
      event.preventDefault();
      await toggleSavedStore();
      return;
    }

    const alertTrigger = event.target.closest('[data-store-alert]');
    if (alertTrigger) {
      event.preventDefault();
      await toggleStoreAlert();
    }
  });

  document.addEventListener('click', (event) => {
    if (!isHeaderMenuOpen) {
      return;
    }

    if (event.target.closest('.header-menu-shell')) {
      return;
    }

    setHeaderMenuOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setHeaderMenuOpen(false);
    }
  });

  popupShell.addEventListener('input', (event) => {
    const searchInput = event.target.closest('#coupon-search-input');

    if (!searchInput) {
      return;
    }

    applyCouponSearch(searchInput.value);
  });

  async function init() {
    renderAccountCard();
    heroContent.innerHTML = '';
    offerContent.innerHTML = '';
    renderFooterCard('', '');
    setStatus('loading', 'Scanning CouponLeo', 'Checking this tab', 'Looking for live coupons and deals for this domain.');

    const sessionPromise = ensureSession()
      .then(() => {
        renderAccountCard();

        if (activeLookupResult?.matched && activeLookupResult?.store) {
          renderMatched(activeLookupResult);
        }
      })
      .catch(() => {
        renderAccountCard();
      });

    preferredSiteBase = trimTrailingSlashes(await resolvePreferredSiteBase());
    updateSiteHomeLinks();

    try {
      const activeTab = await getActiveTab();
      const parsedUrl = normalizeUrl(activeTab?.url);

      if (!parsedUrl) {
        activeSiteHost = 'Unsupported tab';
        renderUnsupported();
        await sessionPromise;
        return;
      }

      activeSiteHost = parsedUrl.hostname;

      if (shouldSkipLookupUrl(parsedUrl.toString())) {
        renderUnsupported();
        await sessionPromise;
        return;
      }

      resetCouponBrowserState();

      let result;

      try {
        result = await withTimeout(
          lookupByTabUrlViaRuntime(parsedUrl.toString(), POPUP_COUPON_FETCH_LIMIT),
          LOOKUP_TIMEOUT_MS,
          'CouponLeo runtime lookup timed out.',
        );
      } catch {
        result = await withTimeout(
          lookupByTabUrl(parsedUrl.toString(), POPUP_COUPON_FETCH_LIMIT),
          LOOKUP_TIMEOUT_MS,
          'CouponLeo direct lookup timed out.',
        );
      }

      if (!result.supported) {
        renderUnsupported();
        await sessionPromise;
        return;
      }

      if (result.matched && result.store) {
        renderMatched(result);
        await sessionPromise;
        return;
      }

      let topStores;

      try {
        topStores = await withTimeout(
          getTopStoresViaRuntime(5),
          TOP_STORES_TIMEOUT_MS,
          'CouponLeo runtime top stores timed out.',
        );
      } catch {
        topStores = await withTimeout(
          getTopStores(5),
          TOP_STORES_TIMEOUT_MS,
          'CouponLeo top stores timed out.',
        );
      }

      renderFallback(result.matchedDomain || parsedUrl.hostname, topStores);
      await sessionPromise;
    } catch {
      activeSiteHost = 'Tab unavailable';
      renderError();
      await sessionPromise;
    }
  }

  void init();
})();
