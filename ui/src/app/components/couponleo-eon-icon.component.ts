import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

function normalizeEonSvg(svg: string): string {
  return svg
    .replaceAll('view-box=', 'viewBox=')
    .replace(/\saria-labelledby="[^"]*"/g, '')
    .replace(/\srole="img"/g, '')
    .replace(/<title[^>]*>.*?<\/title>\s*/gs, '');
}

@Component({
  selector: 'app-couponleo-eon-icon',
  template: `<span [innerHTML]="safeSvg()"></span>`,
  host: {
    class: 'couponleo-eon-icon',
    'aria-hidden': 'true',
  },
})
export class CouponleoEonIconComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly svg = input.required<string>();

  protected readonly safeSvg = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(normalizeEonSvg(this.svg())),
  );
}
