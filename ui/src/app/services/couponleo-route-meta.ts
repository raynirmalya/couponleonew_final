import { type ActivatedRouteSnapshot } from '@angular/router';
import { type MetaTag, type RouteMeta } from '@analogjs/router';

export interface CouponleoSeoDefinition {
  title: string;
  description: string;
  robots?: string;
  type?: 'website' | 'article' | 'profile';
}

export function createStaticRouteMeta(definition: CouponleoSeoDefinition) {
  return {
    title: definition.title,
    meta: buildSeoMeta(definition),
  } satisfies RouteMeta;
}

export function createDynamicRouteMeta(
  resolver: (route: ActivatedRouteSnapshot) => CouponleoSeoDefinition,
) {
  return {
    title: (route: ActivatedRouteSnapshot) => resolver(route).title,
    meta: (route: ActivatedRouteSnapshot) => buildSeoMeta(resolver(route)),
  } satisfies RouteMeta;
}

export function humanizeSlug(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function buildSeoMeta(definition: CouponleoSeoDefinition): MetaTag[] {
  const type = definition.type ?? 'website';
  const robots = definition.robots ?? 'index,follow';

  return [
    { name: 'description', content: definition.description },
    { name: 'robots', content: robots },
    { property: 'og:title', content: definition.title },
    { property: 'og:description', content: definition.description },
    { property: 'og:type', content: type },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: definition.title },
    { name: 'twitter:description', content: definition.description },
  ];
}
