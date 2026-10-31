
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService, Barber, ServiceItem } from '../core/api.service';

@Component({
  standalone: true,
  imports: [FormsModule, CurrencyPipe],
  template: `
    <section class="form-page">
      <div class="form-panel booking-panel">
        <span class="eyebrow">MAKE IT YOURS</span>
        <h1>Book your chair.</h1>
        <p>Choose your service, barber, and preferred start time.</p>

        <form (ngSubmit)="submit()">
          <label>Service
            <select name="service" [(ngModel)]="serviceId" required>
              <option [ngValue]="0" disabled>Select a service</option>
              @for (s of services; track s.id) {
                <option [ngValue]="s.id">
                  {{ s.name }} — {{ s.priceCents / 100 | currency:'USD' }}
                  ({{ s.durationMinutes }} min)
                </option>
              }
            </select>
          </label>

          <label>Barber
            <select name="barber" [(ngModel)]="barberId" required>
              <option [ngValue]="0" disabled>Choose your barber</option>
              @for (b of barbers; track b.id) {
                <option [ngValue]="b.id">{{ b.name }} — {{ b.specialty }}</option>
              }
            </select>
          </label>

          <label>Appointment date and time
            <input name="start" type="datetime-local"
              [(ngModel)]="start" [min]="minimum" required>
          </label>

          <label>Notes (optional)
            <textarea name="notes" [(ngModel)]="notes"
              maxlength="500" rows="3"
              placeholder="Anything your barber should know?"></textarea>
          </label>

          <p class="fine-print">
            Your appointment will be marked pending until confirmed.
            Times are interpreted in the browser's local timezone.
          </p>

          @if (error) { <p class="error-message">{{ error }}</p> }
          @if (success) { <p class="success-message">{{ success }}</p> }

          <button class="button button-gold full-width" [disabled]="busy">
            {{ busy ? 'Booking…' : 'Request appointment ↗' }}
          </button>
        </form>
      </div>
    </section>
  `
})
export class BookingComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  services: ServiceItem[] = [];
  barbers: Barber[] = [];
  serviceId = 0;
  barberId = 0;
  start = '';
  notes = '';
  minimum = '';
  busy = false;
  error = '';
  success = '';

  ngOnInit(): void {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    this.minimum = now.toISOString().slice(0, 16);

    this.api.services().subscribe({
      next: v => this.services = v,
      error: () => this.error = 'Could not load services.'
    });
    this.api.barbers().subscribe({
      next: v => this.barbers = v,
      error: () => this.error = 'Could not load barbers.'
    });
  }

  submit(): void {
    if (!this.serviceId || !this.barberId || !this.start) {
      this.error = 'Please select a service, barber, and appointment time.';
      return;
    }

    const localDate = new Date(this.start);
    if (Number.isNaN(localDate.getTime()) || localDate <= new Date()) {
      this.error = 'Choose a future date and time.';
      return;
    }

    this.busy = true;
    this.error = '';
    this.success = '';

    this.api.book({
      serviceId: this.serviceId,
      barberId: this.barberId,
      startsAt: localDate.toISOString(),
      notes: this.notes
    }).subscribe({
      next: () => {
        this.busy = false;
        this.success = 'Appointment requested successfully.';
        setTimeout(() => this.router.navigateByUrl('/my-bookings'), 800);
      },
      error: e => {
        this.busy = false;
        this.error = e.status === 409
          ? 'That barber is already booked for this time. Please choose another.'
          : e.error?.error || 'Could not book this appointment.';
      }
    });
  }
}
