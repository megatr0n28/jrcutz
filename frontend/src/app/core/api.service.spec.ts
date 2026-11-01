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

  afterEach(() => http.verify());

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
