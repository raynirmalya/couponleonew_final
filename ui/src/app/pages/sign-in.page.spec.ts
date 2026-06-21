import { computed, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

import SignInPage from './sign-in.page';
import {
  CouponleoAuthService,
  type CouponleoSession,
} from '../services/couponleo-auth.service';

function createAuthMock() {
  const sessionState = signal<CouponleoSession | null>(null);

  return {
    session: sessionState.asReadonly(),
    isAuthenticated: computed(() => sessionState() !== null),
    signOut: () => undefined,
    errorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Auth error'),
    activateAccount: vi.fn(async () => ({
      account: {
        id: 'acct-1',
        fullName: 'CouponLeo Shopper',
        email: 'shopper@example.com',
        provider: 'email' as const,
        status: 'active' as const,
        createdAt: '2026-06-14T00:00:00.000Z',
        updatedAt: '2026-06-14T00:00:00.000Z',
        activatedAt: '2026-06-14T00:00:00.000Z',
        lastSignInAt: null,
      },
      message: 'Account activated. You can sign in now.',
    })),
    signIn: vi.fn(async (payload: { email: string; password: string }) => {
      const session: CouponleoSession = {
        fullName: payload.email,
        email: payload.email,
        provider: 'email',
        signedInAt: '2026-06-14T00:00:00.000Z',
      };
      sessionState.set(session);
      return session;
    }),
    signInWithGoogle: vi.fn(() => {
      const session: CouponleoSession = {
        fullName: 'CouponLeo Shopper',
        email: 'shopper@couponleo.com',
        provider: 'google',
        signedInAt: '2026-06-14T00:00:00.000Z',
      };
      sessionState.set(session);
      return session;
    }),
  };
}

async function createFixture(): Promise<{
  fixture: ComponentFixture<SignInPage>;
  authMock: ReturnType<typeof createAuthMock>;
  router: Router;
}> {
  TestBed.resetTestingModule();
  const authMock = createAuthMock();

  await TestBed.configureTestingModule({
    imports: [SignInPage],
    providers: [
      provideRouter([]),
      provideLocationMocks(),
      { provide: CouponleoAuthService, useValue: authMock },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(SignInPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return {
    fixture,
    authMock,
    router: TestBed.inject(Router),
  };
}

function updateInput(
  fixture: ComponentFixture<SignInPage>,
  selector: string,
  value: string,
): void {
  const input = fixture.nativeElement.querySelector(selector) as HTMLInputElement | null;
  expect(input).not.toBeNull();
  input!.value = value;
  input!.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('SignInPage', () => {
  it('submits the sign-in form and routes to the dashboard', async () => {
    const { fixture, authMock, router } = await createFixture();
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    updateInput(fixture, 'input[name="email"]', 'shopper@example.com');
    updateInput(fixture, 'input[name="password"]', 'secret123');

    await fixture.whenStable();
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('.couponleo-signin__form') as HTMLFormElement | null;
    expect(form).not.toBeNull();
    form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await fixture.whenStable();
    fixture.detectChanges();

    expect(authMock.signIn).toHaveBeenCalledWith(expect.objectContaining({
      email: 'shopper@example.com',
      password: 'secret123',
    }));
    expect(navigateSpy).toHaveBeenCalledWith('/dashboard');
  });
});
