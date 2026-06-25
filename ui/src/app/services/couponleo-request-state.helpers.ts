import { Observable, catchError, defer, map, merge, of, skip, startWith, switchMap } from 'rxjs';

export interface CouponleoRequestState<T> {
  data: T;
  loading: boolean;
}

export function createLoadedState<T>(data: T): CouponleoRequestState<T> {
  return { data, loading: false };
}

export function createLoadingState<T>(data: T): CouponleoRequestState<T> {
  return { data, loading: true };
}

export function withRequestState<T>(source$: Observable<T>, fallback: T): Observable<CouponleoRequestState<T>> {
  return source$.pipe(
    map((data) => createLoadedState(data)),
    startWith(createLoadingState(fallback)),
    catchError(() => of({ data: fallback, loading: false })),
  );
}

export function withHydratedRequestState<T, TRequest>(
  requests$: Observable<TRequest>,
  requestFactory: (request: TRequest) => Observable<T>,
  fallback: T,
  getInitialData?: () => T | undefined,
): Observable<CouponleoRequestState<T>> {
  return defer(() => {
    const initialData = getInitialData?.();
    const requestState$ = (initialData === undefined ? requests$ : requests$.pipe(skip(1))).pipe(
      switchMap((request) => withRequestState(requestFactory(request), fallback)),
    );

    return initialData === undefined
      ? requestState$
      : merge(of(createLoadedState(initialData)), requestState$);
  });
}
