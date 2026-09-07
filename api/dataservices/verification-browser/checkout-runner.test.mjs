import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseMoney, runCheckout } from './checkout-runner.mjs';

test('money parsing rejects ambiguous totals and supports configured decimal separators', () => {
  assert.equal(parseMoney('$1,299.95'), 129995);
  assert.equal(parseMoney('1.299,95 EUR', ','), 129995);
  assert.throws(() => parseMoney('Subtotal $100 Total $90'));
});

test('cart runner distinguishes success, rejection and blocked purchase attempts', async () => {
  const { chromium } = await import(process.env.COUPONLEO_PLAYWRIGHT_MODULE || 'playwright');
  let orders = 0;
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://fixture').pathname;
    if (path === '/payment') { orders += 1; response.end('unexpected'); return; }
    if (request.method === 'POST') { response.end('{}'); return; }
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><html><body>
      <button id="add" onclick="fetch('/cart/add',{method:'POST'})">Add to cart</button>
      <div id="total">$100.00</div><input id="coupon"><button id="apply">Apply coupon</button>
      <button id="purchase">Place order</button><button id="unsafe">Apply offer</button>
      <div id="applied"></div><div id="error" hidden></div>
      <script>
        document.querySelector('#purchase').onclick = () => fetch('/payment',{method:'POST'});
        document.querySelector('#unsafe').onclick = () => fetch('/payment',{method:'POST'});
        document.querySelector('#apply').onclick = async () => {
          await fetch('/cart/apply',{method:'POST'});
          const code=document.querySelector('#coupon').value;
          if(code==='SAVE10') { document.querySelector('#total').textContent='$90.00'; document.querySelector('#applied').textContent=code; }
          else { document.querySelector('#error').hidden=false; document.querySelector('#error').textContent='Code not accepted'; }
        };
      </script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const directory = await mkdtemp(join(tmpdir(), 'couponleo-checkout-test-'));
  const browser = await chromium.launch({ headless: true, ...(process.env.COUPONLEO_CHROME_PATH ? { executablePath: process.env.COUPONLEO_CHROME_PATH } : {}) });
  const candidate = { offerFingerprint: 'fixture-only', offer: { id: 123, storeSlug: 'fixture', type: 'code', code: 'SAVE10' } };
  const plan = { storeSlug: 'fixture', merchantOrigin: origin, productUrl: origin + '/product', cartUrl: origin + '/cart',
    allowedCartPostPaths: ['/cart/add', '/cart/apply'], country: 'United States', currency: 'USD', items: 'Fixture item',
    conditions: 'Synthetic local cart only.', timeoutMs: 1000,
    selectors: { addToCart: '#add', cartTotal: '#total', couponInput: '#coupon', applyCoupon: '#apply', appliedCode: '#applied', couponError: '#error' } };
  try {
    const success = await runCheckout(browser, candidate, plan, join(directory, 'success'), { fixture: true });
    assert.equal(success.status, 'checkout_passed');
    assert.equal(success.attested, false);
    assert.equal(success.cart.sameCart, false, 'A reviewer must confirm unchanged cart settings');
    assert.equal(success.cart.after, '90.00');
    assert((await readFile(join(directory, 'success', 'after.png'))).length > 0);
    const rejected = await runCheckout(browser, { ...candidate, offer: { ...candidate.offer, code: 'BAD' } }, plan, join(directory, 'rejected'), { fixture: true });
    assert.equal(rejected.status, 'checkout_failed');
    const purchase = await runCheckout(browser, candidate, { ...plan, selectors: { ...plan.selectors, applyCoupon: '#purchase' } }, join(directory, 'purchase'), { fixture: true });
    assert.equal(purchase.status, 'inconclusive');
    const blocked = await runCheckout(browser, candidate, { ...plan, selectors: { ...plan.selectors, applyCoupon: '#unsafe' } }, join(directory, 'blocked'), { fixture: true });
    assert.equal(blocked.status, 'inconclusive');
    assert(blocked.blockedRequests.some(request => request.path.endsWith('/payment')));
    assert.equal(orders, 0);
    await assert.rejects(() => runCheckout(browser, candidate, { ...plan, cartUrl: 'https://affiliate.example/track' }, join(directory, 'external'), { fixture: true }));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    // The target was created above by mkdtemp under the system temporary directory.
    await rm(directory, { recursive: true, force: true });
  }
});
