importScripts('shared.js');

const {
  extensionApi,
  lookupByTabUrl,
  getTopStores,
  openUrl,
  queryTabs,
  getTab,
  removeTab,
  setActionBadgeText,
  setActionBadgeBackgroundColor,
  setActionTitle,
  apiBaseForUrl,
  buildExtensionBridgeMatcher,
  writeAuthSession,
  getAuthUser,
  formatBadgeCount,
  MESSAGE_NAMESPACE,
  MESSAGE_TYPES
} = self.CouponLeoExtension;
const BADGE_COLOR = '#2ea44f';

function shouldCloseBridgeTab(parsedUrl) {
  return ['1', 'true', 'yes', 'on'].includes(String(parsedUrl.searchParams.get('close') || '').toLowerCase());
}

function inferDisplayName(fullName, email) {
  const normalizedFullName = String(fullName || '').trim();

  if (normalizedFullName) {
    return normalizedFullName;
  }

  const handle = String(email || '').split('@')[0] || 'CouponLeo user';

  return handle
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ') || 'CouponLeo user';
}

async function captureBridgeSession(tabId, tabUrl) {
  const parsedUrl = buildExtensionBridgeMatcher(tabUrl);
  if (!parsedUrl) {
    return false;
  }

  let sessionToken = String(parsedUrl.searchParams.get('sessionToken') || '').trim();
  const provider = String(parsedUrl.searchParams.get('provider') || '').trim();
  const siteBase = `${parsedUrl.protocol}//${parsedUrl.host}`;
  const apiBase = apiBaseForUrl(siteBase);

  let user = null;
  let authMode = 'api';

  try {
    if (sessionToken) {
      user = await getAuthUser(sessionToken, apiBase);
    }
  } catch {
    user = null;
  }

  if (!user) {
    const email = String(parsedUrl.searchParams.get('email') || '').trim();
    const fullName = String(parsedUrl.searchParams.get('fullName') || '').trim();

    if (email) {
      authMode = 'local';
      sessionToken = sessionToken || `local-${Date.now()}`;
      user = {
        email,
        displayName: inferDisplayName(fullName, email)
      };
    }
  }

  if (!user) {
    return false;
  }

  await writeAuthSession({
    token: sessionToken,
    provider,
    siteBase,
    apiBase,
    user,
    authMode,
    capturedAt: new Date().toISOString()
  });

  if (tabId && shouldCloseBridgeTab(parsedUrl)) {
    try {
      await removeTab(tabId);
    } catch {
      // Keep the session even if the bridge tab cannot be closed.
    }
  }

  return true;
}

async function setBadge(tabId, tabUrl) {
  if (!tabId) {
    return;
  }

  const clearBadge = async () => {
    await setActionBadgeText({ tabId, text: '' });
    await setActionTitle({ tabId, title: 'CouponLeo' });
  };

  try {
    const result = await lookupByTabUrl(tabUrl, 1);

    if (!result.supported || !result.matched || !result.store) {
      await clearBadge();
      return;
    }

    const count = Number.isFinite(Number(result.couponCount)) ? Math.trunc(Number(result.couponCount)) : 0;
    await setActionBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
    await setActionBadgeText({ tabId, text: formatBadgeCount(count) });
    await setActionTitle({
      tabId,
      title: count > 0 ? `CouponLeo: ${count} offers on ${result.store.name}` : `CouponLeo: ${result.store.name}`
    });
  } catch {
    await clearBadge();
  }
}

async function refreshActiveTab() {
  const [activeTab] = await queryTabs({ active: true, lastFocusedWindow: true });

  if (activeTab?.id) {
    await setBadge(activeTab.id, activeTab.url);
  }
}

extensionApi.runtime.onInstalled.addListener(() => {
  refreshActiveTab();
});

if (extensionApi.runtime.onStartup) {
  extensionApi.runtime.onStartup.addListener(() => {
    refreshActiveTab();
  });
}

extensionApi.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await getTab(tabId);
  await setBadge(tabId, tab?.url);
});

extensionApi.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== 'complete') {
    return;
  }

  const nextUrl = changeInfo.url || tab?.url;
  captureBridgeSession(tabId, nextUrl)
    .then((captured) => {
      if (!captured) {
        setBadge(tabId, nextUrl);
      }
    })
    .catch(() => {
      setBadge(tabId, nextUrl);
    });
});

extensionApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.namespace !== MESSAGE_NAMESPACE) {
    return undefined;
  }

  (async () => {
    switch (message.type) {
      case MESSAGE_TYPES.lookupByTabUrl:
        return lookupByTabUrl(message.payload?.tabUrl, message.payload?.couponLimit);
      case MESSAGE_TYPES.getTopStores:
        return getTopStores(message.payload?.limit);
      case MESSAGE_TYPES.openUrl:
        await openUrl(message.payload?.url);
        return { opened: true };
      default:
        throw new Error(`Unsupported CouponLeo message type: ${message.type}`);
    }
  })()
    .then((data) => {
      sendResponse({ ok: true, data });
    })
    .catch((error) => {
      sendResponse({ ok: false, error: error?.message || 'CouponLeo background request failed.' });
    });

  return true;
});
