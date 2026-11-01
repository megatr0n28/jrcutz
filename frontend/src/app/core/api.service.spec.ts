import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiService } from './api.service';

describe('ApiService', () => {
  let api: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => { http.verify(); localStorage.clear(); });

  it('changes the password and replaces the stored session', () => {
    localStorage.setItem('barbershop_token', 'old');
    localStorage.setItem('barbershop_user', JSON.stringify({ id: 1, name: 'A', email: 'a@x.com', role: 'customer', mustChangePassword: true }));
    expect(api.mustChangePassword).toBe(true);
    api.changePassword('temp', 'a-brand-new-password').subscribe();
    const req = http.expectOne('/api/auth/change-password');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ currentPassword: 'temp', newPassword: 'a-brand-new-password' });
    expect(req.request.headers.get('Authorization')).toBe('Bearer old');
    req.flush({ token: 'new', user: { id: 1, name: 'A', email: 'a@x.com', role: 'customer', mustChangePassword: false } });
    expect(api.token).toBe('new');
    expect(api.mustChangePassword).toBe(false);
  });

  it('requests slots with a service id', () => {
    api.barberSlots(3, 7, '2030-01-07').subscribe();
    const req = http.expectOne(r => r.url === '/api/barbers/3/slots');
    expect(req.request.params.get('serviceId')).toBe('7');
    expect(req.request.params.get('date')).toBe('2030-01-07');
    req.flush({ date: '2030-01-07', timezone: 'UTC', durationMinutes: 15, slots: [] });
  });

  it('omits serviceId when none is given', () => {
    api.barberSlots(3, null, '2030-01-07').subscribe();
    const req = http.expectOne(r => r.url === '/api/barbers/3/slots');
    expect(req.request.params.has('serviceId')).toBe(false);
    req.flush({ slots: [] });
  });

  it('lists users through the admin endpoint', () => {
    api.adminUsers().subscribe();
    const req = http.expectOne('/api/admin/users');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('resets a user password through the admin endpoint', () => {
    api.resetUserPassword(5).subscribe(r => expect(r.temporaryPassword).toBe('x'));
    const req = http.expectOne('/api/admin/users/5/reset-password');
    expect(req.request.method).toBe('POST');
    req.flush({ temporaryPassword: 'x' });
  });

  it('updates a user role through the admin endpoint', () => {
    api.updateUserRole(5, 'admin').subscribe();
    const req = http.expectOne('/api/admin/users/5');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ role: 'admin' });
    req.flush({});
  });

  it('deletes an appointment through the admin endpoint', () => {
    api.deleteAppointment(12).subscribe();
    const req = http.expectOne('/api/admin/appointments/12');
    expect(req.request.method).toBe('DELETE');
    req.flush({ status: 'deleted' });
  });

  it('saves availability blocks including lunch', () => {
    const blocks = [{
      dayOfWeek: 1, startTime: '09:00', endTime: '17:00', isActive: true,
      lunchStart: '12:00', lunchEnd: '13:00'
    }];
    api.saveBarberAvailability(1, blocks as any).subscribe();
    const req = http.expectOne('/api/admin/barbers/1/availability');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(blocks);
    req.flush({});
  });
});
