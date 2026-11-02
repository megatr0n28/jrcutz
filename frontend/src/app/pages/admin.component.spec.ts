import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ApiService, Appointment } from '../core/api.service';
import { AdminComponent } from './admin.component';

const rows = (): Appointment[] => [
  { id: 1, customer: 'A', phone: '(555) 987-6543', startsAt: '2030-01-07T15:00:00Z', status: 'pending' },
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
      'adminAppointments', 'adminUsers', 'updateUserRole', 'resetUserPassword', 'updateAppointment', 'deleteAppointment',
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

  it('shows a tap-to-call phone menu in the appointment queue', () => {
    const trigger = el().querySelector('tbody .phone-trigger') as HTMLButtonElement;
    expect(trigger.textContent?.trim()).toBe('(555) 987-6543');
    trigger.click();
    fixture.detectChanges();
    expect(el().querySelector('tbody .phone-call')?.getAttribute('href')).toBe('tel:5559876543');
    expect(el().querySelector('tbody .phone-text')?.getAttribute('href')).toBe('sms:5559876543');
  });

  it('shows add-ons next to the service name', () => {
    const withAddOn = [{ id: 7, customer: 'C', email: 'c@x.com', phone: '', service: 'Precision Haircut', addOns: ['Enhancements'], barber: 'B', startsAt: '2030-01-07T15:00:00Z', status: 'pending' }];
    api['adminAppointments'].mockReturnValue(of(withAddOn));
    comp.ngOnInit();
    fixture.detectChanges();
    expect(el().textContent).toContain('Precision Haircut + Enhancements');
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

  describe('users', () => {
    const users = [
      { id: 1, name: 'Ann Lee', email: 'ann@x.com', phone: '555-123-0001', role: 'customer', createdAt: '2030-01-01T00:00:00Z', appointments: 2 },
      { id: 2, name: 'Bob Ray', email: 'bob@x.com', phone: '555-123-0002', role: 'admin', createdAt: '2030-01-02T00:00:00Z', appointments: 0 }
    ];

    beforeEach(() => api['adminUsers'].mockReturnValue(of(users)));

    it('does not load users until requested', () => {
      expect(api['adminUsers']).not.toHaveBeenCalled();
      expect(el().querySelectorAll('.user-search').length).toBe(0);
    });

    it('loads and lists users when opened', () => {
      comp.toggleUsers();
      fixture.detectChanges();
      expect(api['adminUsers']).toHaveBeenCalledTimes(1);
      const names = Array.from(el().querySelectorAll('#users-heading ~ * , .user-search ~ .table-wrap tbody tr td:first-child'))
        .map(c => c.textContent?.trim());
      expect(names).toContain('Ann Lee');
      expect(names).toContain('Bob Ray');
    });

    it('filters users by name, email or phone', () => {
      comp.toggleUsers();
      comp.userQuery = 'BOB';
      expect(comp.filteredUsers.map(u => u.id)).toEqual([2]);
      comp.userQuery = '0001';
      expect(comp.filteredUsers.map(u => u.id)).toEqual([1]);
      comp.userQuery = '';
      expect(comp.filteredUsers.length).toBe(2);
    });

    it('promotes a customer to admin after confirmation and reloads', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      api['updateUserRole'].mockReturnValue(of({}));
      comp.toggleUsers();
      comp.setRole(users[0] as any, 'admin');
      expect(api['updateUserRole']).toHaveBeenCalledWith(1, 'admin');
      expect(api['adminUsers']).toHaveBeenCalledTimes(2);
    });

    it('does not change the role when not confirmed', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      comp.setRole(users[1] as any, 'customer');
      expect(api['updateUserRole']).not.toHaveBeenCalled();
    });

    it('shows the server error when a role change fails', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      api['updateUserRole'].mockReturnValue(
        throwError(() => ({ error: { error: 'You cannot change your own role' } })));
      comp.setRole(users[1] as any, 'customer');
      expect(comp.usersError).toBe('You cannot change your own role');
    });

    it('labels the action by current role', () => {
      comp.toggleUsers();
      fixture.detectChanges();
      const labels = Array.from(el().querySelectorAll('.user-search ~ .table-wrap .action-link'))
        .map(b => b.textContent?.trim());
      expect(labels).toEqual(['Reset password', 'Make admin', 'Reset password', 'Remove admin']);
    });

    it('resets a password after confirmation and shows it once', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      api['resetUserPassword'].mockReturnValue(of({ temporaryPassword: 'AbCd2345EfGh6789' }));
      comp.toggleUsers();
      comp.resetPassword(users[0] as any);
      fixture.detectChanges();
      expect(api['resetUserPassword']).toHaveBeenCalledWith(1);
      expect(comp.tempPassword).toEqual({ name: 'Ann Lee', password: 'AbCd2345EfGh6789' });
      expect(el().querySelector('.temp-password code')?.textContent).toBe('AbCd2345EfGh6789');
      comp.tempPassword = null;
      fixture.detectChanges();
      expect(el().querySelector('.temp-password')).toBeNull();
    });

    it('does not reset when not confirmed', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      comp.resetPassword(users[0] as any);
      expect(api['resetUserPassword']).not.toHaveBeenCalled();
      expect(comp.tempPassword).toBeNull();
    });

    it('shows an error when the reset fails', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      api['resetUserPassword'].mockReturnValue(throwError(() => ({ error: { error: 'User not found' } })));
      comp.resetPassword(users[0] as any);
      expect(comp.usersError).toBe('User not found');
      expect(comp.tempPassword).toBeNull();
    });

    it('uses separate Email and Phone columns', () => {
      comp.toggleUsers();
      fixture.detectChanges();
      const heads = Array.from(el().querySelectorAll('.user-search ~ .table-wrap th')).map(h => h.textContent?.trim());
      expect(heads).toEqual(['Name', 'Email', 'Phone', 'Role', 'Appointments', 'Joined', 'Actions']);
      const cells = el().querySelectorAll('.user-search ~ .table-wrap tbody tr:first-child td');
      expect(cells[1].textContent?.trim()).toBe('ann@x.com');
      expect(cells[2].querySelector('.phone-trigger')?.textContent?.trim()).toBe('555-123-0001');
    });

    it('shows tap-to-call phone menus for each user', () => {
      comp.toggleUsers();
      fixture.detectChanges();
      const phones = Array.from(el().querySelectorAll('.user-search ~ .table-wrap .phone-trigger'))
        .map(b => b.textContent?.trim());
      expect(phones).toEqual(['555-123-0001', '555-123-0002']);
    });

    it('hides the list again and shows load errors', () => {
      comp.toggleUsers();
      comp.toggleUsers();
      expect(comp.showUsers).toBe(false);
      api['adminUsers'].mockReturnValue(throwError(() => ({ error: { error: 'nope' } })));
      comp.loadUsers();
      expect(comp.usersError).toBe('nope');
    });
  });
});
