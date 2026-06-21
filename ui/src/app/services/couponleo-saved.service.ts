import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { CouponleoTelemetryService } from './couponleo-telemetry.service';

export type CouponleoSavedItemKind = 'store' | 'category' | 'deal' | 'coupon';

export interface CouponleoSavedItem {
  id: string;
  kind: CouponleoSavedItemKind;
  title: string;
  subtitle: string;
  description: string;
  route: string;
  code?: string;
  savedAt?: string;
}

const SAVED_STORAGE_KEY = 'couponleo.saved-items';

@Injectable({ providedIn: 'root' })
export class CouponleoSavedService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly browser = isPlatformBrowser(this.platformId);
  private readonly telemetry = inject(CouponleoTelemetryService);
  private readonly itemsState = signal<CouponleoSavedItem[]>([]);

  readonly items = this.itemsState.asReadonly();
  readonly count = computed(() => this.itemsState().length);
  readonly storeCount = computed(() => this.itemsState().filter((item) => item.kind === 'store').length);
  readonly categoryCount = computed(() => this.itemsState().filter((item) => item.kind === 'category').length);
  readonly dealCount = computed(() => this.itemsState().filter((item) => item.kind === 'deal' || item.kind === 'coupon').length);
  readonly offerCount = computed(() => this.dealCount());

  constructor() {
    this.restoreSavedItems();
  }

  has(id: string): boolean {
    return this.itemsState().some((item) => item.id === id);
  }

  toggle(item: CouponleoSavedItem): boolean {
    const nextItems = [...this.itemsState()];
    const existingIndex = nextItems.findIndex((entry) => entry.id === item.id);

    if (existingIndex >= 0) {
      const removedItem = nextItems[existingIndex];
      nextItems.splice(existingIndex, 1);
      this.persistSavedItems(nextItems);
      this.telemetry.trackStructured({
        eventType: 'wishlist',
        eventName: 'remove_saved_item',
        actionLabel: removedItem?.title || item.title,
        targetUrl: removedItem?.route || item.route,
        metadata: {
          id: removedItem?.id || item.id,
          kind: removedItem?.kind || item.kind,
          subtitle: removedItem?.subtitle || item.subtitle,
        },
      });
      return false;
    }

    const normalizedItem = this.normalizeItem({
      ...item,
      savedAt: item.savedAt ?? new Date().toISOString(),
    });
    nextItems.unshift(normalizedItem);
    this.persistSavedItems(nextItems);
    this.telemetry.trackStructured({
      eventType: 'wishlist',
      eventName: 'save_item',
      actionLabel: normalizedItem.title,
      targetUrl: normalizedItem.route,
      metadata: {
        id: normalizedItem.id,
        kind: normalizedItem.kind,
        subtitle: normalizedItem.subtitle,
      },
    });
    return true;
  }

  remove(id: string): void {
    const removedItem = this.itemsState().find((item) => item.id === id);
    this.persistSavedItems(this.itemsState().filter((item) => item.id !== id));

    if (!removedItem) {
      return;
    }

    this.telemetry.trackStructured({
      eventType: 'wishlist',
      eventName: 'remove_saved_item',
      actionLabel: removedItem.title,
      targetUrl: removedItem.route,
      metadata: {
        id: removedItem.id,
        kind: removedItem.kind,
        subtitle: removedItem.subtitle,
      },
    });
  }

  private restoreSavedItems(): void {
    if (!this.browser) {
      return;
    }

    const rawValue = window.localStorage.getItem(SAVED_STORAGE_KEY);
    if (!rawValue) {
      return;
    }

    try {
      const parsed = JSON.parse(rawValue) as CouponleoSavedItem[];
      if (Array.isArray(parsed)) {
        const validItems = parsed
          .filter((item) => this.isValidItem(item))
          .map((item) => this.normalizeItem(item));
        this.itemsState.set(validItems);
        return;
      }
    } catch {
      // Ignore and clear corrupted storage below.
    }

    window.localStorage.removeItem(SAVED_STORAGE_KEY);
  }

  private persistSavedItems(items: CouponleoSavedItem[]): void {
    this.itemsState.set(items);

    if (!this.browser) {
      return;
    }

    window.localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(items));
  }

  private normalizeItem(item: CouponleoSavedItem): CouponleoSavedItem {
    return {
      ...item,
      id: item.id.trim(),
      title: item.title.trim(),
      subtitle: item.subtitle.trim(),
      description: item.description.trim(),
      route: item.route.trim(),
      code: item.code?.trim() || undefined,
      savedAt: item.savedAt?.trim() || undefined,
    };
  }

  private isValidItem(item: CouponleoSavedItem | null | undefined): item is CouponleoSavedItem {
    return Boolean(
      item
      && typeof item.id === 'string'
      && typeof item.kind === 'string'
      && typeof item.title === 'string'
      && typeof item.subtitle === 'string'
      && typeof item.description === 'string'
      && typeof item.route === 'string'
      && (item.savedAt === undefined || typeof item.savedAt === 'string'),
    );
  }
}
