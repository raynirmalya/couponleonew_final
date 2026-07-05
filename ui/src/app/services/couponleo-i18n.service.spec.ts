import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CouponleoI18nService } from './couponleo-i18n.service';
import { CouponleoLocaleService } from './couponleo-locale.service';

describe('CouponleoI18nService', () => {
  beforeEach(() => {
    const locale = signal('it-IT');
    const direction = signal<'ltr' | 'rtl'>('ltr');
    const languageTag = signal('it');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        CouponleoI18nService,
        {
          provide: CouponleoLocaleService,
          useValue: {
            locale: locale.asReadonly(),
            direction: direction.asReadonly(),
            languageTag: languageTag.asReadonly(),
          },
        },
      ],
    });
  });

  it('translates english fallback keys through the phrase catalog', () => {
    const service = TestBed.inject(CouponleoI18nService);

    expect(service.t('footer.press')).toBe('Stampa');
  });

  it('localizes static seo phrases for italian routes', () => {
    const service = TestBed.inject(CouponleoI18nService);

    expect(service.localizeSeo(
      '/sign-in',
      'Sign In | CouponLeo',
      'Sign in to CouponLeo to continue with saved deals, wishlist items, and member-only offer flows.',
    )).toEqual({
      title: 'Accedi | CouponLeo',
      description: 'Accedi a CouponLeo per continuare con offerte salvate, elementi della wishlist e vantaggi riservati ai membri.',
    });
  });
});
