import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const uiRoot = resolve(scriptDirectory, '..');
const dataDirectory = resolve(uiRoot, '..', 'api', 'dataservices', 'data');
const publicDirectory = resolve(uiRoot, 'public');
const sitemapIndexPath = resolve(publicDirectory, 'sitemap.xml');
const sitemapDirectory = resolve(publicDirectory, 'sitemaps');

const BASE_URL = 'https://couponleo.com';
const BUILD_DATE = new Date().toISOString().slice(0, 10);
const CATEGORY_MIN_COUPON_COUNT = 25;
const CATEGORY_MIN_STORE_COUNT = 5;
const STORE_SITEMAP_CHUNK_SIZE = 5000;
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

function buildUrlSetXml(entries) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];

  for (const entry of entries) {
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

function buildSitemapIndexXml(sitemaps) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];

  for (const sitemap of sitemaps) {
    lines.push('  <sitemap>');
    lines.push(`    <loc>${escapeXml(sitemap.loc)}</loc>`);
    lines.push(`    <lastmod>${sitemap.lastmod}</lastmod>`);
    lines.push('  </sitemap>');
  }

  lines.push('</sitemapindex>', '');
  return lines.join('\n');
}

function writeIfChanged(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });

  if (existsSync(filePath) && readFileSync(filePath, 'utf8') === content) {
    return false;
  }

  writeFileSync(filePath, content, 'utf8');
  return true;
}

function chunkEntries(entries, chunkSize) {
  const chunks = [];

  for (let index = 0; index < entries.length; index += chunkSize) {
    chunks.push(entries.slice(index, index + chunkSize));
  }

  return chunks;
}

function cleanupStaleSitemaps(expectedFilenames) {
  if (!existsSync(sitemapDirectory)) {
    return;
  }

  for (const entry of readdirSync(sitemapDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.xml')) {
      continue;
    }

    if (!expectedFilenames.has(entry.name)) {
      rmSync(resolve(sitemapDirectory, entry.name));
    }
  }
}

const stores = readJson('stores-summary.json');
const categories = readJson('categories-summary.json');
const locations = readJson('locations-summary.json');
const staticEntries = new Map();
const countryEntries = new Map();
const categoryEntries = new Map();
const storeEntries = new Map();

let staticCount = 0;
let storeCount = 0;
let categoryCount = 0;
let locationCount = 0;

for (const route of STATIC_ROUTES) {
  if (addEntry(staticEntries, route.pathname, route)) {
    staticCount += 1;
  }
}

for (const location of locations) {
  if (!shouldIncludeLocation(location)) {
    continue;
  }

  if (addEntry(countryEntries, '/country-deals', {
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

  if (addEntry(categoryEntries, `/categories/${encodeURIComponent(cleanSlug(category.slug))}`, {
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

  if (addEntry(storeEntries, `/stores/${encodeURIComponent(cleanSlug(store.slug))}`, {
    changefreq: 'daily',
    priority: '0.64',
  })) {
    storeCount += 1;
  }
}

const sitemapFiles = [
  { filename: 'static.xml', entries: [...staticEntries.values()] },
  { filename: 'countries.xml', entries: [...countryEntries.values()] },
  { filename: 'categories.xml', entries: [...categoryEntries.values()] },
];
const storeEntryChunks = chunkEntries([...storeEntries.values()], STORE_SITEMAP_CHUNK_SIZE);

for (const [index, entries] of storeEntryChunks.entries()) {
  sitemapFiles.push({
    filename: storeEntryChunks.length === 1 ? 'stores.xml' : `stores-${index + 1}.xml`,
    entries,
  });
}

const expectedFilenames = new Set(sitemapFiles.map((file) => file.filename));
let updatedSectionCount = 0;

for (const sitemapFile of sitemapFiles) {
  const content = buildUrlSetXml(sitemapFile.entries);
  const filePath = resolve(sitemapDirectory, sitemapFile.filename);

  if (writeIfChanged(filePath, content)) {
    updatedSectionCount += 1;
  }
}

cleanupStaleSitemaps(expectedFilenames);

const sitemapIndexXml = buildSitemapIndexXml(
  sitemapFiles.map((file) => ({
    loc: absoluteUrl(`/sitemaps/${file.filename}`),
    lastmod: BUILD_DATE,
  })),
);
const indexChanged = writeIfChanged(sitemapIndexPath, sitemapIndexXml);

console.log(
  [
    `Sitemap index ${indexChanged ? 'updated' : 'already current'}.`,
    `Sub-sitemaps updated: ${updatedSectionCount}`,
    `Files: ${sitemapFiles.length}`,
    `Static: ${staticCount}`,
    `Countries: ${locationCount}`,
    `Categories: ${categoryCount}`,
    `Stores: ${storeCount}`,
    `Store files: ${storeEntryChunks.length}`,
    `Total URLs: ${staticCount + locationCount + categoryCount + storeCount}`,
  ].join(' '),
);
