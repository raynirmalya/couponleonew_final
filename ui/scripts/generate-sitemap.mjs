import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const uiRoot = resolve(scriptDirectory, '..');
const dataDirectory = resolve(uiRoot, '..', 'api', 'dataservices', 'data');
const outputPath = resolve(uiRoot, 'public', 'sitemap.xml');

const BASE_URL = 'https://couponleo.com';
const BUILD_DATE = new Date().toISOString().slice(0, 10);
const CATEGORY_MIN_COUPON_COUNT = 25;
const CATEGORY_MIN_STORE_COUNT = 5;
const EXCLUDED_CATEGORY_SLUGS = new Set([
  'coupons',
  'deals',
  'general',
  'other',
  'others',
]);

const STATIC_ROUTES = [
  { pathname: '/', changefreq: 'daily', priority: '1.0' },
  { pathname: '/stores', changefreq: 'daily', priority: '0.95' },
  { pathname: '/categories', changefreq: 'daily', priority: '0.92' },
  { pathname: '/country-deals', changefreq: 'daily', priority: '0.90' },
  { pathname: '/top-deals', changefreq: 'daily', priority: '0.94' },
  { pathname: '/blog', changefreq: 'weekly', priority: '0.72' },
  { pathname: '/about', changefreq: 'monthly', priority: '0.45' },
  { pathname: '/contact', changefreq: 'monthly', priority: '0.50' },
  { pathname: '/help-center', changefreq: 'monthly', priority: '0.42' },
  { pathname: '/privacy-policy', changefreq: 'yearly', priority: '0.20' },
  { pathname: '/terms-of-use', changefreq: 'yearly', priority: '0.20' },
];

function readJson(filename) {
  const filePath = resolve(dataDirectory, filename);
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function absoluteUrl(pathname, query = null) {
  const url = new URL(pathname, BASE_URL);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined && value !== '') {
        url.searchParams.set(key, value);
      }
    }
  }

  return url.toString();
}

function addEntry(entries, pathname, options = {}) {
  const loc = absoluteUrl(pathname, options.query);

  if (entries.has(loc)) {
    return false;
  }

  entries.set(loc, {
    loc,
    lastmod: options.lastmod ?? BUILD_DATE,
    changefreq: options.changefreq ?? 'weekly',
    priority: options.priority ?? '0.60',
  });

  return true;
}

function cleanSlug(value) {
  return String(value ?? '').trim();
}

function shouldIncludeStore(store) {
  const slug = cleanSlug(store?.slug);
  const couponCount = Number(store?.couponCount ?? store?.activeCoupons ?? 0);

  return Boolean(slug) && couponCount > 0;
}

function shouldIncludeCategory(category) {
  const slug = cleanSlug(category?.slug).toLowerCase();
  const couponCount = Number(category?.couponCount ?? 0);
  const storeCount = Number(category?.storeCount ?? 0);

  return (
    Boolean(slug)
    && !EXCLUDED_CATEGORY_SLUGS.has(slug)
    && couponCount >= CATEGORY_MIN_COUPON_COUNT
    && storeCount >= CATEGORY_MIN_STORE_COUNT
  );
}

function shouldIncludeLocation(location) {
  return Boolean(String(location?.name ?? '').trim()) && Number(location?.couponCount ?? 0) > 0;
}

function buildXml(entries) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];

  for (const entry of entries.values()) {
    lines.push('  <url>');
    lines.push(`    <loc>${escapeXml(entry.loc)}</loc>`);
    lines.push(`    <lastmod>${entry.lastmod}</lastmod>`);
    lines.push(`    <changefreq>${entry.changefreq}</changefreq>`);
    lines.push(`    <priority>${entry.priority}</priority>`);
    lines.push('  </url>');
  }

  lines.push('</urlset>', '');
  return lines.join('\n');
}

function writeIfChanged(filePath, content) {
  if (existsSync(filePath) && readFileSync(filePath, 'utf8') === content) {
    return false;
  }

  writeFileSync(filePath, content, 'utf8');
  return true;
}

const stores = readJson('stores-summary.json');
const categories = readJson('categories-summary.json');
const locations = readJson('locations-summary.json');
const entries = new Map();

let staticCount = 0;
let storeCount = 0;
let categoryCount = 0;
let locationCount = 0;

for (const route of STATIC_ROUTES) {
  if (addEntry(entries, route.pathname, route)) {
    staticCount += 1;
  }
}

for (const location of locations) {
  if (!shouldIncludeLocation(location)) {
    continue;
  }

  if (addEntry(entries, '/country-deals', {
    query: { country: String(location.name).trim() },
    changefreq: 'daily',
    priority: '0.80',
  })) {
    locationCount += 1;
  }
}

for (const category of categories) {
  if (!shouldIncludeCategory(category)) {
    continue;
  }

  if (addEntry(entries, `/categories/${encodeURIComponent(cleanSlug(category.slug))}`, {
    changefreq: 'daily',
    priority: '0.78',
  })) {
    categoryCount += 1;
  }
}

for (const store of stores) {
  if (!shouldIncludeStore(store)) {
    continue;
  }

  if (addEntry(entries, `/stores/${encodeURIComponent(cleanSlug(store.slug))}`, {
    changefreq: 'daily',
    priority: '0.64',
  })) {
    storeCount += 1;
  }
}

const xml = buildXml(entries);
const changed = writeIfChanged(outputPath, xml);

console.log(
  [
    `Sitemap ${changed ? 'updated' : 'already current'}.`,
    `Static: ${staticCount}`,
    `Countries: ${locationCount}`,
    `Categories: ${categoryCount}`,
    `Stores: ${storeCount}`,
    `Total URLs: ${entries.size}`,
  ].join(' '),
);
