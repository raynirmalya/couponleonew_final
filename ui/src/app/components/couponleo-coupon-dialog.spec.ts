import { TestBed } from '@angular/core/testing';
import { CouponleoCouponDialogComponent } from './couponleo-coupon-dialog.component';
import { CouponleoTelemetryService } from '../services/couponleo-telemetry.service';
import { provideRouter } from '@angular/router';
import { CouponleoApiService } from '../services/couponleo-api.service';

describe('Offer dialog', () => {
  async function render(ctaUrl: string) {
    await TestBed.configureTestingModule({imports:[CouponleoCouponDialogComponent],providers:[provideRouter([]),{provide:CouponleoApiService,useValue:{}},{provide:CouponleoTelemetryService,useValue:{track:()=>{}}}]}).compileComponents();
    const fixture=TestBed.createComponent(CouponleoCouponDialogComponent);
    fixture.componentRef.setInput('coupon',{title:'Sale',subtitle:'Store',description:'Details',code:'',route:'/stores/shop',ctaUrl});
    fixture.detectChanges();return fixture;
  }
  it('opens a merchant offer without presenting an empty copy button',async()=>{
    const f=await render('https://example.com/sale');
    expect(f.nativeElement.querySelector('.couponleo-coupon-dialog__copy')).toBeNull();
    expect(f.nativeElement.querySelector('a[href="https://example.com/sale"]')).not.toBeNull();
    expect(f.nativeElement.textContent).toContain('No coupon code is supplied');
  });
  it('does not use an unsafe merchant URL',async()=>{
    const f=await render('javascript:alert(1)');
    expect(f.nativeElement.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(f.nativeElement.querySelector('a[href="/stores/shop"]')).not.toBeNull();
  });
});
