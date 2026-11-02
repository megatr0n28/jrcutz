import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService, Appointment } from '../core/api.service';
import { PriceBreakdownComponent } from '../core/price-breakdown.component';

@Component({
  standalone: true,
  imports: [DatePipe, PriceBreakdownComponent],
  template: `
    <section class="dashboard-page">
      <span class="eyebrow">YOUR VISITS</span>
      <h1>My appointments.</h1>
      <p>Keep track of upcoming cuts and past visits.</p>

      @if (message) { <p class="notice">{{ message }}</p> }

      <div class="appointment-list">
        @for (a of appointments; track a.id) {
          <article class="appointment-card">
            <div>
              <span class="eyebrow">BOOKING #{{ a.id }}</span>
              <h3>{{ a.service }}</h3>
              @if (a.addOns?.length) {
                <p>+ {{ a.addOns!.join(', ') }}</p>
              }
              <p>With {{ a.barber }}</p>
              <p>{{ a.startsAt | date:'EEE, MMM d, y · h:mm a' }}</p>
            </div>
            <div class="appointment-side">
              <app-price-breakdown [breakdown]="a.breakdown" />
              <span class="status">{{ a.status }}</span>
              @if (a.status === 'pending' || a.status === 'confirmed') {
                <button class="button button-outline" (click)="cancel(a.id)">
                  Cancel
                </button>
              }
            </div>
          </article>
        } @empty {
          <div class="empty-state">
            <h3>No appointments yet.</h3>
            <p>Your next great cut is one booking away.</p>
            <a href="/book" class="button button-gold">Book now</a>
          </div>
        }
      </div>
    </section>
  `
})
export class MyBookingsComponent implements OnInit {
  private api = inject(ApiService);
  appointments: Appointment[] = [];
  message = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.myAppointments().subscribe({
      next: rows => this.appointments = rows,
      error: () => this.message = 'Unable to load your appointments.'
    });
  }

  cancel(id: number): void {
    if (!confirm('Cancel this appointment?')) return;

    this.api.cancel(id).subscribe({
      next: () => {
        this.message = 'Appointment cancelled.';
        this.load();
      },
      error: e => this.message = e.error?.error || 'Could not cancel appointment.'
    });
  }
}