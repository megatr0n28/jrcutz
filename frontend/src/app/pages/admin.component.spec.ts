import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ApiService, Appointment } from '../core/api.service';
import { AdminComponent } from './admin.component';

const rows = (): Appointment[] => [
  { id: 1, customer: 'A', startsAt: '2030-01-07T15:00:00Z', status: 'pending' },
  { id: 2, customer: 'B', startsAt: '2030-01-07T16:00:00Z', status: 'confirmed' },
  { id: 3, customer: 'C', startsAt: '2030-01-07T17:00:00Z', status: 'completed' },
  { id: 4, customer: 'D', startsAt: '2030-01-07T18:00:00Z', status: 'cancelled' },
  { id: 5, customer: 'E', startsAt: '2030-01-07T19:00:00Z', status: 'cancelled' }
];

describe('AdminComponent', () => {
  let fixture: ComponentFixture<AdminComponent>;
  let comp: AdminComponent;
  let api: Record<string, ReturnType<typeof vi.fn>>;

  const el = () => fixture.nativeElement as HTMLElement;
  const rowCount = () => el().querySelectorAll('tbody tr').length;

  beforeEach(() => {
    api = Object.fromEntries([
      'adminAppointments', 'updateAppointment', 'deleteAppointment',
      'barbers', 'getBarberAvailability', 'barberSlots', 'saveBarberAvailability'
    ].map(n => [n, vi.fn()]));
    api['adminAppointments'].mockReturnValue(of(rows()));
    api['barbers'].mockReturnValue(of([]));
    TestBed.configureTestingModule({
      imports: [AdminComponent],
      providers: [{ provide: ApiService, useValue: api }]
    });
    fixture = TestBed.createComponent(AdminComponent);
    comp = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.restoreAllMocks());

  it('counts appointments per status, including a total', () => {
    expect(comp.count('all')).toBe(5);
    expect(comp.count('pending')).toBe(1);
    expect(comp.count('confirmed')).toBe(1);
    expect(comp.count('completed')).toBe(1);
    expect(comp.count('cancelled')).toBe(2);
  });

  it('renders five filter cards including Cancelled', () => {
    const labels = Array.from(el().querySelectorAll('.stat-card span')).map(s => s.textContent?.trim());
    expect(labels).toEqual(['Total listed', 'Pending', 'Confirmed', 'Completed', 'Cancelled']);
  });

  it('filters the table when a card is clicked', () => {
    expect(rowCount()).toBe(5);
    (el().querySelectorAll('.stat-card')[4] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(comp.filter).toBe('cancelled');
    expect(rowCount()).toBe(2);
    (el().querySelectorAll('.stat-card')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(rowCount()).toBe(1);
  });

  it('shows Clear filter only while filtered and resets to all', () => {
    expect(el().querySelector('.clear-filter')).toBeNull();
    comp.filter = 'pending';
    fixture.detectChanges();
    const clear = el().querySelector('.clear-filter') as HTMLButtonElement;
    expect(clear.textContent).toContain('Clear filter');
    clear.click();
    fixture.detectChanges();
    expect(comp.filter).toBe('all');
    expect(rowCount()).toBe(5);
  });

  it('offers Delete only on cancelled appointments', () => {
    const deletes = Array.from(el().querySelectorAll('tbody button'))
      .filter(b => b.textContent?.trim() === 'Delete');
    expect(deletes.length).toBe(2);
    comp.filter = 'pending';
    fixture.detectChanges();
    const pendingDeletes = Array.from(el().querySelectorAll('tbody button'))
      .filter(b => b.textContent?.trim() === 'Delete');
    expect(pendingDeletes.length).toBe(0);
  });

  it('deletes after confirmation and reloads', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api['deleteAppointment'].mockReturnValue(of({}));
    comp.remove(4);
    expect(api['deleteAppointment']).toHaveBeenCalledWith(4);
    expect(api['adminAppointments']).toHaveBeenCalledTimes(2);
  });

  it('does nothing when delete is not confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    comp.remove(4);
    expect(api['deleteAppointment']).not.toHaveBeenCalled();
  });

  it('shows the server error when delete fails', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api['deleteAppointment'].mockReturnValue(
      throwError(() => ({ error: { error: 'Only cancelled appointments can be deleted' } })));
    comp.remove(1);
    expect(comp.error).toBe('Only cancelled appointments can be deleted');
  });

  it('updates status after confirmation', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api['updateAppointment'].mockReturnValue(of({}));
    comp.update(1, 'confirmed');
    expect(api['updateAppointment']).toHaveBeenCalledWith(1, 'confirmed');
  });
});
