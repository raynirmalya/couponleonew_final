import type {
  CouponleoThemedPageConfig,
  CouponleoThemedPageNavLink,
} from '../components/couponleo-themed-page.component';

const memberWorkspaceLinks: CouponleoThemedPageNavLink[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/wishlist', label: 'Wishlist' },
  { href: '/my-coupons', label: 'My Coupons' },
  { href: '/alerts', label: 'Alerts' },
  { href: '/settings', label: 'Settings' },
];

function withActiveMemberLink(activeHref: string): CouponleoThemedPageNavLink[] {
  return memberWorkspaceLinks.map((link) => ({
    ...link,
    active: link.href === activeHref,
  }));
}

export const myCouponsPageConfig: CouponleoThemedPageConfig = {
  eyebrow: 'My Coupons',
  title: 'Keep every coupon you care about within reach.',
  description:
    'Use this member workspace to revisit recently opened deals, compare store offers, and move from discovery to redemption without losing momentum.',
  navLinks: withActiveMemberLink('/my-coupons'),
  actions: [
    { href: '/wishlist', label: 'Open Wishlist' },
    { href: '/top-deals', label: 'Browse Top Deals', variant: 'ghost' },
  ],
  metrics: [
    { value: '18', label: 'Codes ready', detail: 'Queued for your next visit' },
    { value: '7', label: 'Used this week', detail: 'Tracked redemptions and opens' },
    { value: '3', label: 'Expiring soon', detail: 'Worth revisiting today' },
  ],
  sections: [
    {
      eyebrow: 'Momentum',
      title: 'Turn browsing into usable savings faster',
      copy:
        'These shortcuts keep your active coupon journey tidy and make it easier to jump back into live store pages.',
      columns: 2,
      cards: [
        {
          badge: 'Recent',
          title: 'Resume live store sessions',
          copy: 'Jump back into featured stores and pick up from the latest offer pages you were exploring.',
          href: '/stores',
          cta: 'Browse stores',
          tone: 'blue',
        },
        {
          badge: 'Expiring',
          title: 'Refresh time-sensitive picks',
          copy: 'Scan the most urgent offers first so expiring codes do not fall off your shortlist.',
          href: '/top-deals',
          cta: 'View top deals',
          tone: 'sand',
        },
      ],
    },
    {
      eyebrow: 'Connected Tools',
      title: 'Link coupon activity with the rest of your dashboard',
      columns: 3,
      cards: [
        {
          title: 'Bundle favorites in Wishlist',
          copy: 'Collect stores, deals, and codes you want to revisit before checkout.',
          href: '/wishlist',
          cta: 'Open wishlist',
          tone: 'orange',
        },
        {
          title: 'Create timing alerts',
          copy: 'Stay on top of coupon drops, expiries, and price changes across categories.',
          href: '/alerts',
          cta: 'Manage alerts',
          tone: 'navy',
        },
        {
          title: 'Keep account preferences aligned',
          copy: 'Use settings to keep language, support, and privacy controls in sync with the rest of the workspace.',
          href: '/settings',
          cta: 'Open settings',
          tone: 'blue',
        },
      ],
    },
  ],
  footnote:
    'This page is intentionally lightweight for now, but the route is now fully wired and ready for deeper coupon-history features when you want to connect it to live account data.',
};

export const alertsPageConfig: CouponleoThemedPageConfig = {
  eyebrow: 'Alerts',
  title: 'Stay ahead of coupon drops, price moves, and expiring offers.',
  description:
    'Alerts keeps the CouponLeo experience proactive. Use it to watch favorite stores, monitor discount windows, and avoid missing short-lived deals.',
  navLinks: withActiveMemberLink('/alerts'),
  actions: [
    { href: '/top-deals', label: 'Find deals to watch' },
    { href: '/wishlist', label: 'Review Wishlist', variant: 'ghost' },
  ],
  metrics: [
    { value: '12', label: 'Tracked brands', detail: 'Stores and categories under watch' },
    { value: '4', label: 'Urgent alerts', detail: 'Expiry or price-drop reminders today' },
    { value: '2x', label: 'Faster follow-up', detail: 'Compared with manual re-checking' },
  ],
  sections: [
    {
      eyebrow: 'What To Watch',
      title: 'Build alerts around the savings behavior that matters most',
      columns: 3,
      cards: [
        {
          title: 'Expiring coupon reminders',
          copy: 'Get nudged when a code is about to close so high-intent offers stay visible.',
          meta: 'Best for short-lived store codes and seasonal campaigns.',
          tone: 'orange',
        },
        {
          title: 'Price-drop signals',
          copy: 'Track categories where discounts move quickly and you want a second look before buying.',
          meta: 'Useful for electronics, travel, and limited-time bundles.',
          tone: 'blue',
        },
        {
          title: 'Fresh campaign launches',
          copy: 'Stay updated when your favorite stores add new verified offers or bonus savings.',
          meta: 'A good fit for loyal brand shoppers and weekend sale trackers.',
          tone: 'navy',
        },
      ],
    },
    {
      eyebrow: 'Next Steps',
      title: 'Pair alerts with pages you already use every day',
      columns: 2,
      cards: [
        {
          badge: 'Wishlist',
          title: 'Promote wishlist items into tracked alerts',
          copy: 'Use your wishlist as the source list for higher-priority monitoring.',
          href: '/wishlist',
          cta: 'Open wishlist',
          tone: 'sand',
        },
        {
          badge: 'Dashboard',
          title: 'Return to your savings hub',
          copy: 'Use the dashboard for a snapshot of stores, notifications, and active offers.',
          href: '/dashboard',
          cta: 'Back to dashboard',
          tone: 'blue',
        },
      ],
    },
  ],
  footnote:
    'The route is live now, so you can wire this page to real notification preferences or backend alert rules next without changing the visual structure again.',
};

export const analyticsPageConfig: CouponleoThemedPageConfig = {
  eyebrow: 'Local Telemetry',
  title: 'Visitor telemetry now lives in a dedicated localhost dashboard.',
  description:
    'The main CouponLeo UI no longer exposes raw telemetry reads. Open the separate local dashboard when you need visitor, IP, market, and action-level analytics.',
  navLinks: withActiveMemberLink('/dashboard'),
  actions: [
    { href: '/dashboard', label: 'Return to dashboard' },
    { href: '/settings', label: 'Open settings', variant: 'ghost' },
  ],
  metrics: [
    { value: 'Local', label: 'Access mode', detail: 'Dashboard is intended for localhost use only' },
    { value: 'Keyed', label: 'Read protection', detail: 'Telemetry reads require the admin key server-side' },
    { value: 'Moved', label: 'Main UI status', detail: 'Public CouponLeo pages no longer surface raw analytics' },
  ],
  sections: [
    {
      eyebrow: 'Protected Access',
      title: 'Why telemetry moved out of the main app',
      columns: 3,
      cards: [
        {
          title: 'Keep IP-backed traffic data private',
          copy: 'Raw events, visitor IDs, and request metadata stay behind a local dashboard instead of a public member route.',
          meta: 'This reduces accidental exposure through the primary shopper app.',
          tone: 'blue',
        },
        {
          title: 'Use a server-side admin key',
          copy: 'The local telemetry project can read the secured API without pushing the key into browser code.',
          meta: 'The shopper UI never needs direct access to telemetry reads.',
          tone: 'orange',
        },
        {
          title: 'Keep the main experience clean',
          copy: 'CouponLeo stays focused on shoppers while the telemetry console handles diagnostics and operations.',
          meta: 'A clearer split between product UI and internal analytics tooling.',
          tone: 'navy',
        },
      ],
    },
    {
      eyebrow: 'Next Stops',
      title: 'Where to work from here instead',
      columns: 2,
      cards: [
        {
          badge: 'Dashboard',
          title: 'Return to the member workspace',
          copy: 'Use the regular CouponLeo dashboard for shopper workflows and account actions.',
          href: '/dashboard',
          cta: 'Open dashboard',
          tone: 'sand',
        },
        {
          badge: 'Settings',
          title: 'Keep account controls tidy',
          copy: 'Settings stays the right place for profile, support, and privacy management inside the main app.',
          href: '/settings',
          cta: 'Open settings',
          tone: 'blue',
        },
      ],
    },
  ],
  footnote:
    'Telemetry reads have intentionally moved out of the public CouponLeo surface and into a dedicated local console.',
};

export const settingsPageConfig: CouponleoThemedPageConfig = {
  eyebrow: 'Settings',
  title: 'Manage the account, preferences, and guardrails behind your savings flow.',
  description:
    'Settings gives CouponLeo a real page for profile updates, alert preferences, privacy controls, and the small configuration choices that make the rest of the product feel personal.',
  navLinks: withActiveMemberLink('/settings'),
  actions: [
    { href: '/help-center', label: 'Open Help Center' },
    { href: '/privacy-policy', label: 'Review Privacy Policy', variant: 'ghost' },
  ],
  metrics: [
    { value: '3', label: 'Preference groups', detail: 'Profile, notifications, and privacy controls' },
    { value: '2', label: 'Security reminders', detail: 'Password and session hygiene prompts' },
    { value: '1', label: 'Support path', detail: 'Direct handoff into help resources' },
  ],
  sections: [
    {
      eyebrow: 'Preferences',
      title: 'The settings areas that matter most first',
      columns: 3,
      cards: [
        {
          title: 'Notification controls',
          copy: 'Fine-tune how often alerts, campaign updates, and offer reminders reach you.',
          meta: 'Complements the dedicated Alerts route.',
          tone: 'blue',
        },
        {
          title: 'Profile and account identity',
          copy: 'Keep name, sign-in method, and account context consistent across the dashboard.',
          meta: 'Useful once live profile persistence is connected.',
          tone: 'orange',
        },
        {
          title: 'Privacy and session hygiene',
          copy: 'Review basic data-handling expectations and keep the account experience transparent.',
          meta: 'Pairs naturally with the privacy and terms pages in the footer.',
          tone: 'navy',
        },
      ],
    },
    {
      eyebrow: 'Need Help?',
      title: 'Step into support or legal routes when you need detail',
      columns: 2,
      cards: [
        {
          badge: 'Support',
          title: 'Troubleshoot account or preference issues',
          copy: 'Use the help center for common workflows, support paths, and response expectations.',
          href: '/help-center',
          cta: 'Visit help center',
          tone: 'sand',
        },
        {
          badge: 'Privacy',
          title: 'Review data handling guidance',
          copy: 'Jump to the policy summary page for a cleaner overview of how account data is treated.',
          href: '/privacy-policy',
          cta: 'Open privacy page',
          tone: 'blue',
        },
      ],
    },
  ],
  footnote:
    'This route completes the dashboard navigation set and keeps account-related links from falling back to placeholder pages.',
};

export const helpCenterPageConfig: CouponleoThemedPageConfig = {
  eyebrow: 'Help Center',
  title: 'Get quick answers on accounts, coupons, and site navigation.',
  description:
    'Help Center gives support links a dedicated home with the same CouponLeo visual tone, so users are no longer dropped into a generic contact page when they need help.',
  actions: [
    { href: '/contact', label: 'Contact support' },
    { href: '/settings', label: 'Open settings', variant: 'ghost' },
  ],
  metrics: [
    { value: '3', label: 'Support lanes', detail: 'Account, coupon, and navigation help' },
    { value: '24h', label: 'Response target', detail: 'For standard email support follow-up' },
    { value: '1', label: 'Clear starting point', detail: 'No more placeholder support routing' },
  ],
  sections: [
    {
      eyebrow: 'Popular Topics',
      title: 'The questions users usually need answered first',
      columns: 3,
      cards: [
        {
          title: 'Signing in or creating an account',
          copy: 'Use the sign-in and sign-up flows for access issues, or move into Settings once you are inside the dashboard.',
          href: '/sign-in',
          cta: 'Open sign-in',
          tone: 'blue',
        },
        {
          title: 'Finding working offers faster',
          copy: 'Browse Stores, Categories, and Top Deals to cross-check offer quality from multiple angles.',
          href: '/top-deals',
          cta: 'Browse top deals',
          tone: 'orange',
        },
        {
          title: 'Saving items for later',
          copy: 'Wishlist is now the dedicated destination for stores, deals, and coupons you want to revisit.',
          href: '/wishlist',
          cta: 'Open wishlist',
          tone: 'navy',
        },
      ],
    },
    {
      eyebrow: 'Need More?',
      title: 'Helpful follow-up pages',
      columns: 2,
      cards: [
        {
          badge: 'Privacy',
          title: 'Review how data is handled',
          copy: 'The privacy page gives a cleaner overview of data expectations and account-level trust signals.',
          href: '/privacy-policy',
          cta: 'Read privacy policy',
          tone: 'sand',
        },
        {
          badge: 'Terms',
          title: 'Check usage expectations',
          copy: 'The terms page summarises account, platform, and offer-usage guidelines in the same branded shell.',
          href: '/terms-of-use',
          cta: 'Read terms of use',
          tone: 'blue',
        },
      ],
    },
  ],
  footnote:
    'This route now supports the footer properly and gives you a stable place to expand FAQs later if you want a deeper support center.',
};

export const termsOfUsePageConfig: CouponleoThemedPageConfig = {
  eyebrow: 'Terms of Use',
  title: 'Understand the main ground rules for using CouponLeo.',
  description:
    'This themed summary page replaces the old placeholder destination and gives Terms of Use a proper branded home in the footer and sign-up flow.',
  actions: [
    { href: '/privacy-policy', label: 'Read Privacy Policy' },
    { href: '/help-center', label: 'Visit Help Center', variant: 'ghost' },
  ],
  sections: [
    {
      eyebrow: 'Core Guidelines',
      title: 'What this route should communicate clearly',
      columns: 3,
      cards: [
        {
          title: 'Offer information changes over time',
          copy: 'Coupons, store availability, and discount timing may change, so shoppers should verify details before checkout.',
          tone: 'blue',
        },
        {
          title: 'Accounts should be used responsibly',
          copy: 'Members should keep their information accurate and avoid misuse of codes, rewards, or account access.',
          tone: 'orange',
        },
        {
          title: 'Platform updates will continue',
          copy: 'CouponLeo can evolve its features, layouts, and account experience as the product grows.',
          tone: 'navy',
        },
      ],
    },
    {
      eyebrow: 'Support Routes',
      title: 'Pages that help users interpret the policy',
      columns: 2,
      cards: [
        {
          badge: 'Privacy',
          title: 'Pair terms with data guidance',
          copy: 'Privacy Policy explains how information is treated while this page focuses on usage expectations.',
          href: '/privacy-policy',
          cta: 'Open privacy policy',
          tone: 'sand',
        },
        {
          badge: 'Help',
          title: 'Get help if a rule or flow feels unclear',
          copy: 'The help center is the best next stop for account or usage questions that need more context.',
          href: '/help-center',
          cta: 'Open help center',
          tone: 'blue',
        },
      ],
    },
  ],
  footnote:
    'This is a polished summary page rather than a fully detailed legal document, but it now gives the route real structure and consistent design.',
};

export const privacyPolicyPageConfig: CouponleoThemedPageConfig = {
  eyebrow: 'Privacy Policy',
  title: 'See how CouponLeo treats website and extension data.',
  description:
    'This privacy summary covers both the CouponLeo website and the CouponLeo Companion browser extension, including sessions, saved items, current-store matching, browser storage, and telemetry.',
  lastUpdated: 'June 23, 2026',
  layout: 'legal',
  heroTone: 'soft',
  actions: [
    { href: '/terms-of-use', label: 'Read Terms of Use' },
    { href: '/settings', label: 'Open settings', variant: 'ghost' },
  ],
  sections: [
    {
      eyebrow: '1. What CouponLeo uses',
      title: 'What CouponLeo may collect',
      variant: 'legal',
      cards: [
        {
          badge: 'Session',
          title: 'Account and session information',
          copy: 'Sign-in details and session state can be used to personalize the website, restore member context, and support sign-in handoff with the browser extension.',
          tone: 'blue',
        },
        {
          badge: 'Storage',
          title: 'Saved items and browser preferences',
          copy: 'Wishlist content, saved stores, locale choices, and related browser preferences can be stored locally so users can continue their CouponLeo workflow later.',
          tone: 'orange',
        },
        {
          badge: 'Extension',
          title: 'Current-store matching and usage context',
          copy: 'The extension can read the current store URL or hostname to determine whether CouponLeo has matching offers, and CouponLeo can record product-usage events needed to operate and improve the service.',
          tone: 'navy',
        },
      ],
    },
    {
      eyebrow: '2. How information is used',
      title: 'Why CouponLeo uses this information',
      variant: 'legal',
      cards: [
        {
          badge: 'Operations',
          title: 'Run website and extension features',
          copy: 'CouponLeo uses this data to power account routes, saved-item flows, current-store matching, extension popups, and relevant coupon discovery features.',
          tone: 'sand',
        },
        {
          badge: 'Quality',
          title: 'Improve reliability and support',
          copy: 'CouponLeo can use service diagnostics and usage events to troubleshoot issues, measure quality, and respond to privacy or support questions. CouponLeo does not sell this user data to unrelated third parties.',
          tone: 'blue',
        },
      ],
    },
  ],
  footnote:
    'This policy summary is written to cover both couponleo.com and the CouponLeo Companion browser extension in one consistent place.',
};
