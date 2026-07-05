import { type CouponleoCategory, type CouponleoStore } from './couponleo-api.service';

export interface CouponleoSeoFaqItem {
  answer: string;
  question: string;
}

function uniqueText(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const value of values) {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    results.push(normalized);
  }

  return results;
}

function ensureSentence(value: string | undefined): string {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function trimSentenceEnding(value: string | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
}

function clampMetaDescription(value: string, maxLength = 165): string {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length <= maxLength) {
    return normalized;
  }

  const sliced = normalized.slice(0, maxLength + 1);
  const sentenceBoundary = Math.max(
    sliced.lastIndexOf('. '),
    sliced.lastIndexOf('; '),
    sliced.lastIndexOf(', '),
  );
  const wordBoundary = sliced.lastIndexOf(' ');
  const cutoff = sentenceBoundary > maxLength * 0.55
    ? sentenceBoundary
    : wordBoundary > maxLength * 0.55
      ? wordBoundary
      : maxLength;

  return `${sliced.slice(0, cutoff).replace(/[,\s;:-]+$/, '')}...`;
}

function isLowValueSeoCopy(value: string | undefined): boolean {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return true;
  }

  const lowSignalPatterns = [
    /^\d[\d,\s]*live\s/i,
    /^\d[\d,\s]*(?:active|live)\s(?:coupon|coupons|deal|deals|offer|offers)\b/i,
    /\bhas \d[\d,\s]*(?:active|live)\s(?:coupon|coupons|deal|deals|offer|offers)\b/i,
    /\bis a strong stop for\b.*\band \d[\d,\s]*(?:active|live)\s(?:coupon|coupons|deal|deals|offer|offers)\s(?:are|is)\sactive\b/i,
    /\brefreshed from couponleo/i,
    /\bcouponleo(?:'s)? (?:real )?(?:coupon )?(?:feed|catalog|data)\b/i,
    /\blive offers?\b.*\bacross\b.*\bstores?\b\.?$/i,
    /\blive deals?\b.*\bavailable\b.*\bnow\b/i,
    /\bdeals are live across \d[\d,\s]* stores?\b/i,
    /\boffers ready for shoppers who want better prices\b/i,
    /\bare active in this (?:category|market)\b/i,
    /\bstore with \d[\d,\s]*(?:active|live)?\s*(?:coupon|coupons|deal|deals|offer|offers)\b/i,
    /\bmaking it easier to spot coupon codes, price cuts, and limited-time checkout savings before you buy\b/i,
    /\bfor shoppers who want to compare discounts before visiting\b/i,
  ];

  return lowSignalPatterns.some((pattern) => pattern.test(normalized));
}

function countLabel(value: number | undefined, singular: string, plural: string): string {
  const count = Math.max(0, Math.trunc(Number(value ?? 0) || 0));
  return `${count} ${count === 1 ? singular : plural}`;
}

function categoryCopy(value: string | undefined): string {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.toLowerCase() === 'other') {
    return 'shopping';
  }

  return normalized.toLowerCase();
}

function marketCopy(value: string | undefined): string {
  const normalized = String(value ?? '').trim() || 'Global';
  return normalized.toLowerCase() === 'global' ? 'across global markets' : `in ${normalized}`;
}

function marketAudienceCopy(value: string | undefined): string {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.toLowerCase() === 'global') {
    return 'shoppers comparing options across markets';
  }

  return `shoppers in ${normalized}`;
}

function joinReadableList(values: string[]): string {
  if (values.length === 0) {
    return '';
  }

  if (values.length === 1) {
    return values[0];
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

function topicIdeasForCategory(value: string | undefined): string {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (!normalized || normalized === 'other') {
    return 'the strongest prices, useful coupon codes, and broad shopping deals';
  }

  const heuristics: Array<[RegExp, string]> = [
    [/pet|animal/, 'food, treats, care essentials, and everyday pet supplies'],
    [/kitchen|cook|dining/, 'cookware, prep tools, storage, and everyday kitchen upgrades'],
    [/camera|photo|video/, 'cameras, lenses, accessories, and creator gear'],
    [/computer|laptop|tech|device|software/, 'hardware, accessories, upgrades, and digital tools'],
    [/fashion|clothing|footwear|handbag|jewell|beauty|makeup/, 'new-season styles, accessories, and personal picks'],
    [/home|furniture|decor|appliance/, 'home upgrades, furniture, decor, and practical everyday buys'],
    [/auto|car|motor/, 'parts, accessories, maintenance items, and driving essentials'],
    [/toy|game|kids|baby/, 'gifts, playtime picks, and family-friendly buys'],
    [/travel|hotel|flight/, 'trip planning deals, travel extras, and booking offers'],
    [/health|medical|body|care/, 'wellness essentials, personal care items, and routine replenishment'],
    [/gift/, 'gift ideas, quick wins, and easy-to-send finds'],
  ];

  const matched = heuristics.find(([pattern]) => pattern.test(normalized));
  if (matched) {
    return matched[1];
  }

  return `${normalized} products, brands, and savings styles`;
}

function exampleOfferSentence(store: CouponleoStore | null | undefined): string {
  if (!store?.offerExamples?.length) {
    return '';
  }

  const examples = uniqueText(store.offerExamples).slice(0, 2);
  if (examples.length === 0) {
    return '';
  }

  return `Recent live offers include ${joinReadableList(examples)}.`;
}

function categoryPlanningCopy(value: string | undefined): string {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized || normalized === 'other') {
    return 'mixed-category savings, niche products, and hard-to-classify promotions';
  }

  return topicIdeasForCategory(value);
}

function storePrimaryNarrative(store: CouponleoStore | null | undefined): string {
  if (!store) {
    return '';
  }

  const candidates = uniqueText([
    store.websiteDescription,
    store.websiteMetaDescription,
    store.description,
    store.headline,
  ]);

  return candidates.find((candidate) => !isLowValueSeoCopy(candidate)) ?? '';
}

function storeSavingsFocus(store: CouponleoStore | null | undefined): string {
  const categoryLabel = String(store?.category ?? '').trim();
  if (!categoryLabel || categoryLabel.toLowerCase() === 'other') {
    return 'live coupon codes, markdowns, and checkout offers';
  }

  return `${categoryCopy(categoryLabel)} deals, coupon codes, and sale pricing`;
}

export function extractCouponleoWebsiteHost(url?: string, fallback = ''): string {
  const fallbackValue = fallback.trim();

  if (url?.trim()) {
    try {
      return new URL(url).hostname.replace(/^(www|m|mobile|shop|store)\./i, '');
    } catch {
      // Fall back to the raw store label when the URL is not parseable.
    }
  }

  return fallbackValue.replace(/^(www|m|mobile|shop|store)\./i, '') || 'couponleo.com';
}

export function resolveCouponleoStoreDescription(
  store: CouponleoStore | null | undefined,
  fallback = '',
): string {
  if (!store) {
    return fallback.trim();
  }

  const candidates = uniqueText([
    store.websiteDescription,
    store.websiteMetaDescription,
    store.metaDescription,
    store.description,
    store.headline,
    fallback,
    ...(store.seoParagraphs ?? []),
  ]);

  return candidates.find((candidate) => !isLowValueSeoCopy(candidate)) ?? fallback.trim();
}

export function resolveCouponleoCategoryDescription(
  category: Pick<CouponleoCategory, 'metaDescription' | 'description' | 'headline' | 'seoParagraphs'> | null | undefined,
  fallback = '',
): string {
  if (!category) {
    return fallback.trim();
  }

  const candidates = uniqueText([
    category.metaDescription,
    category.description,
    category.headline,
    fallback,
    ...(category.seoParagraphs ?? []),
  ]);

  return candidates.find((candidate) => !isLowValueSeoCopy(candidate)) ?? fallback.trim();
}

export function buildCouponleoStoreCardDescription(store: CouponleoStore | null | undefined): string {
  return buildCouponleoStoreCardDescriptionForMarket(store, 'all');
}

export function buildCouponleoStoreCardDescriptionForMarket(
  store: CouponleoStore | null | undefined,
  selectedCountry: string,
): string {
  if (!store) {
    return '';
  }

  const host = store.websiteHost || extractCouponleoWebsiteHost(store.url, store.name);
  const marketAudience = selectedCountry !== 'all'
    ? `shoppers in ${selectedCountry}`
    : marketAudienceCopy(store.location);
  const narrative = storePrimaryNarrative(store);
  const fallback = selectedCountry !== 'all'
    ? `${store.name} helps ${marketAudience} assess ${storeSavingsFocus(store)} before heading to ${host}.`
    : `${store.name} gives ${marketAudience} a clearer read on ${storeSavingsFocus(store)} before heading to ${host}.`;

  if (narrative) {
    if (selectedCountry !== 'all') {
      return `${ensureSentence(narrative)} CouponLeo shoppers in ${selectedCountry} can use this page to compare the live savings visible before opening ${host}.`;
    }

    return ensureSentence(narrative);
  }

  return fallback;
}

export function buildCouponleoCategoryCardDescription(
  category: Pick<CouponleoCategory, 'name' | 'headline' | 'description' | 'metaDescription'> | null | undefined,
): string {
  if (!category) {
    return '';
  }

  const fallback = String(category.name ?? '').trim().toLowerCase() === 'other'
    ? 'This broad collection is useful when the best option may come from niche brands, mixed product types, or hard-to-classify promotions.'
    : `${category.name} brings together ${categoryPlanningCopy(category.name)} across multiple stores so you can compare the field before choosing a brand.`;
  return resolveCouponleoCategoryDescription(category, fallback);
}

export function resolveCouponleoLocationSpotlight(
  location: Pick<CouponleoStore, 'location'> | Pick<CouponleoCategory, 'name'> | { name?: string; country?: string; spotlight?: string } | null | undefined,
): string {
  if (!location) {
    return '';
  }

  const market = 'country' in location
    ? (location.country || location.name || 'this market')
    : ('location' in location ? location.location : location.name) || 'this market';
  const fallback = `${market} is a practical market view for comparing active brands, category depth, and current savings before you narrow the search to one merchant.`;
  const candidates = uniqueText([
    'spotlight' in location ? location.spotlight : '',
    fallback,
  ]);

  return candidates.find((candidate) => !isLowValueSeoCopy(candidate)) ?? fallback;
}

export function buildCouponleoStoreSeoParagraphs(
  store: CouponleoStore | null | undefined,
  selectedCountry: string,
): string[] {
  if (!store) {
    return [];
  }

  const host = store.websiteHost || extractCouponleoWebsiteHost(store.url, store.name);
  const merchantDescription = buildCouponleoStoreCardDescriptionForMarket(store, selectedCountry);
  const activeOfferCount = store.activeCoupons || store.couponCount || 0;
  const offerStrategyParagraph = store.category && store.category.toLowerCase() !== 'other'
    ? `${store.name} tends to matter most for shoppers chasing ${categoryPlanningCopy(store.category)}, because the real value often depends on whether today's savings lean toward direct markdowns, coupon codes, or short-run bundle offers.`
    : `${store.name} is easiest to judge when you look past one headline discount and check whether the current mix has real depth across codes, markdowns, and short-run promotions.`;
  const shopperParagraph = selectedCountry !== 'all'
    ? `For shoppers in ${selectedCountry}, the live mix here gives a faster sense of whether ${host} feels competitive in that market, especially when delivery costs, excluded products, or local promo rules can change the final price.`
    : store.location && store.location.toLowerCase() !== 'global'
      ? `${store.name} is especially worth comparing when location matters, because pricing, shipping thresholds, and coupon eligibility can shift once you move outside ${store.location}.`
      : `${store.name} is most useful when you want to know whether the merchant is discounting with real intent today rather than surfacing a single attractive offer without much depth behind it.`;
  const coverageParagraph = activeOfferCount > 0
    ? `${countLabel(activeOfferCount, 'live offer', 'live offers')} are active right now, which makes it easier to compare quick-win coupon codes against broader storewide savings before you open ${host}.`
    : '';
  const exampleSentence = exampleOfferSentence(store);
  const closingParagraph = exampleSentence
    ? `${exampleSentence} That gives you a more concrete feel for how ${host} is discounting right now, from category-specific promotions to checkout-ready offers.`
    : `If the offer mix feels quiet today, it can be smarter to compare another merchant first and return when ${host} is running a stronger savings cycle.`;

  return uniqueText([
    merchantDescription,
    offerStrategyParagraph,
    shopperParagraph,
    coverageParagraph,
    closingParagraph,
  ]).slice(0, 5);
}

export function buildCouponleoStoreKeywordHighlights(store: CouponleoStore | null | undefined): string[] {
  if (!store) {
    return [];
  }

  return buildCouponleoStoreKeywordHighlightsForMarket(store, 'all');
}

export function buildCouponleoStoreKeywordHighlightsForMarket(
  store: CouponleoStore | null | undefined,
  selectedCountry: string,
): string[] {
  if (!store) {
    return [];
  }

  const categoryLabel = String(store.category ?? '').trim();
  const categoryLine = categoryLabel && categoryLabel.toLowerCase() !== 'other'
    ? selectedCountry !== 'all'
      ? `${categoryLabel} deals in ${selectedCountry}`
      : `${categoryLabel} discounts`
    : selectedCountry !== 'all'
      ? `${store.name} offers in ${selectedCountry}`
      : `${store.name} live deals`;

  return uniqueText([
    `${store.name} coupon codes`,
    `${store.name} promo codes`,
    `${store.name} deals`,
    categoryLine,
  ]).slice(0, 4);
}

export function buildCouponleoCategorySeoParagraphs(
  category: CouponleoCategory | null | undefined,
  context: { dealCount: number; selectedCountry: string; storeCount: number },
): string[] {
  if (!category) {
    return [];
  }

  const liveDealCount = context.dealCount || category.couponCount || 0;
  const liveStoreCount = context.storeCount || category.storeCount || 0;
  const categoryIdeas = categoryPlanningCopy(category.name);
  const shopperDescription = buildCouponleoCategoryCardDescription(category);
  const countParagraph = String(category.name ?? '').trim().toLowerCase() === 'other'
    ? `Right now this collection brings together ${countLabel(liveDealCount, 'live deal', 'live deals')} from ${countLabel(liveStoreCount, 'store', 'stores')}, which is useful when the strongest option could still come from a niche merchant or a mixed-category offer.`
    : `Right now ${category.name} brings together ${countLabel(liveDealCount, 'live deal', 'live deals')} from ${countLabel(liveStoreCount, 'store', 'stores')}, giving you enough depth to compare not just one headline discount but the wider offer pressure across this topic.`;
  const intentParagraph = String(category.name ?? '').trim().toLowerCase() === 'other'
    ? 'Other works best when you are browsing with open intent and the best option may come from mixed product types, hard-to-classify promos, or smaller stores that would be easy to miss in a narrower search.'
    : `Shoppers usually browse ${category.name} before they have settled on one brand, which makes this hub useful for comparing ${categoryIdeas}, competing merchants, and the overall quality of current discounts in one place.`;
  const marketParagraph = context.selectedCountry !== 'all'
    ? `The current view is tuned to ${context.selectedCountry}, which is especially helpful when shipping rules, local stock, or coupon eligibility can change from one market to another.`
    : 'The broad market view is useful when you want to see where this category feels genuinely active before you narrow to one country or one merchant.';
  const closingParagraph = String(category.name ?? '').trim().toLowerCase() === 'other'
    ? 'Once a merchant starts standing out from the noise, the next smart move is the store view, where you can check whether that brand has real offer depth or just one standout promotion.'
    : `Once one merchant starts standing out, move into the store view to see whether the same saving style carries across the brand or whether the better value still sits elsewhere in ${category.name}.`;

  return uniqueText([
    shopperDescription,
    intentParagraph,
    countParagraph,
    marketParagraph,
    closingParagraph,
  ]).slice(0, 5);
}

export function buildCouponleoCategoryKeywordHighlights(category: CouponleoCategory | null | undefined): string[] {
  if (!category) {
    return [];
  }

  return buildCouponleoCategoryKeywordHighlightsForMarket(category, {
    selectedCountry: 'all',
    storeCount: category.storeCount || 0,
  });
}

export function buildCouponleoCategoryKeywordHighlightsForMarket(
  category: CouponleoCategory | null | undefined,
  context: { selectedCountry: string; storeCount: number },
): string[] {
  if (!category) {
    return [];
  }

  const categoryName = String(category.name ?? '').trim() || 'Shopping';
  const lowerName = categoryName.toLowerCase();
  const marketLine = context.selectedCountry !== 'all'
    ? `${categoryName} offers in ${context.selectedCountry}`
    : `${categoryName} discounts`;
  const directoryLine = lowerName === 'other'
    ? 'mixed shopping offers'
    : context.selectedCountry !== 'all' && context.storeCount > 0
      ? `top ${lowerName} stores in ${context.selectedCountry}`
      : `top ${lowerName} stores`;

  return uniqueText([
    `${categoryName} coupon codes`,
    `${categoryName} deals`,
    marketLine,
    directoryLine,
  ]).slice(0, 4);
}

export function buildCouponleoStoreMetaDescription(
  store: CouponleoStore | null | undefined,
  selectedCountry: string,
): string {
  if (!store) {
    return '';
  }

  const activeOfferCount = store.activeCoupons || store.couponCount || 0;
  const marketLead = selectedCountry !== 'all'
    ? `for shoppers in ${selectedCountry}`
    : `for ${marketAudienceCopy(store.location)}`;
  const couponContext = store.category && store.category.toLowerCase() !== 'other'
    ? `Compare ${store.name} coupon codes, promo codes, and ${categoryCopy(store.category)} deals ${marketLead}`
    : `Compare ${store.name} coupon codes, promo codes, and live store offers ${marketLead}`;
  const coverage = activeOfferCount > 0
    ? `with ${countLabel(activeOfferCount, 'live offer', 'live offers')} to review before checkout.`
    : 'before you decide whether the current deal mix is worth opening.';

  return clampMetaDescription(
    uniqueText([
      `${couponContext} ${coverage}`.trim(),
      store.websiteMetaDescription,
      store.metaDescription,
    ])[0] ?? '',
  );
}

export function buildCouponleoCategoryMetaDescription(
  category: CouponleoCategory | null | undefined,
  context: { dealCount: number; selectedCountry: string; storeCount: number },
): string {
  if (!category) {
    return '';
  }

  const liveDealCount = context.dealCount || category.couponCount || 0;
  const liveStoreCount = context.storeCount || category.storeCount || 0;
  const marketContext = context.selectedCountry !== 'all'
    ? `in ${context.selectedCountry}`
    : 'across live CouponLeo markets';
  const comparisonContext = `Compare ${category.name} coupon codes, promo offers, and live deals ${marketContext} across ${countLabel(liveStoreCount, 'store', 'stores')} before choosing where to shop.`;
  const coverageContext = liveDealCount > 0
    ? `${countLabel(liveDealCount, 'live deal', 'live deals')} are active right now.`
    : 'Use the category view to compare stores before new offers shift again.';

  return clampMetaDescription(
    uniqueText([
      `${comparisonContext} ${coverageContext}`.trim(),
      category.metaDescription,
      category.description,
    ])[0] ?? '',
  );
}

export function buildCouponleoStoreFaqItems(
  store: CouponleoStore | null | undefined,
  selectedCountry: string,
): CouponleoSeoFaqItem[] {
  if (!store) {
    return [];
  }

  const host = store.websiteHost || extractCouponleoWebsiteHost(store.url, store.name);
  const activeOfferCount = store.activeCoupons || store.couponCount || 0;
  const marketLabel = selectedCountry === 'all'
    ? marketCopy(store.location)
    : `in ${selectedCountry}`;
  const narrative = trimSentenceEnding(storePrimaryNarrative(store));
  const focusSentence = narrative
    ? `${narrative}.`
    : `${store.name} is most useful when you want a quicker read on ${storeSavingsFocus(store)} before checkout.`;

  return [
    {
      question: `What can shoppers usually expect from ${store.name}?`,
      answer: `${focusSentence} CouponLeo adds a clearer view of whether the current offer mix is leaning on direct markdowns, coupon codes, or shorter promotional bursts.`,
    },
    {
      question: selectedCountry === 'all'
        ? `Is ${store.name} worth checking before checkout?`
        : `Is ${store.name} worth checking for shoppers in ${selectedCountry}?`,
      answer: activeOfferCount > 0
        ? `${countLabel(activeOfferCount, 'live offer', 'live offers')} are visible ${marketLabel}, which is enough depth to judge whether ${host} still looks competitive once timing, exclusions, and regional price differences are factored in.`
        : `${host} can still be worth a look ${marketLabel}, but this page is most valuable when fresh offers are active and you can compare more than one savings angle before clicking through.`,
    },
    {
      question: `How should you use this ${store.name} page before buying?`,
      answer: `Start here to compare the strongest live codes, sale pricing, and offer examples. If one promotion stands out, open ${host} only after you know whether the merchant is rewarding quick checkout, category-specific baskets, or wider storewide spend.`,
    },
  ];
}

export function buildCouponleoCategoryFaqItems(
  category: CouponleoCategory | null | undefined,
  context: { dealCount: number; selectedCountry: string; storeCount: number },
): CouponleoSeoFaqItem[] {
  if (!category) {
    return [];
  }

  const liveDealCount = context.dealCount || category.couponCount || 0;
  const liveStoreCount = context.storeCount || category.storeCount || 0;
  const categoryIdeas = categoryPlanningCopy(category.name);
  const marketLabel = context.selectedCountry === 'all'
    ? 'across live markets'
    : `for shoppers in ${context.selectedCountry}`;

  return [
    {
      question: `Why compare ${category.name} deals on CouponLeo first?`,
      answer: `${countLabel(liveDealCount, 'live deal', 'live deals')} from ${countLabel(liveStoreCount, 'store', 'stores')} make it easier to compare ${categoryIdeas} in one place instead of guessing which merchant is actually active today.`,
    },
    {
      question: `Should shoppers start with ${category.name} or jump straight to one store?`,
      answer: `Start with ${category.name} when the buying intent is clear but the merchant is not. Move into a store page only after one brand begins to separate itself on pricing style, coupon depth, or the overall strength of the current offer mix.`,
    },
    {
      question: `Does market selection change ${category.name} deals?`,
      answer: context.selectedCountry === 'all'
        ? `Yes. The broad category view shows where ${category.name} feels active across live markets, and the country filter helps once shipping rules, stock, or coupon eligibility begin to change by region.`
        : `Yes. This view is already narrowed for shoppers in ${context.selectedCountry}, which matters when local stock, delivery costs, or regional promo rules can change the real value of a ${category.name.toLowerCase()} offer.`,
    },
  ];
}
