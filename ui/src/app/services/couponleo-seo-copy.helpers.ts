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

function trimNarrative(value: string | undefined): string {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  const expandedEllipsis = normalized.replace(/…/g, '...');
  if (!expandedEllipsis.endsWith('...')) {
    return normalized;
  }

  const withoutEllipsis = expandedEllipsis.replace(/\.\.\.$/, '').trim();
  const lastSentenceBoundary = withoutEllipsis.lastIndexOf('.');

  if (lastSentenceBoundary >= 40) {
    return withoutEllipsis.slice(0, lastSentenceBoundary + 1).trim();
  }

  return withoutEllipsis;
}

function hasEditorialDepth(value: string | undefined, minWords = 6, minLength = 40): boolean {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return false;
  }

  return normalized.length >= minLength && normalized.split(' ').length >= minWords;
}

function editorialCandidates(
  values: Array<string | null | undefined>,
  minWords = 6,
  minLength = 40,
): string[] {
  return uniqueText(values)
    .map((value) => trimNarrative(value))
    .filter((value) => hasEditorialDepth(value, minWords, minLength) && !isLowValueSeoCopy(value));
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
    /\bis a useful stop for shoppers buying\b/i,
    /\bis worth checking when you want a broader read on the brand's current savings\b/i,
    /\bis a practical category to browse when you want a wider read on today's\b/i,
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
    /\bright now the category spans \d[\d,\s]*/i,
    /\bis worth a look when shoppers\b.*\bwant a clearer picture of today's\b/i,
    /\bis worth a look when\b.*\bbefore they head to\b/i,
    /\bthis page gathers the live deal mix before checkout\b/i,
    /\bworks best when you want to judge today's\b/i,
    /\bis useful when you want a cleaner read on today's\b/i,
    /\buse .* as a quick way to size up today's\b/i,
    /\bbest used when the product theme is clear but the winning merchant is not\b/i,
    /\ba practical way to scan\b.*\bacross competing stores\b/i,
    /\ba practical market view for comparing active brands\b/i,
  ];

  return lowSignalPatterns.some((pattern) => pattern.test(normalized));
}

function countLabel(value: number | undefined, singular: string, plural: string): string {
  const count = Math.max(0, Math.trunc(Number(value ?? 0) || 0));
  return `${count} ${count === 1 ? singular : plural}`;
}

function stableVariant(seed: string, options: string[]): string {
  if (options.length === 0) {
    return '';
  }

  const normalizedSeed = seed.trim().toLowerCase() || 'couponleo';
  let hash = 0;

  for (const character of normalizedSeed) {
    hash = ((hash * 33) + character.charCodeAt(0)) >>> 0;
  }

  return options[hash % options.length] ?? options[0] ?? '';
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
    return 'global shoppers';
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

function titleCaseWords(value: string | undefined): string {
  return String(value ?? '')
    .trim()
    .split(/[\s/_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
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

function storeThemeLabel(store: CouponleoStore | null | undefined): string {
  const categoryLabel = String(store?.category ?? '').trim();
  if (categoryLabel && categoryLabel.toLowerCase() !== 'other') {
    return categoryLabel;
  }

  const categoryHint = String(store?.category_hint ?? '').trim();
  if (categoryHint && !['general', 'other', 'mixed'].includes(categoryHint.toLowerCase())) {
    return categoryHint;
  }

  return '';
}

function storeDisplayLabel(value: string | undefined): string {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  const heuristics: Array<[RegExp, string]> = [
    [/pet|animal/, 'Pet Supplies'],
    [/kitchen|cook|dining/, 'Kitchen Essentials'],
    [/camera|photo|video/, 'Cameras & Creator Gear'],
    [/computer|laptop|tech|device|software|electronic|gadget/, 'Electronics'],
    [/fashion|clothing|footwear|handbag|jewell|beauty|makeup/, 'Fashion & Beauty'],
    [/home|furniture|decor|appliance/, 'Home & Decor'],
    [/auto|car|motor/, 'Auto Accessories'],
    [/toy|game|kids|baby/, 'Gifts & Family'],
    [/travel|hotel|flight/, 'Travel'],
    [/health|medical|body|care/, 'Wellness & Care'],
    [/gift/, 'Gift Ideas'],
  ];

  return heuristics.find(([pattern]) => pattern.test(normalized))?.[1] ?? titleCaseWords(normalized);
}

export function resolveCouponleoStoreCategoryLabel(store: CouponleoStore | null | undefined): string {
  const categoryLabel = String(store?.category ?? '').trim();
  if (categoryLabel && categoryLabel.toLowerCase() !== 'other') {
    return storeDisplayLabel(categoryLabel);
  }

  return storeDisplayLabel(storeThemeLabel(store) || categoryLabel);
}

function shoppingLaneCopy(value: string | undefined): string {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) {
    return 'storewide offers';
  }

  const heuristics: Array<[RegExp, string]> = [
    [/pet|animal/, 'pet supplies'],
    [/kitchen|cook|dining/, 'kitchen essentials'],
    [/camera|photo|video/, 'camera and creator gear'],
    [/computer|laptop|tech|device|software|electronic|gadget/, 'electronics and accessories'],
    [/fashion|clothing|footwear|handbag|jewell|beauty|makeup/, 'fashion, beauty, and accessories'],
    [/home|furniture|decor|appliance/, 'home and decor'],
    [/auto|car|motor/, 'auto accessories and driving essentials'],
    [/toy|game|kids|baby/, 'giftable family buys'],
    [/travel|hotel|flight/, 'travel bookings and extras'],
    [/health|medical|body|care/, 'wellness and personal care'],
    [/gift/, 'gift ideas'],
  ];

  const matched = heuristics.find(([pattern]) => pattern.test(normalized));
  return matched?.[1] ?? normalized;
}

function storePrimaryNarrative(store: CouponleoStore | null | undefined): string {
  if (!store) {
    return '';
  }

  const candidates = editorialCandidates([
    store.description,
    ...(store.seoParagraphs ?? []),
    store.websiteDescription,
    store.websiteMetaDescription,
    store.metaDescription,
    store.headline,
  ]);

  return candidates[0] ?? '';
}

function storeSavingsFocus(store: CouponleoStore | null | undefined): string {
  const themeLabel = storeThemeLabel(store);
  if (!themeLabel) {
    return 'live coupon codes, markdowns, and checkout offers';
  }

  return `${shoppingLaneCopy(themeLabel)} offers and coupon codes`;
}

function storeOfferCount(store: CouponleoStore | null | undefined): number {
  return Math.max(0, Math.trunc(Number(store?.activeCoupons ?? store?.couponCount ?? 0) || 0));
}

function storeContextSeed(store: CouponleoStore | null | undefined, suffix = ''): string {
  return [
    String(store?.name ?? '').trim(),
    String(store?.slug ?? '').trim(),
    String(store?.location ?? '').trim(),
    String(store?.category ?? '').trim(),
    suffix,
  ].join('|');
}

function storeCoverageSentence(store: CouponleoStore | null | undefined, host: string): string {
  const activeOfferCount = storeOfferCount(store);
  const seed = storeContextSeed(store, 'coverage');

  if (activeOfferCount >= 2500) {
    return stableVariant(seed, [
      `With ${countLabel(activeOfferCount, 'live offer', 'live offers')} in play, ${host} looks like more than a one-coupon stop.`,
      `${countLabel(activeOfferCount, 'live offer', 'live offers')} make it easier to tell whether the stronger value is hiding in broad markdowns, stacked codes, or a few standout offers.`,
      `${countLabel(activeOfferCount, 'live offer', 'live offers')} give this store enough visible depth to feel worth a serious look.`,
    ]);
  }

  if (activeOfferCount >= 250) {
    return stableVariant(seed, [
      `${countLabel(activeOfferCount, 'live offer', 'live offers')} are usually enough to show whether the brand is discounting with depth or simply teasing with a few bright hooks.`,
      `The current mix of ${countLabel(activeOfferCount, 'live offer', 'live offers')} gives you a decent read on how much value is really on the table today.`,
      `${countLabel(activeOfferCount, 'live offer', 'live offers')} make it easier to judge whether the better buy sits in coupon codes, markdowns, or short-lived sale pushes.`,
    ]);
  }

  if (activeOfferCount > 0) {
    return stableVariant(seed, [
      `${countLabel(activeOfferCount, 'live offer', 'live offers')} are visible right now, which is enough for a quick sense check before you head to ${host}.`,
      `The live mix is lighter at ${countLabel(activeOfferCount, 'offer', 'offers')}, so this works best as a fast check rather than a long browse.`,
      `${countLabel(activeOfferCount, 'live offer', 'live offers')} still give you a useful reality check on whether there is a genuine saving to follow.`,
    ]);
  }

  return stableVariant(seed, [
    `Even without a live offer showing right now, you still get a cleaner read on the merchant before opening ${host}.`,
    `A quiet deal board is still useful when you want context before waiting for the next stronger discount cycle.`,
    `It can still serve as a quick store brief, even when the live mix is temporarily flat.`,
  ]);
}

function storeMarketSentence(
  store: CouponleoStore | null | undefined,
  selectedCountry: string,
  host: string,
): string {
  const seed = storeContextSeed(store, `market-${selectedCountry}`);

  if (selectedCountry !== 'all') {
    return stableVariant(seed, [
      `In ${selectedCountry}, delivery costs, exclusions, and local promo rules can change the final value faster than the headline saving suggests.`,
      `The market filter matters in ${selectedCountry}, where local pricing rules can decide whether ${host} still feels worth the visit.`,
      `That extra context earns its keep in ${selectedCountry}, especially when shipping thresholds or regional promo limits start reshaping the basket.`,
    ]);
  }

  if (store?.location && store.location.toLowerCase() !== 'global') {
    return stableVariant(seed, [
      `${host} gets more interesting once you remember that shipping rules, stock, or promo eligibility can shift outside ${store.location}.`,
      `The market context matters here because the strongest version of the deal may not travel cleanly outside ${store.location}.`,
      `That location angle helps when the merchant looks active but the final value can still move with shipping thresholds or regional coupon rules.`,
    ]);
  }

  return stableVariant(seed, [
    `The wider view helps you see whether the store is discounting with real intent today or just leaning on one flashy promotion.`,
    `It is a cleaner way to judge the merchant before a single eye-catching deal starts making the decision for you.`,
    `The goal is simple: decide whether the offer mix feels broad enough to reward the click or thin enough to keep comparing.`,
  ]);
}

function storeCategorySentence(store: CouponleoStore | null | undefined, host: string): string {
  const categoryLabel = storeThemeLabel(store);
  const seed = storeContextSeed(store, 'category');

  if (!categoryLabel) {
    return stableVariant(seed, [
      `Stores like ${host} are hardest to judge from one headline offer alone because the real value can sit in a stranger, less neatly labeled promotion.`,
      `A broader mix like this helps when the best saving comes from an unusual promotion rather than a neat category path.`,
      `${host} is better suited to open-ended browsing when the inventory cuts across several shopping intents at once.`,
    ]);
  }

  return stableVariant(seed, [
    `In ${categoryCopy(categoryLabel)}, small shifts in coupon depth, markdown timing, or bundle pricing can change the final value quickly.`,
    `In ${shoppingLaneCopy(categoryLabel)}, the stronger buy often comes from the brand combining live codes with broader sale pressure.`,
    `${host} becomes easier to judge once you can see whether today's ${storeSavingsFocus(store)} feel broad or narrowly promoted.`,
  ]);
}

function storeOpeningSentence(
  store: CouponleoStore | null | undefined,
  selectedCountry: string,
  host: string,
): string {
  const focus = storeSavingsFocus(store);
  const seed = storeContextSeed(store, `opening-${selectedCountry}`);

  if (selectedCountry !== 'all') {
    return stableVariant(seed, [
      `Start here if you want a cleaner read on ${host}'s current mix of ${focus} before local checkout details in ${selectedCountry} start steering the decision.`,
      `${host} is easier to compare once the live mix of ${focus} sits beside other options relevant to shoppers in ${selectedCountry}.`,
      `This is the faster way to judge whether ${host} has real depth in ${focus} before the merchant's own sales pitch starts doing too much of the talking.`,
    ]);
  }

  return stableVariant(seed, [
    `Before you head to ${host}, it helps to see what the current mix of ${focus} actually looks like today.`,
    `If ${store?.name ?? host} is already on the shortlist, this is the faster way to check whether today's ${focus} feel genuinely strong or merely eye-catching.`,
    `${store?.name ?? host} is easier to judge here when you want the savings picture before the merchant starts selling the story itself.`,
  ]);
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

  const candidates = editorialCandidates([
    store.description,
    ...(store.seoParagraphs ?? []),
    store.websiteDescription,
    store.websiteMetaDescription,
    store.metaDescription,
    store.headline,
    fallback,
  ]);

  return candidates[0] ?? fallback.trim();
}

export function resolveCouponleoCategoryDescription(
  category: Pick<CouponleoCategory, 'metaDescription' | 'description' | 'headline' | 'seoParagraphs'> | null | undefined,
  fallback = '',
): string {
  if (!category) {
    return fallback.trim();
  }

  const candidates = editorialCandidates([
    category.description,
    ...(category.seoParagraphs ?? []),
    category.metaDescription,
    category.headline,
    fallback,
  ]);

  return candidates[0] ?? fallback.trim();
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
  const narrative = resolveCouponleoStoreDescription(store);
  const secondSentence = stableVariant(storeContextSeed(store, `fallback-second-${selectedCountry}`), [
    storeCoverageSentence(store, host),
    storeCategorySentence(store, host),
    storeMarketSentence(store, selectedCountry, host),
  ]);

  if (hasEditorialDepth(narrative, 7, 50)) {
    return uniqueText([
      ensureSentence(narrative),
      stableVariant(storeContextSeed(store, `narrative-second-${selectedCountry}`), [
        storeCoverageSentence(store, host),
        storeCategorySentence(store, host),
        storeMarketSentence(store, selectedCountry, host),
      ]),
    ]).slice(0, 2).join(' ');
  }

  return uniqueText([
    ensureSentence(storeOpeningSentence(store, selectedCountry, host)),
    secondSentence,
  ]).slice(0, 2).join(' ');
}

export function buildCouponleoCategoryCardDescription(
  category: Pick<CouponleoCategory, 'name' | 'headline' | 'description' | 'metaDescription'> | null | undefined,
): string {
  if (!category) {
    return '';
  }

  const fallback = String(category.name ?? '').trim().toLowerCase() === 'other'
    ? stableVariant(String(category.name ?? ''), [
        'This is where mixed-basket offers, harder-to-classify discounts, and the odd finds from smaller merchants tend to surface first.',
        'Think of Other as the open shelf: unusual deals, awkwardly labeled promotions, and useful bargains that do not fit neatly elsewhere.',
        'Other rewards shoppers who are willing to browse a little wider, especially when the strongest deal does not belong to a tidy category lane.',
      ])
    : stableVariant(String(category.name ?? ''), [
        `${category.name} is a strong place to compare ${categoryPlanningCopy(category.name)} across several merchants before one store takes over the shortlist.`,
        `When the product is clear but the winning merchant is not, ${category.name} gives you room to compare ${categoryPlanningCopy(category.name)} before clicking deeper.`,
        `${category.name} works best as a side-by-side view of ${categoryPlanningCopy(category.name)}, so the stronger offer mix can earn the next click.`,
      ]);
  const resolved = resolveCouponleoCategoryDescription(category, fallback);
  return hasEditorialDepth(resolved, 6, 36) ? resolved : fallback;
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
  const fallback = String(market).trim().toLowerCase() === 'global'
    ? 'Global gives you the broadest read on where stores, categories, and live offers are showing real depth right now.'
    : `${market} gives you a clearer read on which stores, categories, and live offers are genuinely competitive for shoppers there today.`;
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
  if (!store) return [];
  return [
    `Compare ${store.name} coupon codes and sale offers using the details on each card. An offer can apply only to selected products, customers or order values.`,
    selectedCountry === 'all'
      ? 'Choose your market before using a code. Shipping, currency and promotion eligibility can differ between countries.'
      : `These results are filtered for ${selectedCountry}. Confirm delivery and promotion eligibility on the merchant website.`,
    'An expiry date or an active feed entry does not confirm that a code will work at checkout. Offers without an expiry date need confirmation from the merchant.',
  ];
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

  const categoryLabel = resolveCouponleoStoreCategoryLabel(store);
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
  const storedParagraphs = editorialCandidates(category.seoParagraphs ?? [], 10, 72);
  const lowerName = String(category.name ?? '').trim().toLowerCase();
  const countParagraph = lowerName === 'other'
    ? `${countLabel(liveDealCount, 'live deal', 'live deals')} from ${countLabel(liveStoreCount, 'store', 'stores')} give this category enough range to surface the odd, niche, and mixed-basket deals that disappear in narrower searches.`
    : `${countLabel(liveDealCount, 'live deal', 'live deals')} from ${countLabel(liveStoreCount, 'store', 'stores')} make it easier to see whether this topic is being discounted by one aggressive merchant or across the field.`;
  const intentParagraph = lowerName === 'other'
    ? stableVariant(lowerName, [
        'Other is strongest when you are browsing with open intent and do not want every useful deal forced into a neat shopping lane.',
        'Other becomes especially useful when the best promotion comes from a smaller merchant, an unusual bundle, or a mixed basket that would never dominate a tidier shopping lane.',
        'Other earns its place when discovery matters more than taxonomy and the next strong offer could arrive from almost anywhere in the directory.',
      ])
    : stableVariant(lowerName, [
        `The category earns its keep before one brand has earned the click, because it keeps the full merchant field visible while you compare ${categoryIdeas}.`,
        `You learn more here from the wider field than from any single storefront pitch, especially when several merchants are competing on ${categoryIdeas}.`,
        `The real advantage is seeing how several brands price ${categoryIdeas} at once instead of trusting the first merchant that looks confident.`,
      ]);
  const marketParagraph = context.selectedCountry !== 'all'
    ? stableVariant(`${lowerName}-${context.selectedCountry}`, [
        `This view is already narrowed to ${context.selectedCountry}, which matters once local stock, delivery costs, and regional promo rules begin to change the real value of the same offer.`,
        `Keeping the category focused on ${context.selectedCountry} helps when the final decision depends on what shoppers in that market can actually check out with today.`,
        `${context.selectedCountry} can tell a very different story from the broader global view, so the market filter earns its place here.`,
      ])
    : stableVariant(lowerName, [
        'The broader market view is useful when you want to see where the category feels genuinely active before narrowing the search to one country or one merchant.',
        'Starting broad makes it easier to notice whether the strongest version of the deal is clustered in one market or spread more evenly across the directory.',
        'That wider lens matters because the best merchant for this category does not always look the same once market-specific rules begin to influence checkout.',
      ]);
  const closingParagraph = lowerName === 'other'
    ? stableVariant(lowerName, [
        'Once one merchant starts separating itself from the noise, the smarter next step is a closer merchant read to judge whether the depth is real or only one promotion deep.',
        'When a store finally stands out here, move closer and confirm that the strength carries beyond a single eye-catching offer.',
        'The real value here is knowing when to stop browsing broadly and move into the one store that looks convincingly active.',
      ])
    : stableVariant(lowerName, [
        `Once a merchant starts standing out, move closer and check whether the same pricing pressure carries across the brand or fades after one highlight deal.`,
        `The next smart move is a closer merchant read, where you can see whether one brand's strong first impression holds up once the full offer mix is visible.`,
        `After the category narrows the field, the merchant-level view tells you whether the same brand still deserves the final click.`,
      ]);

  if (storedParagraphs.length > 0) {
    return uniqueText([
      shopperDescription,
      ...storedParagraphs,
      countParagraph,
      marketParagraph,
    ]).slice(0, 5);
  }

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

  const activeOfferCount = storeOfferCount(store);
  const host = store.websiteHost || extractCouponleoWebsiteHost(store.url, store.name);
  const narrative = trimSentenceEnding(storePrimaryNarrative(store));
  const categoryLabel = resolveCouponleoStoreCategoryLabel(store);
  const marketLead = selectedCountry !== 'all'
    ? `for shoppers in ${selectedCountry}`
    : `for ${marketAudienceCopy(store.location)}`;
  const shortNarrative = narrative && narrative.length <= 110 ? narrative : '';
  const couponContext = shortNarrative
    ? shortNarrative
    : categoryLabel && categoryLabel.toLowerCase() !== 'other'
      ? `Check ${store.name} coupon codes and ${categoryCopy(categoryLabel)} deals ${marketLead}`
      : `Check ${store.name} coupon codes and live deals ${marketLead}`;
  const coverage = activeOfferCount > 0
    ? `${countLabel(activeOfferCount, 'live offer', 'live offers')} help you decide whether ${host} deserves the click.`
    : `Use it to judge whether the store is worth opening before the next stronger offer cycle appears.`;

  const preferredMeta = editorialCandidates([
    store.metaDescription,
    store.websiteMetaDescription,
    store.description,
  ], 8, 72)[0];

  if (preferredMeta) {
    return clampMetaDescription(preferredMeta);
  }

  return clampMetaDescription(
    uniqueText([
      `${ensureSentence(couponContext)} ${coverage}`.trim(),
      store.websiteDescription,
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
    ? `for shoppers in ${context.selectedCountry}`
    : 'across CouponLeo markets';
  const comparisonContext = String(category.name ?? '').trim().toLowerCase() === 'other'
    ? `Compare mixed-basket coupon codes and hard-to-classify deals ${marketContext}.`
    : `Compare today's ${category.name} coupon codes, sale offers, and brand discounts ${marketContext}.`;
  const coverageContext = liveDealCount > 0
    ? `${countLabel(liveDealCount, 'live deal', 'live deals')} from ${countLabel(liveStoreCount, 'store', 'stores')} show where the stronger options are emerging before you decide where to buy.`
    : 'Keep the topic in view until a stronger wave of live offers returns.';

  const preferredMeta = editorialCandidates([
    category.metaDescription,
    category.description,
    ...(category.seoParagraphs ?? []),
  ], 8, 72)[0];

  if (preferredMeta) {
    return clampMetaDescription(preferredMeta);
  }

  return clampMetaDescription(
    uniqueText([
      `${comparisonContext} ${coverageContext}`.trim(),
    ])[0] ?? '',
  );
}

export function buildCouponleoStoreFaqItems(
  store: CouponleoStore | null | undefined,
  selectedCountry: string,
): CouponleoSeoFaqItem[] {
  if (!store) return [];
  return [
    { question: `How do I use a ${store.name} coupon?`, answer: 'Open the offer, copy the code if one is supplied, and apply it in the merchant checkout. Check that the total changes before paying.' },
    { question: 'Are all listed offers checkout-tested?', answer: 'No. CouponLeo lists merchant and partner feed offers. Check the expiry, eligible products, minimum spend and customer restrictions with the merchant.' },
    { question: 'What if a coupon does not work?', answer: 'Check the spelling, expiry, market, product exclusions and minimum spend. If the merchant rejects it, try another offer; do not rely on the listed discount until checkout confirms it.' },
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
      answer: `Start with ${category.name} when the buying intent is clear but the merchant is not. Narrow to one brand only after it begins to separate itself on pricing style, coupon depth, or the overall strength of the current offer mix.`,
    },
    {
      question: `Does market selection change ${category.name} deals?`,
      answer: context.selectedCountry === 'all'
        ? `Yes. The broad category view shows where ${category.name} feels active across live markets, and the country filter helps once shipping rules, stock, or coupon eligibility begin to change by region.`
        : `Yes. This view is already narrowed for shoppers in ${context.selectedCountry}, which matters when local stock, delivery costs, or regional promo rules can change the real value of a ${category.name.toLowerCase()} offer.`,
    },
  ];
}
