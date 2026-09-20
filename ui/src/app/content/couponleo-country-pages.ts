export interface CouponleoCountryPage {
  slug: string;
  countryName: string;
  inName: string;
  apiLocation: string;
  title: string;
  description: string;
  introduction: string;
  marketNote: string;
  questions: readonly { question: string; answer: string }[];
}

// A country page is useful only while there is enough real inventory to compare.
export const COUPONLEO_COUNTRY_PAGE_MIN_COUPONS = 10;
export const COUPONLEO_COUNTRY_PAGE_MIN_STORES = 3;

const featuredCountryPages: readonly CouponleoCountryPage[] = [
  {
    slug: 'india',
    countryName: 'India',
    inName: 'India',
    apiLocation: 'India',
    title: 'Top Coupons in India | Current Promo Codes | CouponLeo',
    description: 'Compare current coupon codes and deals listed for India. See stores, offer conditions, and expiry details before checkout.',
    introduction: 'Looking for a coupon that applies in India? Compare current codes and deals below, then check the merchant terms for your basket, payment method, and delivery address.',
    marketNote: 'An India market label identifies where the offer is listed. It does not guarantee that every product, city, payment method, or account qualifies.',
    questions: [
      {
        question: 'Which coupon codes can I use in India?',
        answer: 'The offers on this page are listed for India in the CouponLeo catalog. Choose a store and check the offer conditions at its checkout; eligibility can vary by item, account, and payment method.',
      },
      {
        question: 'Do I need a code for every India deal?',
        answer: 'No. A card shows a code when one is listed. For an offer without a code, open the store page and follow the merchant instructions before paying.',
      },
    ],
  },
  {
    slug: 'us',
    countryName: 'United States',
    inName: 'the US',
    apiLocation: 'United States of America',
    title: 'Top Coupons in the US | Current Promo Codes | CouponLeo',
    description: 'Compare current coupon codes and deals listed for the United States. Review stores, conditions, and expiry details before checkout.',
    introduction: 'Looking for a coupon that applies in the United States? Compare current codes and deals below, then check the merchant terms for your order and delivery address.',
    marketNote: 'A US market label identifies where the offer is listed. A merchant may still limit it by state, product, account, or payment method.',
    questions: [
      {
        question: 'Which coupon codes can I use in the United States?',
        answer: 'The offers on this page are listed for the United States in the CouponLeo catalog. Check the merchant checkout for restrictions and the final discount before placing an order.',
      },
      {
        question: 'Can I combine a US coupon with a sale price?',
        answer: 'That depends on the merchant and the offer. Compare the final order total with and without the code, and read any exclusions on sale items or code stacking.',
      },
    ],
  },
];

// These are the actual country markets in the catalog. Global and EU are regions,
// so they deliberately do not get a country landing page.
const otherCountryNames = [
  'United Kingdom', 'Australia', 'Germany', 'Canada', 'Italy', 'Mexico', 'Spain', 'France',
  'Portugal', 'Brazil', 'Czech Republic', 'Netherlands', 'Indonesia', 'Philippines',
  'Singapore', 'Vietnam', 'Russia', 'Sweden', 'Poland', 'China', 'Hong Kong', 'New Zealand',
  'Belgium', 'Austria', 'Ireland', 'Switzerland', 'Morocco', 'Japan', 'Denmark', 'Finland',
  'Hungary', 'Taiwan', 'Malaysia', 'Antigua and Barbuda', 'Argentina', 'Pakistan',
  'United Arab Emirates', 'Georgia', 'South Korea', 'Norway', 'Romania', 'Thailand',
  'Greece', 'Slovakia', 'South Africa', 'Niue', 'Turkey', 'Ukraine', 'Chile', 'Malta',
  'Colombia', 'Israel', 'Croatia', 'Paraguay', 'Belarus', 'Dominican Republic', 'Peru',
  'Saudi Arabia', 'Kenya', 'Estonia', 'Lithuania', 'Guernsey', 'Kuwait', 'Latvia',
  'Mauritius', 'Slovenia', 'Uruguay', 'Bahrain', 'Egypt', 'Honduras', 'Puerto Rico', 'Qatar',
] as const;

export const couponleoCountryPages: readonly CouponleoCountryPage[] = [
  ...featuredCountryPages,
  ...otherCountryNames.map((countryName) => ({
    slug: countryName.toLowerCase().replace(/\s+/g, '-'),
    countryName,
    inName: countryName,
    apiLocation: countryName,
    title: `Top Coupons in ${countryName} | Current Deals | CouponLeo`,
    description: `Compare current coupons and deals listed for ${countryName}. Check the store, offer conditions, and expiry before checkout.`,
    introduction: `Compare current coupons listed for ${countryName} below. Start with a store you use, then check its terms and final price before buying.`,
    marketNote: `A ${countryName} market label shows where the offer is listed. The merchant may still limit it by product, location, account, or payment method.`,
    questions: [
      {
        question: `Which coupons are listed for ${countryName}?`,
        answer: `The offers shown here carry a ${countryName} market label in the CouponLeo catalog. Open an offer and check the merchant's current terms for your order.`,
      },
      {
        question: 'Does every deal need a promo code?',
        answer: 'No. A card displays a code only when one is listed. Other deals may apply on the merchant site without a code.',
      },
    ],
  })),
];

export function findCouponleoCountryPage(slug: string): CouponleoCountryPage | undefined {
  return couponleoCountryPages.find((page) => page.slug === slug);
}

export function availableCouponleoCountryPages(
  locations: readonly { name?: unknown; couponCount?: unknown; storeCount?: unknown }[],
): CouponleoCountryPage[] {
  return couponleoCountryPages.filter((page) => locations.some((location) => (
    typeof location.name === 'string'
    && location.name.toLowerCase() === page.apiLocation.toLowerCase()
    && Number(location.couponCount) >= COUPONLEO_COUNTRY_PAGE_MIN_COUPONS
    && Number(location.storeCount) >= COUPONLEO_COUNTRY_PAGE_MIN_STORES
  )));
}
