import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ApiService } from '../core/api.service';
import { HomeComponent } from './home.component';
import { MyBookingsComponent } from './my-bookings.component';

describe('HomeComponent add-ons', () => {
  const services = [
    { id: 1, name: 'Precision Haircut', description: '', priceCents: 2500, durationMinutes: 30 },
    { id: 2, name: 'Haircut & Beard', description: '', priceCents: 3000, durationMinutes: 45 },
    { id: 3, name: 'Shape Up', description: '', priceCents: 2000, durationMinutes: 10 }
  ];
  const enhancements = { id: 9, name: 'Enhancements', description: 'Extras', priceCents: 500, durationMinutes: 5, serviceIds: [1, 2] };

  function create(addOns: unknown[]) {
    TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        {
          provide: ApiService,
          useValue: {
            services: () => of(services),
            barbers: () => of([]),
            addOns: () => of(addOns)
          }
        }
      ]
    });
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('lists add-ons with price, time and the services they apply to', () => {
    const fixture = create([enhancements]);
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('ADD-ON SERVICES');
    expect(text).toContain('Enhancements');
    expect(text).toContain('5 min');
    expect(text).toContain('$5.00');
    expect(text).toContain('Available with Precision Haircut and Haircut & Beard');
    expect(text).not.toContain('Available with Precision Haircut and Haircut & Beard and Shape Up');
  });

  it('hides the add-on section when there are none', () => {
    const fixture = create([]);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('ADD-ON SERVICES');
  });
});

describe('MyBookingsComponent add-ons', () => {
  function create(rows: unknown[]) {
    TestBed.configureTestingModule({
      imports: [MyBookingsComponent],
      providers: [{ provide: ApiService, useValue: { myAppointments: () => of(rows) } }]
    });
    const fixture = TestBed.createComponent(MyBookingsComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows add-ons and the total price', () => {
    const el = create([
      { id: 1, service: 'Precision Haircut', barber: 'B', startsAt: '2030-01-07T15:00:00Z', status: 'pending', priceCents: 3000, addOns: ['Enhancements'], breakdown: { service: { name: 'Precision Haircut', priceCents: 2500, durationMinutes: 30 }, addOns: [{ name: 'Enhancements', priceCents: 500, durationMinutes: 5 }], totalCents: 3000, totalMinutes: 35 } }
    ]);
    expect(el.textContent).toContain('+ Enhancements');
    expect(el.textContent).toContain('$30.00');
  });

  it('shows no add-on line when there are none', () => {
    const el = create([
      { id: 2, service: 'Shape Up', barber: 'B', startsAt: '2030-01-07T15:00:00Z', status: 'pending', priceCents: 2000, addOns: [], breakdown: { service: { name: 'Shape Up', priceCents: 2000, durationMinutes: 10 }, addOns: [], totalCents: 2000, totalMinutes: 10 } }
    ]);
    expect(el.textContent).not.toContain('+ ');
  });
});
