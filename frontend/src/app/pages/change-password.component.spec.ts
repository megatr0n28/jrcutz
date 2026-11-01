import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiService } from '../core/api.service';
import { ChangePasswordComponent } from './change-password.component';

describe('ChangePasswordComponent', () => {
  let api: { changePassword: ReturnType<typeof vi.fn>; mustChangePassword: boolean };
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };
  let comp: ChangePasswordComponent;

  beforeEach(() => {
    api = { changePassword: vi.fn(), mustChangePassword: true };
    router = { navigateByUrl: vi.fn() };
    TestBed.configureTestingModule({
      imports: [ChangePasswordComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: Router, useValue: router }
      ]
    });
    const fixture = TestBed.createComponent(ChangePasswordComponent);
    comp = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('rejects short, mismatched and unchanged passwords without calling the API', () => {
    comp.current = 'temp'; comp.next = 'short'; comp.confirm = 'short';
    comp.submit();
    expect(comp.error).toContain('12-72');
    comp.next = 'a-brand-new-password'; comp.confirm = 'different-password-1';
    comp.submit();
    expect(comp.error).toContain('do not match');
    comp.current = 'a-brand-new-password'; comp.confirm = 'a-brand-new-password';
    comp.submit();
    expect(comp.error).toContain('differ');
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it('changes the password and navigates by role', () => {
    api.changePassword.mockReturnValue(of({ user: { role: 'admin' } }));
    comp.current = 'temp'; comp.next = 'a-brand-new-password'; comp.confirm = 'a-brand-new-password';
    comp.submit();
    expect(api.changePassword).toHaveBeenCalledWith('temp', 'a-brand-new-password');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/admin');
  });

  it('shows the server error', () => {
    api.changePassword.mockReturnValue(throwError(() => ({ error: { error: 'Current password is incorrect' } })));
    comp.current = 'bad'; comp.next = 'a-brand-new-password'; comp.confirm = 'a-brand-new-password';
    comp.submit();
    expect(comp.error).toBe('Current password is incorrect');
    expect(comp.busy).toBe(false);
  });
});
