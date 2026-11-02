import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiService, Appointment, PriceBreakdown } from './api.service';
import { PriceBreakdownComponent } from './price-breakdown.component';
import { MyBookingsComponent } from '../pages/my-bookings.component';
import { AdminComponent } from '../pages/admin.component';

const withAddOn: PriceBreakdown = {
  service: { name: 'Precision Haircut', priceCents: 2500, durationMinutes: 30 },
  addOns: [{ name: 'Enhancements', priceCents: 500, durationMinutes: 5 }],
  totalCents: 3000,
  totalMinutes: 35
};
const plain: PriceBreakdown = {
  service: { name: 'Shape Up', priceCents: 2000, durationMinutes: 10 },
  addOns: [],
  totalCents: 2000,
  totalMinutes: 10
};

describe('PriceBreakdownComponent', () => {
  function create(breakdown?: PriceBreakdown, configure = true) {
    if (configure) TestBed.configureTestingModule({ imports: [PriceBreakdownComponent] });
    const fixture = TestBed.createComponent(PriceBreakdownComponent);
    fixture.componentInstance.breakdown = breakdown;
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }
  const toggle = (el: HTMLElement) => el.querySelector('button.price-toggle') as HTMLButtonElement;

  it('shows only the total until expanded', () => {
    const { el } = create(withAddOn);
    expect(toggle(el).textContent).toContain('$30.00');
    expect(toggle(el).getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.price-lines')).toBeNull();
  });

  it('expands to service, add-on lines and total, then collapses', () => {
    const { fixture, el } = create(withAddOn);
    toggle(el).click();
    fixture.detectChanges();

    expect(toggle(el).getAttribute('aria-expanded')).toBe('true');
    const rows = Array.from(el.querySelectorAll('.price-lines > div')).map(r => r.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows).toEqual([
      'Precision Haircut30 min$25.00',
      '+ Enhancements5 min$5.00',
      'Total35 min$30.00'
    ]);
    expect(toggle(el).getAttribute('aria-controls')).toBe(el.querySelector('.price-lines')!.id);

    toggle(el).click();
    fixture.detectChanges();
    expect(el.querySelector('.price-lines')).toBeNull();
  });

  it('shows just service and total when there are no add-ons', () => {
    const { fixture, el } = create(plain);
    toggle(el).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.price-lines > div').length).toBe(2);
    expect(el.querySelector('.price-addon')).toBeNull();
  });

  it('shows a dash when the API sent no breakdown', () => {
    const { el } = create(undefined);
    expect(el.querySelector('button')).toBeNull();
    expect(el.textContent).toContain('—');
  });

  it('keeps each instance expanded independently', () => {
    const a = create(withAddOn);
    const b = create(plain, false);
    toggle(a.el).click();
    a.fixture.detectChanges();
    b.fixture.detectChanges();
    expect(a.el.querySelector('.price-lines')).not.toBeNull();
    expect(b.el.querySelector('.price-lines')).toBeNull();
  });
});

describe('price breakdown in the pages', () => {
  const base: Appointment = {
    id: 1, customer: 'Ann', email: 'a@x.com', phone: '', service: 'Precision Haircut',
    barber: 'B', startsAt: '2030-01-07T15:00:00Z', status: 'pending',
    priceCents: 3000, addOns: ['Enhancements'], breakdown: withAddOn
  };

  it('My appointments has an expandable breakdown', () => {
    TestBed.configureTestingModule({
      imports: [MyBookingsComponent],
      providers: [{ provide: ApiService, useValue: { myAppointments: () => of([base]) } }]
    });
    const fixture = TestBed.createComponent(MyBookingsComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('button.price-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.price-lines')!.textContent).toContain('$25.00');
    expect(el.querySelector('.price-lines')!.textContent).toContain('+ Enhancements');
  });

  it('the admin queue has a Price column with the breakdown', () => {
    TestBed.configureTestingModule({
      imports: [AdminComponent],
      providers: [{
        provide: ApiService,
        useValue: {
          adminAppointments: () => of([base, { ...base, id: 2, breakdown: plain, priceCents: 2000, addOns: [] }]),
          barbers: () => of([]),
          user: { id: 1 }
        }
      }]
    });
    const fixture = TestBed.createComponent(AdminComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const headers = Array.from(el.querySelectorAll('thead th')).map(h => h.textContent!.trim());
    expect(headers).toContain('Price');

    const toggles = el.querySelectorAll('tbody button.price-toggle');
    expect(toggles.length).toBe(2);
    expect(toggles[0].textContent).toContain('$30.00');
    expect(toggles[1].textContent).toContain('$20.00');
    (toggles[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.price-lines').length).toBe(1);
  });
});
