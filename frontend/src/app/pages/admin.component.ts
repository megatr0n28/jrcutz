import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService, Appointment, AdminUser } from '../core/api.service';
import { BarberScheduleComponent } from './barber-schedule.component';
import { PhoneActionsComponent } from '../core/phone-actions.component';

@Component({
  standalone: true,
  imports: [DatePipe, BarberScheduleComponent, PhoneActionsComponent],
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
                    <app-phone-actions [phone]="a.phone" />
                  </td>
                  <td>{{ a.service }}@if (a.addOns?.length) { + {{ a.addOns!.join(', ') }} }<small>{{ a.barber }}</small></td>
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

      <section class="admin-schedule-card" aria-labelledby="users-heading">
        <div class="admin-toolbar">
          <div>
            <span class="eyebrow">THE CLIENT LIST</span>
            <h2 id="users-heading">Users</h2>
            <p>{{ users.length }} registered account{{ users.length === 1 ? '' : 's' }}.</p>
          </div>
          <button class="button button-outline" (click)="toggleUsers()">
            {{ showUsers ? 'Hide users' : 'View users' }}
          </button>
        </div>

        @if (showUsers) {
          <label class="user-search">Search
            <input type="search" name="userSearch" placeholder="Name, email, or phone"
              [value]="userQuery" (input)="userQuery = $any($event.target).value">
          </label>
          @if (usersError) { <p class="error-message">{{ usersError }}</p> }
          @if (tempPassword) {
            <div class="temp-password" role="status">
              <p>Temporary password for <strong>{{ tempPassword.name }}</strong>
                (shown once — share it securely and ask them to change it):</p>
              <code>{{ tempPassword.password }}</code>
              <button type="button" class="action-link" (click)="copyTempPassword()">Copy</button>
              <button type="button" class="action-link" (click)="tempPassword = null">Dismiss</button>
            </div>
          }
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Appointments</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (u of filteredUsers; track u.id) {
                  <tr>
                    <td><strong>{{ u.name }}</strong></td>
                    <td>{{ u.email }}</td>
                    <td><app-phone-actions [phone]="u.phone" /></td>
                    <td>{{ u.role }}</td>
                    <td>{{ u.appointments }}</td>
                    <td>{{ u.createdAt | date:'MMM d, y' }}</td>
                    <td class="appointment-actions">
                      @if (u.id !== currentUserId) {
                        <button class="action-link" (click)="resetPassword(u)">Reset password</button>
                        <button class="action-link" [class.danger]="u.role === 'admin'"
                          (click)="setRole(u, u.role === 'admin' ? 'customer' : 'admin')">
                          {{ u.role === 'admin' ? 'Remove admin' : 'Make admin' }}
                        </button>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td class="empty-appointments" colspan="7">No users found.</td></tr>
                }
              </tbody>
            </table>
          </div>
        }
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
  users: AdminUser[] = [];
  showUsers = false;
  userQuery = '';
  usersError = '';
  tempPassword: { name: string; password: string } | null = null;
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

  get filteredUsers(): AdminUser[] {
    const q = this.userQuery.trim().toLowerCase();
    if (!q) return this.users;
    return this.users.filter(u =>
      [u.name, u.email, u.phone].some(v => (v || '').toLowerCase().includes(q)));
  }

  get currentUserId(): number | undefined {
    return this.api.user?.id;
  }

  setRole(user: AdminUser, role: 'customer' | 'admin'): void {
    const action = role === 'admin' ? 'make an admin' : 'remove admin access from';
    if (!confirm(`Do you want to ${action} ${user.name}?`)) return;

    this.api.updateUserRole(user.id, role).subscribe({
      next: () => this.loadUsers(),
      error: e => this.usersError = e.error?.error || 'Unable to update user.'
    });
  }

  resetPassword(user: AdminUser): void {
    if (!confirm(`Reset the password for ${user.name}? Their current password will stop working.`)) return;

    this.tempPassword = null;
    this.api.resetUserPassword(user.id).subscribe({
      next: r => {
        this.usersError = '';
        this.tempPassword = { name: user.name, password: r.temporaryPassword };
      },
      error: e => this.usersError = e.error?.error || 'Unable to reset password.'
    });
  }

  copyTempPassword(): void {
    if (this.tempPassword) navigator.clipboard?.writeText(this.tempPassword.password);
  }

  toggleUsers(): void {
    this.showUsers = !this.showUsers;
    if (this.showUsers) this.loadUsers();
  }

  loadUsers(): void {
    this.api.adminUsers().subscribe({
      next: rows => {
        this.users = rows;
        this.usersError = '';
      },
      error: e => this.usersError = e.error?.error || 'Unable to load users.'
    });
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