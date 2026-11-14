import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { ApiService } from './api.service';
import { sessionInterceptor } from './session.interceptor';

describe('sessionInterceptor', () => {
  let api: ApiService;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([sessionInterceptor])),
        provideHttpClientTesting()
      ]
    });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    localStorage.setItem('barbershop_token', 'old');
    localStorage.setItem('barbershop_user', JSON.stringify({ id: 1, role: 'admin' }));
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('clears a rejected session, redirects to sign in, and propagates the error', () => {
    const error = vi.fn();
    api.adminBarberSlots(3, '2026-11-02').subscribe({ error });
    http.expectOne(r => r.url === '/api/admin/barbers/3/slots')
      .flush({ error: 'Invalid or expired token' }, { status: 401, statusText: 'Unauthorized' });

    expect(api.loggedIn).toBe(false);
    expect(api.isAdmin).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { session: 'expired' } });
    expect(error).toHaveBeenCalledOnce();
  });

  it('does not clear a newer session when an old request fails', () => {
    api.adminBarberSlots(3, '2026-11-02').subscribe({ error: () => {} });
    localStorage.setItem('barbershop_token', 'new');
    http.expectOne(r => r.url === '/api/admin/barbers/3/slots')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(api.token).toBe('new');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('does not redirect for an unauthenticated login failure', () => {
    api.login('user@example.test', 'wrong').subscribe({ error: () => {} });
    http.expectOne('/api/auth/login')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(api.token).toBe('old');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('does not clear the session for forbidden or non-API requests', () => {
    api.adminBarberSlots(3, '2026-11-02').subscribe({ error: () => {} });
    http.expectOne(r => r.url === '/api/admin/barbers/3/slots')
      .flush({}, { status: 403, statusText: 'Forbidden' });
    TestBed.inject(HttpClient).get('/other', { headers: api.headers() }).subscribe({ error: () => {} });
    http.expectOne('/other').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(api.token).toBe('old');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
