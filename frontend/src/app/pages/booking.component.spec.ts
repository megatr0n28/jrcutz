import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { ApiService } from '../core/api.service';
import { BookingComponent } from './booking.component';

describe('BookingComponent add-ons', () => {
  const services = [
    { id: 1, name: 'Precision Haircut', description: '', priceCents: 2500, durationMinutes: 30 },
    { id: 2, name: 'Haircut & Beard', description: '', priceCents: 3000, durationMinutes: 45 },
    { id: 3, name: 'Shape Up', description: '', priceCents: 2000, durationMinutes: 10 }
  ];
  const addOns = [
    { id: 9, name: 'Enhancements', description: '', priceCents: 500, durationMinutes: 5, serviceIds: [1, 2] }
  ];

  let api: Record<string, ReturnType<typeof vi.fn>>;
  let comp: BookingComponent;
  let el: HTMLElement;
  let fixture: ReturnType<typeof TestBed.createComponent<BookingComponent>>;

  beforeEach(() => {
    api = {
      services: vi.fn().mockReturnValue(of(services)),
      addOns: vi.fn().mockReturnValue(of(addOns)),
      barbers: vi.fn().mockReturnValue(of([
        { id: 1, name: 'B', bio: '', specialty: '', imageUrl: '' },
        { id: 2, name: 'C', bio: '', specialty: '', imageUrl: '' }
      ])),
      barberSlots: vi.fn().mockReturnValue(of({ slots: [], timezone: 'UTC' })),
      book: vi.fn().mockReturnValue(of({}))
    };
    TestBed.configureTestingModule({
      imports: [BookingComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: Router, useValue: { navigateByUrl: vi.fn() } }
      ]
    });
    fixture = TestBed.createComponent(BookingComponent);
    comp = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  const choose = (id: number) => { comp.serviceId = id; comp.onServiceChange(); fixture.detectChanges(); };

  it('offers Enhancements only for Precision Haircut and Haircut & Beard', () => {
    choose(1);
    expect(el.textContent).toContain('Enhancements');
    expect(el.textContent).toContain('+5 min');
    choose(2);
    expect(el.querySelector('.addon-option')).not.toBeNull();
    choose(3);
    expect(el.querySelector('.addon-option')).toBeNull();
  });

  it('drops a selected add-on when switching to an ineligible service', () => {
    choose(1);
    comp.toggleAddOn(9);
    expect(comp.addOnIds).toEqual([9]);
    choose(3);
    expect(comp.addOnIds).toEqual([]);
  });

  it('reloads slots with the add-on and books with it', () => {
    comp.barberId = 1; comp.date = '2030-01-07';
    choose(1);
    comp.toggleAddOn(9);
    expect(api['barberSlots']).toHaveBeenLastCalledWith(1, 1, '2030-01-07', [9]);

    comp.selectedSlot = new Date(Date.now() + 86400000).toISOString();
    comp.submit();
    expect(api['book']).toHaveBeenCalledWith(expect.objectContaining({
      serviceId: 1, addOnIds: [9], barberId: 1
    }));
  });
});
