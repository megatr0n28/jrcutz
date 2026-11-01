import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { adminGuard, customerGuard, signedInGuard } from './auth.guard';

describe('auth guards', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    });
  });
  afterEach(() => localStorage.clear());

  const run = (guard: typeof customerGuard) =>
    TestBed.runInInjectionContext(() => guard({} as any, {} as any));
  const signIn = (user: object) => {
    localStorage.setItem('barbershop_token', 't');
    localStorage.setItem('barbershop_user', JSON.stringify(user));
  };
  const path = (r: unknown) => TestBed.inject(Router).serializeUrl(r as UrlTree);

  it('sends signed-out visitors to login', () => {
    expect(path(run(customerGuard))).toBe('/login');
    expect(path(run(signedInGuard))).toBe('/login');
  });

  it('redirects users who must change their password', () => {
    signIn({ id: 1, name: 'A', email: 'a@x.com', role: 'admin', mustChangePassword: true });
    expect(path(run(customerGuard))).toBe('/change-password');
    expect(path(run(adminGuard))).toBe('/change-password');
    expect(run(signedInGuard)).toBe(true);
  });

  it('allows normal users through', () => {
    signIn({ id: 1, name: 'A', email: 'a@x.com', role: 'admin' });
    expect(run(customerGuard)).toBe(true);
    expect(run(adminGuard)).toBe(true);
  });
});
