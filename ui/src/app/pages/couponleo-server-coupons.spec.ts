import { describe, it, expect, vi } from 'vitest';
import { load as storeLoad } from './stores/[slug].page';
import { load as categoryLoad } from './categories/[slug].page';

describe('Coupon pages server data', () => {
  it('includes the first coupon page and preserves the market filter', async () => {
    const fetch = vi.fn(async (url: string) => url.includes('/coupons/')
      ? {items:[{slug:'offer'}],total:1,page:1,pageCount:1}
      : {data:{slug:'test-store',name:'Test Store',activeCoupons:1}});
    const result = await storeLoad({params:{slug:'test-store'},req:{url:'/stores/test-store?country=India',headers:{host:'couponleo.com'}},res:{},fetch} as any);
    expect(result.coupons.items).toHaveLength(1);
    const url = new URL(fetch.mock.calls.find(([url]) => url.includes('/coupons/'))![0]);
    expect(url.searchParams.get('location')).toBe('India');
    expect(url.searchParams.get('pageSize')).toBe('12');
  });
  it('does not request coupons for an unknown store', async () => {
    const fetch = vi.fn(async () => ({data:null})); const res={statusCode:200};
    const result = await storeLoad({params:{slug:'missing-test-store'},req:{url:'/stores/missing-test-store',headers:{host:'couponleo.com'}},res,fetch} as any);
    expect(res.statusCode).toBe(200); expect(result.store).toBeNull(); expect(result.coupons.items).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('includes category coupons and requests only six related stores', async () => {
    const fetch=vi.fn(async (url:string) => url.includes('/categories/') ? {data:{slug:'test-fashion',name:'Fashion'}} : {items:[{slug:'offer'}],total:1});
    const result=await categoryLoad({params:{slug:'test-fashion'},req:{url:'/categories/test-fashion',headers:{host:'couponleo.com'}},res:{},fetch} as any);
    expect(result.coupons.items).toHaveLength(1);
    const url=new URL(fetch.mock.calls.find(([url])=>url.includes('/stores?'))![0]);
    expect(url.searchParams.get('category')).toBe('test-fashion'); expect(url.searchParams.get('pageSize')).toBe('6');
  });
});
