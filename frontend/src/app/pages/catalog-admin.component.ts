import { Component, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, CatalogItem } from '../core/api.service';

type Kind = 'service' | 'addon';

interface CatalogForm {
  name: string;
  description: string;
  price: number;
  duration: number;
  serviceIds: number[];
}

@Component({
  selector: 'app-catalog-admin',
  standalone: true,
  imports: [FormsModule, CurrencyPipe],
  template: `
    <section class="admin-schedule-card" aria-labelledby="catalog-heading">
      <div class="admin-toolbar">
        <div>
          <span class="eyebrow">THE MENU</span>
          <h2 id="catalog-heading">Services &amp; add-ons</h2>
          <p>{{ services.length }} service{{ services.length === 1 ? '' : 's' }},
            {{ addOns.length }} add-on{{ addOns.length === 1 ? '' : 's' }}.</p>
        </div>
        <button class="button button-outline" (click)="toggle()">
          {{ open ? 'Hide' : 'Manage' }}
        </button>
      </div>

      @if (open) {
        @if (error) { <p class="error-message">{{ error }}</p> }
        @if (message) { <p class="success-message">{{ message }}</p> }

        @if (editing) {
          <form class="catalog-form" (ngSubmit)="save()">
            <h3>{{ editing.id ? 'Edit' : 'New' }} {{ editing.kind === 'service' ? 'service' : 'add-on' }}</h3>
            <label>Name
              <input name="name" [(ngModel)]="form.name" maxlength="80" required>
            </label>
            <label>Description
              <textarea name="description" [(ngModel)]="form.description"
                maxlength="500" rows="2"></textarea>
            </label>
            <div class="catalog-form-row">
              <label>Price (USD)
                <input name="price" type="number" min="0" max="1000" step="0.01"
                  [(ngModel)]="form.price" required>
              </label>
              <label>Duration (minutes)
                <input name="duration" type="number" min="1" max="480" step="1"
                  [(ngModel)]="form.duration" required>
              </label>
            </div>
            @if (editing.kind === 'addon') {
              <fieldset class="addon-list">
                <legend>Available with</legend>
                @for (s of services; track s.id) {
                  <label class="addon-option">
                    <input type="checkbox" [name]="'svc-' + s.id"
                      [checked]="form.serviceIds.includes(s.id)"
                      (change)="toggleFormService(s.id)">
                    <span>{{ s.name }}@if (!s.active) { <small>inactive</small> }</span>
                  </label>
                }
              </fieldset>
            }
            <div class="catalog-form-actions">
              <button class="button button-gold" [disabled]="busy">
                {{ busy ? 'Saving…' : 'Save' }}
              </button>
              <button type="button" class="button button-outline" (click)="cancel()">Cancel</button>
            </div>
          </form>
        }

        <div class="catalog-heading-row">
          <h3>Services</h3>
          <button class="action-link" (click)="startNew('service')">+ Add service</button>
        </div>
        <div class="table-wrap">
          <table class="catalog-services">
            <thead>
              <tr><th>Name</th><th>Time</th><th>Price</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              @for (s of services; track s.id) {
                <tr [class.inactive-row]="!s.active">
                  <td><strong>{{ s.name }}</strong><small>{{ s.description }}</small></td>
                  <td>{{ s.durationMinutes }} min</td>
                  <td>{{ s.priceCents / 100 | currency:'USD' }}</td>
                  <td>{{ s.active ? 'Active' : 'Inactive' }}</td>
                  <td class="appointment-actions">
                    <button class="action-link" (click)="startEdit('service', s)">Edit</button>
                    <button class="action-link" [class.danger]="s.active"
                      (click)="toggleActive('service', s)">
                      {{ s.active ? 'Deactivate' : 'Activate' }}
                    </button>
                  </td>
                </tr>
              } @empty {
                <tr><td class="empty-appointments" colspan="5">No services yet.</td></tr>
              }
            </tbody>
          </table>
        </div>

        <div class="catalog-heading-row">
          <h3>Add-on services</h3>
          <button class="action-link" (click)="startNew('addon')">+ Add add-on</button>
        </div>
        <div class="table-wrap">
          <table class="catalog-addons">
            <thead>
              <tr><th>Name</th><th>Time</th><th>Price</th><th>Available with</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              @for (a of addOns; track a.id) {
                <tr [class.inactive-row]="!a.active">
                  <td><strong>{{ a.name }}</strong><small>{{ a.description }}</small></td>
                  <td>+{{ a.durationMinutes }} min</td>
                  <td>+{{ a.priceCents / 100 | currency:'USD' }}</td>
                  <td>{{ serviceNames(a) }}</td>
                  <td>{{ a.active ? 'Active' : 'Inactive' }}</td>
                  <td class="appointment-actions">
                    <button class="action-link" (click)="startEdit('addon', a)">Edit</button>
                    <button class="action-link" [class.danger]="a.active"
                      (click)="toggleActive('addon', a)">
                      {{ a.active ? 'Deactivate' : 'Activate' }}
                    </button>
                  </td>
                </tr>
              } @empty {
                <tr><td class="empty-appointments" colspan="6">No add-ons yet.</td></tr>
              }
            </tbody>
          </table>
        </div>
        <p class="fine-print">
          Services and add-ons are deactivated rather than deleted so past
          appointments keep their details. Inactive items can't be booked.
        </p>
      }
    </section>
  `
})
export class CatalogAdminComponent {
  private api = inject(ApiService);

  open = false;
  services: CatalogItem[] = [];
  addOns: CatalogItem[] = [];
  error = '';
  message = '';
  busy = false;
  editing: { kind: Kind; id: number | null } | null = null;
  form: CatalogForm = this.blank();

  private blank(): CatalogForm {
    return { name: '', description: '', price: 0, duration: 15, serviceIds: [] };
  }

  toggle(): void {
    this.open = !this.open;
    if (this.open) this.load();
  }

  load(): void {
    this.api.adminServices().subscribe({
      next: rows => { this.services = rows; this.error = ''; },
      error: e => this.error = e.error?.error || 'Unable to load services.'
    });
    this.api.adminAddOns().subscribe({
      next: rows => this.addOns = rows,
      error: e => this.error = e.error?.error || 'Unable to load add-ons.'
    });
  }

  serviceNames(a: CatalogItem): string {
    const names = this.services
      .filter(s => (a.serviceIds || []).includes(s.id))
      .map(s => s.name);
    return names.length ? names.join(', ') : 'No services';
  }

  startNew(kind: Kind): void {
    this.message = '';
    this.error = '';
    this.form = this.blank();
    this.editing = { kind, id: null };
  }

  startEdit(kind: Kind, item: CatalogItem): void {
    this.message = '';
    this.error = '';
    this.form = {
      name: item.name,
      description: item.description,
      price: item.priceCents / 100,
      duration: item.durationMinutes,
      serviceIds: [...(item.serviceIds || [])]
    };
    this.editing = { kind, id: item.id };
  }

  cancel(): void {
    this.editing = null;
  }

  toggleFormService(id: number): void {
    const ids = this.form.serviceIds;
    this.form.serviceIds = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
  }

  save(): void {
    if (!this.editing) return;
    const { kind, id } = this.editing;
    const price = Number(this.form.price);
    const duration = Number(this.form.duration);
    if (!this.form.name.trim()) {
      this.error = 'Name is required.';
      return;
    }
    if (!Number.isFinite(price) || price < 0 || price > 1000) {
      this.error = 'Price must be between $0 and $1,000.';
      return;
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 480) {
      this.error = 'Duration must be a whole number of minutes (1-480).';
      return;
    }

    const body = {
      name: this.form.name.trim(),
      description: this.form.description.trim(),
      priceCents: Math.round(price * 100),
      durationMinutes: duration,
      ...(kind === 'addon' ? { serviceIds: this.form.serviceIds } : {})
    };
    const request = kind === 'service'
      ? (id ? this.api.updateService(id, body) : this.api.createService(body))
      : (id ? this.api.updateAddOn(id, body) : this.api.createAddOn(body));

    this.busy = true;
    this.error = '';
    request.subscribe({
      next: () => {
        this.busy = false;
        this.editing = null;
        this.message = `${kind === 'service' ? 'Service' : 'Add-on'} saved.`;
        this.load();
      },
      error: e => {
        this.busy = false;
        this.error = e.error?.error || 'Unable to save.';
      }
    });
  }

  toggleActive(kind: Kind, item: CatalogItem): void {
    const next = !item.active;
    const verb = next ? 'Activate' : 'Deactivate';
    if (!confirm(`${verb} "${item.name}"?${next ? '' : ' Customers will no longer be able to book it.'}`)) return;

    this.message = '';
    const request = kind === 'service'
      ? this.api.updateService(item.id, { active: next })
      : this.api.updateAddOn(item.id, { active: next });
    request.subscribe({
      next: () => {
        this.error = '';
        this.message = `${item.name} ${next ? 'activated' : 'deactivated'}.`;
        this.load();
      },
      error: e => this.error = e.error?.error || 'Unable to update.'
    });
  }
}
