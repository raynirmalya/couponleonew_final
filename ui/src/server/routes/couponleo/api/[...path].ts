import { defineEventHandler, getRequestURL, proxyRequest } from 'h3';

function couponleoApiOrigin(): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const protocol = env['COUPONLEO_API_PROTOCOL'] || 'http';
  const host = env['COUPONLEO_API_HOST'] || '127.0.0.1';
  const port = env['COUPONLEO_API_PORT'] || '5000';

  return `${protocol}://${host}:${port}`;
}

export default defineEventHandler((event) => {
  const requestUrl = getRequestURL(event);
  const upstreamUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, couponleoApiOrigin());

  return proxyRequest(event, upstreamUrl.toString());
});
