
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService, Barber, ServiceItem, TimeSlot } from '../core/api.service';

@Component({
  standalone: true,
  imports: [FormsModule, CurrencyPipe],
  template: `
    <section class="booking-page">
      <header class="booking-heading">
        <span class="eyebrow">YOUR VISIT, YOUR WAY</span>
        <h1>Make time for a great cut.</h1>
        <p>Choose your service, pick your barber, and request a time that works for you.</p>
      </header>

      <div class="booking-layout">
        <aside class="booking-guide" aria-label="Booking steps">
          <div class="booking-guide-top">
            <span class="eyebrow">THE BOOKING TABLE</span>
            <h2>Three simple steps.</h2>
            <p>Everything you need for your next visit, all in one place.</p>
          </div>

          <ol class="booking-steps">
            <li>
              <span class="booking-step-number">01</span>
              <span><strong>Choose your service</strong><small>Find the right cut for you.</small></span>
            </li>
            <li>
              <span class="booking-step-number">02</span>
              <span><strong>Pick your barber</strong><small>Meet the hands behind the craft.</small></span>
            </li>
            <li>
              <span class="booking-step-number">03</span>
              <span><strong>Set your time</strong><small>Request a date and start time.</small></span>
            </li>
          </ol>

          <p class="booking-guide-note">
            Requests are pending until confirmed by the shop. Times shown are in the shop's local time.
          </p>
        </aside>

        <div class="form-panel booking-panel">
          <div class="booking-panel-heading">
            <span class="eyebrow">RESERVE YOUR CHAIR</span>
            <h2>Plan your appointment.</h2>
            <p>Share a few details and we'll take it from here.</p>
          </div>

          <form (ngSubmit)="submit()">
            <div class="booking-choice">
              <span class="booking-step-number">01</span>
              <div class="booking-choice-content">
                <h3>Your service</h3>
                <p>Choose the service you'd like.</p>
                <label>Service
                  <select name="service" [(ngModel)]="serviceId"
                    (ngModelChange)="loadSlots()" required>
                    <option [ngValue]="0" disabled>Select a service</option>
                    @for (s of services; track s.id) {
                      <option [ngValue]="s.id">
                        {{ s.name }} — {{ s.priceCents / 100 | currency:'USD' }}
                        ({{ s.durationMinutes }} min)
                      </option>
                    }
                  </select>
                </label>
              </div>
            </div>

            <div class="booking-choice">
              <span class="booking-step-number">02</span>
              <div class="booking-choice-content">
                <h3>Your barber</h3>
                <p>Choose who you’d like to see.</p>
                <label>Barber
                  <select name="barber" [(ngModel)]="barberId"
                    (ngModelChange)="loadSlots()" required>
                    <option [ngValue]="0" disabled>Choose your barber</option>
                    @for (b of barbers; track b.id) {
                      <option [ngValue]="b.id">{{ b.name }} — {{ b.specialty }}</option>
                    }
                  </select>
                </label>
              </div>
            </div>

            <div class="booking-choice">
              <span class="booking-step-number">03</span>
              <div class="booking-choice-content">
                <h3>Your date &amp; time</h3>
                <p>Pick a day, then choose an open time.</p>
                <label>Appointment date
                  <input name="date" type="date"
                    [(ngModel)]="date" (ngModelChange)="loadSlots()"
                    [min]="minimum" [max]="maximum" required>
                </label>

                @if (slotsLoading) {
                  <p class="slot-status">Loading available times…</p>
                } @else if (slotsError) {
                  <p class="error-message">{{ slotsError }}</p>
                } @else if (!serviceId || !barberId || !date) {
                  <p class="slot-status">
                    Select a service, barber, and date to see open times.
                  </p>
                } @else if (slots.length === 0) {
                  <p class="slot-status">
                    This barber isn't working on that day. Try another date.
                  </p>
                } @else {
                  <div class="slot-grid" role="radiogroup"
                    aria-label="Available start times">
                    @for (s of slots; track s.startsAt) {
                      <button type="button" class="slot"
                        role="radio"
                        [attr.aria-checked]="selectedSlot === s.startsAt"
                        [class.selected]="selectedSlot === s.startsAt"
                        [disabled]="!s.available"
                        (click)="selectedSlot = s.startsAt">
                        {{ label(s) }}
                      </button>
                    }
                  </div>
                  @if (!hasOpenSlot) {
                    <p class="slot-status">
                      No openings on this day. Try another date.
                    </p>
                  }
                }
              </div>
            </div>

            <label>Notes <span class="optional-label">OPTIONAL</span>
              <textarea name="notes" [(ngModel)]="notes"
                maxlength="500" rows="3"
                placeholder="Anything your barber should know?"></textarea>
            </label>

            <p class="fine-print">
              We'll confirm your appointment as soon as possible.
            </p>

            @if (error) { <p class="error-message">{{ error }}</p> }
            @if (success) { <p class="success-message">{{ success }}</p> }

            <button class="button button-gold full-width" [disabled]="busy">
              {{ busy ? 'Booking…' : 'Request appointment ↗' }}
            </button>
          </form>
        </div>
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
  date = '';
  slots: TimeSlot[] = [];
  selectedSlot = '';
  slotsLoading = false;
  slotsError = '';
  timezone = '';
  notes = '';
  minimum = '';
  maximum = '';
  busy = false;
  error = '';
  success = '';

  get hasOpenSlot(): boolean {
    return this.slots.some(s => s.available);
  }

  ngOnInit(): void {
    const now = new Date();
    this.minimum = this.toDateInput(now);
    const max = new Date(now);
    max.setMonth(max.getMonth() + 3);
    this.maximum = this.toDateInput(max);

    this.api.services().subscribe({
      next: v => this.services = v,
      error: () => this.error = 'Could not load services.'
    });
    this.api.barbers().subscribe({
      next: v => {
        this.barbers = v;
        if (v.length === 1) {
          this.barberId = v[0].id;
          this.loadSlots();
        }
      },
      error: () => this.error = 'Could not load barbers.'
    });
  }

  private toDateInput(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  label(slot: TimeSlot): string {
    const [h, m] = slot.time.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
  }

  loadSlots(): void {
    this.slots = [];
    this.selectedSlot = '';
    this.slotsError = '';

    if (!this.serviceId || !this.barberId || !this.date) return;

    const request = { s: this.serviceId, b: this.barberId, d: this.date };
    this.slotsLoading = true;
    this.api.barberSlots(request.b, request.s, request.d).subscribe({
      next: result => {
        if (!this.isCurrent(request)) return;
        this.slotsLoading = false;
        this.slots = result.slots;
        this.timezone = result.timezone;
      },
      error: e => {
        if (!this.isCurrent(request)) return;
        this.slotsLoading = false;
        this.slotsError = e.error?.error || 'Could not load available times.';
      }
    });
  }

  private isCurrent(r: { s: number; b: number; d: string }): boolean {
    return r.s === this.serviceId && r.b === this.barberId && r.d === this.date;
  }

  submit(): void {
    if (!this.serviceId || !this.barberId || !this.selectedSlot) {
      this.error = 'Please select a service, barber, and appointment time.';
      return;
    }

    const slotDate = new Date(this.selectedSlot);
    if (Number.isNaN(slotDate.getTime()) || slotDate <= new Date()) {
      this.error = 'Choose a future date and time.';
      return;
    }

    this.busy = true;
    this.error = '';
    this.success = '';

    this.api.book({
      serviceId: this.serviceId,
      barberId: this.barberId,
      startsAt: slotDate.toISOString(),
      notes: this.notes
    }).subscribe({
      next: () => {
        this.busy = false;
        this.success = 'Appointment requested successfully.';
        setTimeout(() => this.router.navigateByUrl('/my-bookings'), 800);
      },
      error: e => {
        this.busy = false;
        if (e.status === 409) {
          this.error = 'That time was just taken. Please choose another.';
          this.loadSlots();
        } else {
          this.error = e.error?.error || 'Could not book this appointment.';
        }
      }
    });
  }
}
