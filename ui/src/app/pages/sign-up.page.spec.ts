import { computed, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import SignUpPage from './sign-up.page';
import { CouponleoAuthService } from '../services/couponleo-auth.service';

function createAuthMock() {
  const sessionState = signal(null);

  return {
    session: sessionState.asReadonly(),
    isAuthenticated: computed(() => sessionState() !== null),
    signOut: () => undefined,
    errorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Auth error'),
    signUp: vi.fn(async (payload: { fullName: string; email: string; password: string }) => ({
      account: {
        id: 'acct-1',
        fullName: payload.fullName,
        email: payload.email,
        provider: 'email' as const,
        status: 'pending_activation' as const,
        createdAt: '2026-06-14T00:00:00.000Z',
        updatedAt: '2026-06-14T00:00:00.000Z',
        activatedAt: null,
        lastSignInAt: null,
      },
      activation: {
        email: payload.email,
        activationToken: 'token-1',
        activationUrl: 'http://127.0.0.1:5173/sign-in?email=shopper@example.com&activationToken=token-1',
        deliveryMode: 'preview' as const,
        deliveryMessage: 'Local activation link ready.',
        expiresAt: '2026-06-17T00:00:00Z',
      },
    })),
    signInWithGoogle: vi.fn(() => ({
      fullName: 'CouponLeo Shopper',
      email: 'shopper@couponleo.com',
      provider: 'google' as const,
      signedInAt: '2026-06-14T00:00:00.000Z',
    })),
  };
}

async function createFixture(): Promise<{
  fixture: ComponentFixture<SignUpPage>;
  authMock: ReturnType<typeof createAuthMock>;
}> {
  TestBed.resetTestingModule();
  const authMock = createAuthMock();

  await TestBed.configureTestingModule({
    imports: [SignUpPage],
    providers: [
      provideRouter([]),
      provideLocationMocks(),
      { provide: CouponleoAuthService, useValue: authMock },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(SignUpPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return {
    fixture,
    authMock,
  };
}

function updateInput(
  fixture: ComponentFixture<SignUpPage>,
  selector: string,
  value: string,
): void {
  const input = fixture.nativeElement.querySelector(selector) as HTMLInputElement | null;
  expect(input).not.toBeNull();
  input!.value = value;
  input!.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('SignUpPage', () => {
  it('clears the password mismatch message once the values match', async () => {
    const { fixture } = await createFixture();

    updateInput(fixture, 'input[name="password"]', 'secret123');
    updateInput(fixture, 'input[name="confirmPassword"]', 'secret12');

    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Password and confirm password must match.');

    updateInput(fixture, 'input[name="confirmPassword"]', 'secret123');

    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Password and confirm password must match.');
  });

  it('requires confirm password and shows activation state after submit', async () => {
    const { fixture, authMock } = await createFixture();

    updateInput(fixture, 'input[name="fullName"]', 'CouponLeo Shopper');
    updateInput(fixture, 'input[name="email"]', 'shopper@example.com');
    updateInput(fixture, 'input[name="password"]', 'secret123');
    updateInput(fixture, 'input[name="confirmPassword"]', 'secret123');

    await fixture.whenStable();
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('.couponleo-signup__form') as HTMLFormElement | null;
    expect(form).not.toBeNull();
    form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await fixture.whenStable();
    fixture.detectChanges();

    expect(authMock.signUp).toHaveBeenCalledWith(expect.objectContaining({
      fullName: 'CouponLeo Shopper',
      email: 'shopper@example.com',
      password: 'secret123',
    }));
    expect(fixture.nativeElement.textContent).toContain('Activate your account before login');
  });
});
