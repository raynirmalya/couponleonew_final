import { computed, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import ForgotPasswordPage from './forgot-password.page';
import { CouponleoAuthService } from '../services/couponleo-auth.service';

function createAuthMock() {
  const sessionState = signal(null);

  return {
    session: sessionState.asReadonly(),
    isAuthenticated: computed(() => sessionState() !== null),
    signOut: () => undefined,
    errorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Auth error'),
    requestPasswordReset: vi.fn(async (payload: { email: string }) => ({
      email: payload.email,
      message: 'If an account exists for this email, a reset link has been prepared.',
      deliveryMode: 'preview' as const,
      deliveryMessage: 'Password reset link prepared for the local preview flow.',
      expiresAt: '2026-06-17T00:00:00Z',
      resetUrl: 'http://127.0.0.1:4300/forgot-password?email=shopper@example.com&resetToken=token-1',
      resetReady: true,
    })),
    resetPassword: vi.fn(async () => ({
      email: 'shopper@example.com',
      accountStatus: 'active' as const,
      requiresActivation: false,
      message: 'Password updated. You can sign in now.',
    })),
  };
}

async function createFixture(): Promise<{
  fixture: ComponentFixture<ForgotPasswordPage>;
  authMock: ReturnType<typeof createAuthMock>;
}> {
  TestBed.resetTestingModule();
  const authMock = createAuthMock();

  await TestBed.configureTestingModule({
    imports: [ForgotPasswordPage],
    providers: [
      provideRouter([]),
      provideLocationMocks(),
      { provide: CouponleoAuthService, useValue: authMock },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ForgotPasswordPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return {
    fixture,
    authMock,
  };
}

function updateInput(
  fixture: ComponentFixture<ForgotPasswordPage>,
  selector: string,
  value: string,
): void {
  const input = fixture.nativeElement.querySelector(selector) as HTMLInputElement | null;
  expect(input).not.toBeNull();
  input!.value = value;
  input!.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ForgotPasswordPage', () => {
  it('requests a reset link and exposes the local preview action', async () => {
    const { fixture, authMock } = await createFixture();

    updateInput(fixture, 'input[name="email"]', 'shopper@example.com');
    await fixture.whenStable();
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('.couponleo-recovery__form') as HTMLFormElement | null;
    expect(form).not.toBeNull();
    form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await fixture.whenStable();
    fixture.detectChanges();

    expect(authMock.requestPasswordReset).toHaveBeenCalledWith(expect.objectContaining({
      email: 'shopper@example.com',
    }));
    expect(fixture.nativeElement.textContent).toContain('Local reset link ready');
  });
});
