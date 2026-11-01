import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService, Appointment } from '../core/api.service';
import { BarberScheduleComponent } from './barber-schedule.component';

@Component({
  standalone: true,
  imports: [DatePipe, BarberScheduleComponent],
  template: `
    <section class="dashboard-page">
      <span class="eyebrow">BUSINESS MANAGEMENT</span>
      <h1>Shop dashboard.</h1>
      <p>Review bookings, manage the appointment queue, and keep the team's hours up to date.</p>

      @if (error) { <p class="error-message">{{ error }}</p> }

      <div class="stats-grid">
        @for (f of filters; track f.key) {
          <button type="button" class="stat-card" [class.active]="filter === f.key"
            [attr.aria-pressed]="filter === f.key" (click)="filter = f.key">
            <span>{{ f.label }}</span>
            <strong>{{ count(f.key) }}</strong>
          </button>
        }
      </div>
      @if (filter !== 'all') {
        <button type="button" class="clear-filter" (click)="filter = 'all'">Clear filter</button>
      }

      <section class="admin-schedule-card" aria-labelledby="appointments-heading">
        <div class="admin-toolbar">
          <div>
            <span class="eyebrow">THE DAILY LINEUP</span>
            <h2 id="appointments-heading">Appointments</h2>
            <p>Review upcoming visits and update their status.</p>
          </div>
          <button class="button button-outline" (click)="load()">Refresh list</button>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Service / Barber</th>
                <th>Date &amp; time</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (a of filtered; track a.id) {
                <tr>
                  <td>
                    <strong>{{ a.customer }}</strong>
                    <small>{{ a.email }}</small>
                  </td>
                  <td>{{ a.service }}<small>{{ a.barber }}</small></td>
                  <td>{{ a.startsAt | date:'MMM d, y · h:mm a' }}</td>
                  <td>
                    <span class="status"
                      [class.status-pending]="a.status === 'pending'"
                      [class.status-confirmed]="a.status === 'confirmed'"
                      [class.status-completed]="a.status === 'completed'"
                      [class.status-cancelled]="a.status === 'cancelled'">
                      {{ a.status }}
                    </span>
                  </td>
                  <td class="appointment-actions">
                    @if (a.status === 'pending') {
                      <button class="action-link" (click)="update(a.id,'confirmed')">
                        Confirm
                      </button>
                    }
                    @if (a.status === 'confirmed') {
                      <button class="action-link" (click)="update(a.id,'completed')">
                        Complete
                      </button>
                    }
                    @if (a.status !== 'cancelled' && a.status !== 'completed') {
                      <button class="action-link danger" (click)="update(a.id,'cancelled')">
                        Cancel
                      </button>
                    }
                    @if (a.status === 'cancelled') {
                      <button class="action-link danger" (click)="remove(a.id)">
                        Delete
                      </button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td class="empty-appointments" colspan="5">No appointments found.</td></tr>
              }
            </tbody>
          </table>
        </div>
        </section>
      <!-- Barber Availability Management -->
      <app-barber-schedule></app-barber-schedule>
    </section>
  `
})
export class AdminComponent implements OnInit {
  private api = inject(ApiService);
  appointments: Appointment[] = [];
  error = '';
  filter = 'all';
  filters = [
    { key: 'all', label: 'Total listed' },
    { key: 'pending', label: 'Pending' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' }
  ];

  ngOnInit(): void {
    this.load();
  }

  get filtered(): Appointment[] {
    return this.filter === 'all' ? this.appointments : this.appointments.filter(a => a.status === this.filter);
  }

  count(status: string): number {
    if (status === 'all') return this.appointments.length;
    return this.appointments.filter(a => a.status === status).length;
  }

  load(): void {
    this.api.adminAppointments().subscribe({
      next: rows => {
        this.appointments = rows;
        this.error = '';
      },
      error: e => this.error = e.error?.error || 'Unable to load dashboard.'
    });
  }

  update(id: number, status: string): void {
    if (!confirm(`Change appointment #${id} to ${status}?`)) return;

    this.api.updateAppointment(id, status).subscribe({
      next: () => this.load(),
      error: e => this.error = e.error?.error || 'Unable to update appointment.'
    });
  }

  remove(id: number): void {
    if (!confirm(`Permanently delete appointment #${id}? This cannot be undone.`)) return;

    this.api.deleteAppointment(id).subscribe({
      next: () => this.load(),
      error: e => this.error = e.error?.error || 'Unable to delete appointment.'
    });
  }
}