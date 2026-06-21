(function () {
  const {
    extensionApi,
    SITE_BASE,
    normalizeHost,
    normalizeUrl,
    shouldSkipLookupUrl,
    lookupByTabUrl,
    lookupByTabUrlViaRuntime,
    storageGet,
    storageSet,
    buildStoreUrl,
    openUrl,
    openUrlViaRuntime
  } = window.CouponLeoExtension;

  const NOTICE_ID = 'couponleo-notification-root';
  const STORAGE_KEY = 'couponleoNotificationPrefs';
  const SESSION_KEY = 'couponleo-notification-dismissed';

  if (window.top !== window) {
    return;
  }

  const pageUrl = normalizeUrl(window.location.href);
  const pageHost = normalizeHost(window.location.href);

  if (!pageUrl || !pageHost || pageHost === normalizeHost(SITE_BASE) || shouldSkipLookupUrl(pageUrl.toString())) {
    return;
  }

  function getCouponCount(result) {
    return Number.isFinite(Number(result?.couponCount)) ? Math.max(Math.trunc(Number(result.couponCount)), 0) : (result?.coupons || []).length;
  }

  async function readPreferences() {
    if (!extensionApi.storage?.local) {
      return { disabledHosts: {} };
    }

    try {
      const stored = await storageGet('local', STORAGE_KEY);
      const preferences = stored?.[STORAGE_KEY];
      return preferences && typeof preferences === 'object' ? preferences : { disabledHosts: {} };
    } catch {
      return { disabledHosts: {} };
    }
  }

  async function writePreferences(preferences) {
    if (!extensionApi.storage?.local) {
      return;
    }

    try {
      await storageSet('local', { [STORAGE_KEY]: preferences });
    } catch {
      // Ignore storage failures and keep the notification functional.
    }
  }

  function readSessionDismissal() {
    try {
      return window.sessionStorage.getItem(`${SESSION_KEY}:${pageHost}`) === '1';
    } catch {
      return false;
    }
  }

  function writeSessionDismissal() {
    try {
      window.sessionStorage.setItem(`${SESSION_KEY}:${pageHost}`, '1');
    } catch {
      // Ignore storage failures and only dismiss this render.
    }
  }

  function buildHeadline(result) {
    const primaryCoupon = result.coupons?.[0];
    const headline = primaryCoupon?.discountText || result.store?.savings || `${getCouponCount(result)} live offers`;
    return String(headline).trim().toUpperCase();
  }

  function buildSummary(result) {
    const count = getCouponCount(result);
    const primaryCoupon = result.coupons?.[0];

    if (primaryCoupon?.code) {
      return `${count} live offers found for ${result.store.name}. Top code: ${primaryCoupon.code}`;
    }

    return `${count} live offers found for ${result.store.name}.`;
  }

  function removeNotice() {
    document.getElementById(NOTICE_ID)?.remove();
  }

  function renderNotification(result) {
    if (document.getElementById(NOTICE_ID)) {
      return;
    }

    const couponCount = getCouponCount(result);

    if (!result.store || couponCount <= 0) {
      return;
    }

    const primaryCoupon = result.coupons?.[0] || null;
    const activateUrl = buildStoreUrl(result.store);
    const logoUrl = extensionApi.runtime.getURL('assets/couponleo-mark.svg');
    const host = document.createElement('div');
    host.id = NOTICE_ID;

    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <style>
        .couponleo-notice {
          position: fixed;
          top: 24px;
          right: 18px;
          z-index: 2147483647;
          width: min(430px, calc(100vw - 32px));
          border-radius: 18px;
          border: 1px solid rgba(206, 88, 58, 0.72);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 247, 241, 0.98));
          box-shadow: 0 18px 42px rgba(61, 34, 22, 0.26);
          color: #1d2433;
          font: 14px/1.4 "Segoe UI", "IBM Plex Sans", system-ui, sans-serif;
          overflow: hidden;
        }

        .couponleo-inner {
          padding: 16px 18px 14px;
        }

        .couponleo-close {
          position: absolute;
          top: 8px;
          right: 10px;
          width: 30px;
          height: 30px;
          border: 0;
          border-radius: 999px;
          background: transparent;
          color: #111;
          font-size: 22px;
          line-height: 1;
          cursor: pointer;
        }

        .couponleo-main {
          display: grid;
          grid-template-columns: 68px 1fr auto;
          align-items: center;
          gap: 16px;
        }

        .couponleo-mark-wrap {
          width: 68px;
          height: 68px;
          border-radius: 14px;
          background: linear-gradient(135deg, #ef8b34, #f6a44d);
          display: grid;
          place-items: center;
          box-shadow: 0 14px 24px rgba(242, 140, 40, 0.24);
        }

        .couponleo-mark {
          width: 40px;
          height: 40px;
        }

        .couponleo-copy {
          min-width: 0;
        }

        .couponleo-offer {
          margin: 0;
          color: #3d9f3a;
          font-size: 18px;
          font-weight: 800;
          line-height: 1.1;
          text-transform: uppercase;
        }

        .couponleo-summary {
          margin: 8px 0 0;
          color: #4b5566;
          font-size: 13px;
        }

        .couponleo-store {
          margin: 6px 0 0;
          color: #8a5f35;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .couponleo-cta {
          border: 0;
          border-radius: 12px;
          min-width: 132px;
          min-height: 50px;
          padding: 0 20px;
          background: #c94837;
          color: #fff;
          font-size: 16px;
          font-weight: 800;
          letter-spacing: 0.02em;
          cursor: pointer;
          box-shadow: 0 10px 20px rgba(201, 72, 55, 0.26);
        }

        .couponleo-footer {
          margin-top: 12px;
          display: flex;
          justify-content: center;
        }

        .couponleo-settings {
          border: 0;
          background: transparent;
          color: #3563c5;
          font-size: 14px;
          text-decoration: underline;
          cursor: pointer;
        }

        .couponleo-panel {
          display: none;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(24, 37, 64, 0.08);
          gap: 10px;
        }

        .couponleo-panel[data-open="true"] {
          display: grid;
        }

        .couponleo-panel-copy {
          margin: 0;
          color: #5f6777;
          font-size: 13px;
          text-align: center;
        }

        .couponleo-panel-actions {
          display: flex;
          justify-content: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .couponleo-panel-button {
          border-radius: 999px;
          border: 1px solid rgba(24, 37, 64, 0.12);
          background: #fff;
          color: #1d2433;
          min-height: 38px;
          padding: 0 14px;
          font-weight: 700;
          cursor: pointer;
        }

        .couponleo-panel-button[data-tone="danger"] {
          border-color: rgba(201, 72, 55, 0.22);
          color: #c94837;
        }

        @media (max-width: 640px) {
          .couponleo-notice {
            top: auto;
            right: 16px;
            left: 16px;
            bottom: 16px;
            width: auto;
          }

          .couponleo-main {
            grid-template-columns: 56px 1fr;
          }

          .couponleo-cta {
            grid-column: 1 / -1;
            width: 100%;
            margin-top: 4px;
          }
        }
      </style>
      <aside class="couponleo-notice" role="dialog" aria-label="CouponLeo offers available on this site">
        <div class="couponleo-inner">
          <button class="couponleo-close" type="button" aria-label="Close" data-close>&times;</button>
          <div class="couponleo-main">
            <div class="couponleo-mark-wrap">
              <img class="couponleo-mark" src="${logoUrl}" alt="CouponLeo">
            </div>
            <div class="couponleo-copy">
              <p class="couponleo-offer">${buildHeadline(result)}</p>
              <p class="couponleo-summary">${buildSummary(result)}</p>
              <p class="couponleo-store">${result.store.name}</p>
            </div>
            <button class="couponleo-cta" type="button" data-activate>ACTIVATE</button>
          </div>
          <div class="couponleo-footer">
            <button class="couponleo-settings" type="button" data-settings aria-expanded="false">Notification settings</button>
          </div>
          <div class="couponleo-panel" data-panel data-open="false">
            <p class="couponleo-panel-copy">Choose how CouponLeo should behave on ${pageHost}.</p>
            <div class="couponleo-panel-actions">
              <button class="couponleo-panel-button" type="button" data-keep-showing>Keep showing</button>
              <button class="couponleo-panel-button" type="button" data-tone="danger" data-hide-site>Hide on this site</button>
            </div>
          </div>
        </div>
      </aside>
    `;

    document.documentElement.appendChild(host);

    const closeButton = shadowRoot.querySelector('[data-close]');
    const activateButton = shadowRoot.querySelector('[data-activate]');
    const settingsButton = shadowRoot.querySelector('[data-settings]');
    const panel = shadowRoot.querySelector('[data-panel]');
    const keepShowingButton = shadowRoot.querySelector('[data-keep-showing]');
    const hideSiteButton = shadowRoot.querySelector('[data-hide-site]');

    closeButton?.addEventListener('click', () => {
      writeSessionDismissal();
      removeNotice();
    });

    activateButton?.addEventListener('click', async () => {
      writeSessionDismissal();
      try {
        await openUrlViaRuntime(activateUrl);
      } catch {
        await openUrl(activateUrl);
      }
      removeNotice();
    });

    settingsButton?.addEventListener('click', () => {
      const isOpen = panel?.getAttribute('data-open') === 'true';
      panel?.setAttribute('data-open', String(!isOpen));
      settingsButton.setAttribute('aria-expanded', String(!isOpen));
    });

    keepShowingButton?.addEventListener('click', () => {
      panel?.setAttribute('data-open', 'false');
      settingsButton?.setAttribute('aria-expanded', 'false');
    });

    hideSiteButton?.addEventListener('click', async () => {
      const preferences = await readPreferences();
      const disabledHosts = { ...(preferences.disabledHosts || {}), [pageHost]: true };
      await writePreferences({ ...preferences, disabledHosts });
      removeNotice();
    });
  }

  async function init() {
    if (readSessionDismissal()) {
      return;
    }

    const preferences = await readPreferences();

    if (preferences.disabledHosts?.[pageHost]) {
      return;
    }

    try {
      let result;

      try {
        result = await lookupByTabUrlViaRuntime(pageUrl.toString(), 1);
      } catch {
        result = await lookupByTabUrl(pageUrl.toString(), 1);
      }

      const couponCount = getCouponCount(result);

      if (!result.supported || !result.matched || !result.store || couponCount <= 0) {
        return;
      }

      renderNotification(result);
    } catch {
      // Fail silently so merchant pages are never interrupted.
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
