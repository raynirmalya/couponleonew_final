import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { CouponleoPaginationComponent } from './couponleo-pagination.component';

async function createFixture(page: number, pageCount: number): Promise<ComponentFixture<CouponleoPaginationComponent>> {
  const fixture = TestBed.createComponent(CouponleoPaginationComponent);

  fixture.componentRef.setInput('page', page);
  fixture.componentRef.setInput('pageCount', pageCount);
  fixture.componentRef.setInput('totalItems', pageCount * 12);
  fixture.componentRef.setInput('itemLabel', 'results');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return fixture;
}

function getVisibleTokens(fixture: ComponentFixture<CouponleoPaginationComponent>): string[] {
  return [...fixture.nativeElement.querySelectorAll('.couponleo-pagination__pages > *')]
    .map((node) => node.textContent?.trim() ?? '')
    .filter(Boolean);
}

function clickPage(fixture: ComponentFixture<CouponleoPaginationComponent>, pageLabel: string): void {
  const button = [...fixture.nativeElement.querySelectorAll('.couponleo-pagination__page')]
    .find((node) => node.textContent?.trim() === pageLabel) as HTMLButtonElement | undefined;

  expect(button).toBeDefined();
  button!.click();
  fixture.detectChanges();
}

describe('CouponleoPaginationComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CouponleoPaginationComponent],
    }).compileComponents();
  });

  it('condenses large page counts into a compact page window', async () => {
    const fixture = await createFixture(1, 30);

    expect(getVisibleTokens(fixture)).toEqual(['1', '2', '3', '4', '5', '...', '30']);

    fixture.componentRef.setInput('page', 15);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(getVisibleTokens(fixture)).toEqual(['1', '...', '14', '15', '16', '...', '30']);

    fixture.componentRef.setInput('page', 29);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(getVisibleTokens(fixture)).toEqual(['1', '...', '26', '27', '28', '29', '30']);
  });

  it('emits the requested page when a visible page button is clicked', async () => {
    const fixture = await createFixture(15, 30);
    let emittedPage: number | undefined;

    fixture.componentInstance.pageChange.subscribe((pageNumber) => {
      emittedPage = pageNumber;
    });

    clickPage(fixture, '16');

    expect(emittedPage).toBe(16);
  });
});
