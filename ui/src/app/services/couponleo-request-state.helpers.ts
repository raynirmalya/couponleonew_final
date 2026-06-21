import { Observable, catchError, map, of, startWith } from 'rxjs';

export interface CouponleoRequestState<T> {
  data: T;
  loading: boolean;
}

export function createLoadingState<T>(data: T): CouponleoRequestState<T> {
  return { data, loading: true };
}

export function withRequestState<T>(source$: Observable<T>, fallback: T): Observable<CouponleoRequestState<T>> {
  return source$.pipe(
    map((data) => ({ data, loading: false })),
    startWith(createLoadingState(fallback)),
    catchError(() => of({ data: fallback, loading: false })),
  );
}
