import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../core/api.service';

@Component({
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="form-page">
      <div class="form-panel">
        <span class="eyebrow">ACCOUNT SECURITY</span>
        <h1>Change your password.</h1>
        @if (api.mustChangePassword) {
          <p class="notice">An administrator reset your password. Choose a new one to continue.</p>
        }
        <form (ngSubmit)="submit()">
          <label>{{ api.mustChangePassword ? 'Temporary password' : 'Current password' }}
            <input name="current" type="password" [(ngModel)]="current"
              autocomplete="current-password" required>
          </label>
          <label>New password (12-72 characters)
            <input name="next" type="password" [(ngModel)]="next"
              autocomplete="new-password" minlength="12" maxlength="72" required>
          </label>
          <label>Confirm new password
            <input name="confirm" type="password" [(ngModel)]="confirm"
              autocomplete="new-password" required>
          </label>
          @if (error) { <p class="error-message">{{ error }}</p> }
          <button class="button button-gold full-width" [disabled]="busy">
            {{ busy ? 'Please wait…' : 'Change password' }}
          </button>
        </form>
      </div>
    </section>
  `
})
export class ChangePasswordComponent {
  api = inject(ApiService);
  private router = inject(Router);

  current = '';
  next = '';
  confirm = '';
  busy = false;
  error = '';

  submit(): void {
    this.error = '';
    if (this.next.length < 12 || this.next.length > 72) {
      this.error = 'New password must be 12-72 characters.';
      return;
    }
    if (this.next !== this.confirm) {
      this.error = 'New passwords do not match.';
      return;
    }
    if (this.next === this.current) {
      this.error = 'New password must differ from the current password.';
      return;
    }
    this.busy = true;
    this.api.changePassword(this.current, this.next).subscribe({
      next: result => {
        this.busy = false;
        this.router.navigateByUrl(
          result.user.role === 'admin' ? '/admin' : '/book'
        );
      },
      error: e => {
        this.busy = false;
        this.error = e.error?.error || 'Unable to change password.';
      }
    });
  }
}
