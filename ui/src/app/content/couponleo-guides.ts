export interface CouponleoGuideSection {
  heading: string;
  paragraphs: string[];
  steps?: string[];
}

export interface CouponleoGuide {
  slug: string;
  title: string;
  description: string;
  summary: string;
  sections: CouponleoGuideSection[];
}

export const couponleoGuides: readonly CouponleoGuide[] = [
  {
    slug: 'why-promo-codes-do-not-work',
    title: 'Why is my promo code not working?',
    description: 'Check expiry, minimum spend, eligible items, market restrictions, and code stacking before giving up on a coupon.',
    summary: 'A practical checkout checklist for finding the rule behind a rejected code.',
    sections: [
      {
        heading: 'Start with the exact offer terms',
        paragraphs: [
          'A rejected code usually means one condition does not match the basket. Read the offer details again before trying several similar codes. The store checkout is the final authority on whether a promotion applies.',
        ],
        steps: [
          'Check the expiry date and the market or currency attached to the offer.',
          'Compare the minimum spend with the eligible item subtotal, before shipping and taxes unless the store says otherwise.',
          'Look for exclusions such as sale items, specific brands, gift cards, or subscriptions.',
          'Confirm whether the offer is for new customers, app orders, or a particular account.',
        ],
      },
      {
        heading: 'Enter the code carefully',
        paragraphs: [
          'Copy the full code and remove spaces before or after it. Some stores distinguish letters from similar-looking numbers. Apply the code in the dedicated promotion field, then wait for the order total to update before continuing.',
          'If the checkout says a code has already been used, check whether it is limited to one use per account. If it says the item is ineligible, test the code against an eligible item instead of repeatedly submitting it against the same basket.',
        ],
      },
      {
        heading: 'Check whether promotions can be combined',
        paragraphs: [
          'A store may allow only one code per order, or may exclude coupons from items already in a sale. Compare the final payable total with and without the code. A visible discount badge does not guarantee that adding another code will lower the total.',
        ],
      },
      {
        heading: 'Choose another offer when the rule does not fit',
        paragraphs: [
          'If the offer is expired or the basket cannot meet its terms, return to the store page and compare other current offers. Check the store’s own terms before changing a purchase simply to satisfy a coupon threshold.',
        ],
      },
    ],
  },
  {
    slug: 'compare-coupon-deals',
    title: 'How to compare coupon deals before checkout',
    description: 'Compare percentage discounts, fixed savings, shipping costs, minimum spends, and exclusions using the final order total.',
    summary: 'A simple method for choosing the offer that saves more on the basket you actually want.',
    sections: [
      {
        heading: 'Calculate the discount on eligible items',
        paragraphs: [
          'A percentage offer depends on the price of eligible items. A fixed discount depends on meeting its minimum spend. For an illustrative 100-unit eligible basket, 10% off saves 10 units. A 15-unit fixed discount saves more, provided the basket meets every condition.',
          'Do the calculation again if a product is excluded or already reduced. The advertised percentage may apply to only part of the basket.',
        ],
      },
      {
        heading: 'Add shipping and any threshold effect',
        paragraphs: [
          'Compare the final amount including shipping and other charges shown at checkout. Free shipping can beat a small item discount when delivery is expensive. An offer that requires adding unwanted products to reach a threshold may cost more overall.',
        ],
      },
      {
        heading: 'Check when and where the offer applies',
        paragraphs: [
          'Note the expiry, country, payment method, first-order requirement, and whether another sale can be combined with it. These conditions can change which offer is usable, even when its headline discount looks stronger.',
        ],
      },
      {
        heading: 'Compare the final totals',
        paragraphs: [
          'Keep the basket the same, apply each eligible offer separately, and record the payable total. Use the lower total as the decision point. Review the merchant’s checkout terms before placing the order, since the store controls final eligibility.',
        ],
      },
    ],
  },
];

export function findCouponleoGuide(slug: string): CouponleoGuide | undefined {
  return couponleoGuides.find((guide) => guide.slug === slug);
}
