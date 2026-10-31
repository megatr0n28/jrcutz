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
      <p>Review bookings and manage the appointment queue.</p>

      @if (error) { <p class="error-message">{{ error }}</p> }

      <div class="stats-grid">
        <article class="stat-card">
          <span>Total listed</span>
          <strong>{{ appointments.length }}</strong>
        </article>
        <article class="stat-card">
          <span>Pending</span>
          <strong>{{ count('pending') }}</strong>
        </article>
        <article class="stat-card">
          <span>Confirmed</span>
          <strong>{{ count('confirmed') }}</strong>
        </article>
        <article class="stat-card">
          <span>Completed</span>
          <strong>{{ count('completed') }}</strong>
        </article>
      </div>

      <div class="admin-toolbar">
        <h2>Appointments</h2>
        <button class="button button-outline" (click)="load()">Refresh</button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Service / Barber</th>
              <th>Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (a of appointments; track a.id) {
              <tr>
                <td>
                  <strong>{{ a.customer }}</strong>
                  <small>{{ a.email }}</small>
                </td>
                <td>{{ a.service }}<small>{{ a.barber }}</small></td>
                <td>{{ a.startsAt | date:'MMM d, y · h:mm a' }}</td>
                <td><span class="status">{{ a.status }}</span></td>
                <td>
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
                </td>
              </tr>
            } @empty {
              <tr><td colspan="5">No appointments found.</td></tr>
            }
          </tbody>
        </table>
      </div>
      <!-- Barber Availability Management -->
      <app-barber-schedule></app-barber-schedule>
    </section>
  `
})
export class AdminComponent implements OnInit {
  private api = inject(ApiService);
  appointments: Appointment[] = [];
  error = '';

  ngOnInit(): void {
    this.load();
  }

  count(status: string): number {
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
}