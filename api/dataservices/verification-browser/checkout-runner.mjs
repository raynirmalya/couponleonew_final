/** Capture checkout evidence for an explicitly configured merchant cart.
 * The runner never publishes a badge. A reviewer must inspect the artifacts
 * and import the result with verify_offers.py. No purchase steps are supported.
 */
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const forbidden = /(?:place[-_]?order|submit[-_]?order|purchase|payment|pay[-_]?now|complete[-_]?checkout|confirm[-_]?order)/i;

export function parseMoney(value, decimalSeparator = '.') {
  const matches = String(value).match(/\d[\d\s.,]*/g) ?? [];
  if (matches.length !== 1) throw new Error('The total selector must contain exactly one amount.');
  const raw = matches[0].trim().replace(/\s/g, '');
  const normalized = decimalSeparator === ',' ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error('Unrecognized money format.');
  return Math.round(Number(normalized) * 100);
}

export async function runCheckout(browser, candidate, plan, output, { fixture = false } = {}) {
  const origin = new URL(plan.merchantOrigin);
  if (origin.username || origin.password || (origin.protocol !== 'https:' && !(fixture && origin.hostname === '127.0.0.1'))) {
    throw new Error('Use an HTTPS merchant origin without credentials.');
  }
  if (!candidate.offer?.code || candidate.offer.type !== 'code' || !candidate.offerFingerprint) throw new Error('A captured code-offer candidate is required.');
  if (plan.storeSlug !== candidate.offer.storeSlug) throw new Error('The merchant plan does not match this offer.');
  for (const name of ['productUrl', 'cartUrl']) {
    const url = new URL(plan[name]);
    if (url.origin !== origin.origin || url.username || url.password || forbidden.test(url.pathname)) throw new Error('Use direct product and cart URLs on the configured merchant origin.');
  }
  for (const name of ['addToCart', 'cartTotal', 'couponInput', 'applyCoupon', 'appliedCode']) {
    if (typeof plan.selectors?.[name] !== 'string' || !plan.selectors[name]) throw new Error('Missing merchant selector: ' + name);
  }
  if (!/^[A-Z]{3}$/.test(plan.currency ?? '') || !plan.country || !plan.conditions || !plan.items) throw new Error('Currency, market, item and eligibility context are required.');
  const allowedWrites = new Set(plan.allowedCartPostPaths ?? []);
  if ([...allowedWrites].some(path => !path.startsWith('/') || forbidden.test(path))) throw new Error('Only explicitly listed cart mutation paths are supported.');
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, locale: plan.locale ?? 'en-US' });
  const page = await context.newPage();
  const blocked = [];
  const report = { schemaVersion: 1, fixture, offerFingerprint: candidate.offerFingerprint, status: 'inconclusive',
    checkedAt: new Date().toISOString(), country: plan.country, conditions: plan.conditions,
    attested: false, reviewer: '', summary: '', blockedRequests: blocked };
  await mkdir(output, { recursive: true, mode: 0o700 });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(request.method());
    const forbiddenRequest = forbidden.test(url.pathname) ||
      (request.isNavigationRequest() && url.origin !== origin.origin) ||
      (write && (url.origin !== origin.origin || request.method() !== 'POST' || !allowedWrites.has(url.pathname)));
    if (forbiddenRequest) {
      // Do not persist query strings, headers, cookies or request bodies.
      blocked.push({ method: request.method(), path: url.origin + url.pathname });
      await route.abort();
    } else await route.continue();
  });
  page.setDefaultTimeout(plan.timeoutMs ?? 10000);
  async function clickCartAction(selector) {
    const element = page.locator(selector);
    const label = ((await element.textContent()) ?? '') + ' ' + ((await element.getAttribute('aria-label')) ?? '');
    if (/place order|pay now|buy now|complete purchase|confirm order|submit order/i.test(label)) throw new Error('Purchase controls are not supported.');
    await element.click();
  }
  try {
    await page.goto(plan.productUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await clickCartAction(plan.selectors.addToCart);
    await page.goto(plan.cartUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    const beforeText = await page.locator(plan.selectors.cartTotal).innerText();
    const before = parseMoney(beforeText, plan.decimalSeparator);
    await page.screenshot({ path: resolve(output, 'before.png') });
    await page.locator(plan.selectors.couponInput).fill(candidate.offer.code);
    await clickCartAction(plan.selectors.applyCoupon);
    const deadline = Date.now() + (plan.timeoutMs ?? 10000);
    let applied = false, errorText = '';
    while (Date.now() < deadline) {
      if (plan.selectors.couponError && await page.locator(plan.selectors.couponError).isVisible()) {
        errorText = (await page.locator(plan.selectors.couponError).innerText()).trim();
        if (errorText) break;
      }
      const code = page.locator(plan.selectors.appliedCode);
      if (await code.isVisible() && (await code.innerText()).includes(candidate.offer.code)) {
        const current = parseMoney(await page.locator(plan.selectors.cartTotal).innerText(), plan.decimalSeparator);
        if (current < before) { applied = true; break; }
      }
      await page.waitForTimeout(200);
    }
    const after = parseMoney(await page.locator(plan.selectors.cartTotal).innerText(), plan.decimalSeparator);
    await page.screenshot({ path: resolve(output, 'after.png') });
    const blockedMerchantWrite = blocked.some(entry => entry.path.startsWith(origin.origin) && entry.method !== 'GET');
    if (applied && before > after && after >= 0 && !blockedMerchantWrite) {
      report.status = 'checkout_passed';
      report.cart = { before: (before / 100).toFixed(2), after: (after / 100).toFixed(2), currency: plan.currency,
        items: plan.items, appliedCode: candidate.offer.code, sameCart: false };
      report.summary = 'Browser observed the code and a lower cart total. Review screenshots, unchanged cart contents and settings before attesting.';
    } else if (errorText && !blockedMerchantWrite) {
      report.status = 'checkout_failed';
      report.summary = 'Merchant displayed a coupon rejection. Review the captured evidence and eligibility conditions.';
    } else report.summary = 'No conclusive result. A timeout, blocked request or unchanged cart total is not proof that the coupon failed.';
  } catch (error) {
    report.summary = 'The configured test could not finish: ' + String(error.message).split('\n')[0].slice(0, 250);
    await page.screenshot({ path: resolve(output, 'inconclusive.png') }).catch(() => {});
  } finally {
    await writeFile(resolve(output, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    for (const file of ['before.png', 'after.png', 'inconclusive.png']) await chmod(resolve(output, file), 0o600).catch(() => {});
    await context.close();
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [candidatePath, planPath, output] = process.argv.slice(2);
  if (!output) throw new Error('Usage: node checkout-runner.mjs candidate.json merchant-plan.json PRIVATE_OUTPUT_DIRECTORY');
  const { chromium } = await import(process.env.COUPONLEO_PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ headless: true, ...(process.env.COUPONLEO_CHROME_PATH ? { executablePath: process.env.COUPONLEO_CHROME_PATH } : {}) });
  try {
    const report = await runCheckout(browser, JSON.parse(await readFile(candidatePath, 'utf8')), JSON.parse(await readFile(planPath, 'utf8')), output);
    console.log(JSON.stringify({ status: report.status, checkedAt: report.checkedAt, requiresHumanReview: true }));
  } finally { await browser.close(); }
}
