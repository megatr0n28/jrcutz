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
        <span class="eyebrow">WELCOME TO JR CUTZ</span>
        <h1>{{ register ? 'Join the club.' : 'Good to see you.' }}</h1>
        <p>Manage your appointments and make time for your next cut.</p>

        <div class="form-tabs">
          <button [class.active]="!register" (click)="register=false">Sign in</button>
          <button [class.active]="register" (click)="register=true">Create account</button>
        </div>

        <form (ngSubmit)="submit()">
          @if (register) {
            <label>Full name
              <input name="name" [(ngModel)]="name" required minlength="2">
            </label>
            <label>Phone
              <input name="phone" [(ngModel)]="phone" autocomplete="tel">
            </label>
          }
          <label>Email address
            <input name="email" type="email" [(ngModel)]="email"
              autocomplete="email" required>
          </label>
          <label>Password
            <input name="password" type="password" [(ngModel)]="password"
              [attr.autocomplete]="register ? 'new-password' : 'current-password'"
              [minlength]="register ? 12 : 1" required>
          </label>
          @if (error) { <p class="error-message">{{ error }}</p> }
          <button class="button button-gold full-width" [disabled]="busy">
            {{ busy ? 'Please wait…' : register ? 'Create account' : 'Sign in' }}
          </button>
        </form>
        <p class="fine-print">Your account is protected by the barbershop API.</p>
      </div>
    </section>
  `
})
export class LoginComponent {
  private api = inject(ApiService);
  private router = inject(Router);

  register = false;
  busy = false;
  name = '';
  phone = '';
  email = '';
  password = '';
  error = '';

  submit(): void {
    this.busy = true;
    this.error = '';

    const request = this.register
      ? this.api.register(this.name, this.email, this.phone, this.password)
      : this.api.login(this.email, this.password);

    request.subscribe({
      next: result => {
        this.busy = false;
        this.router.navigateByUrl(
          result.user.mustChangePassword ? '/change-password'
            : result.user.role === 'admin' ? '/admin' : '/book'
        );
      },
      error: e => {
        this.busy = false;
        this.error = e.error?.error || 'Unable to sign in. Please try again.';
      }
    });
  }
}
