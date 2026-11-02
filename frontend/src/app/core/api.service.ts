
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { AvailabilityBlock } from './availability-block.model';

export type { AvailabilityBlock };

export interface User {
  id: number;
  name: string;
  email: string;
  role: 'customer' | 'admin';
  mustChangePassword?: boolean;
}

export interface ServiceItem {
  id: number;
  name: string;
  description: string;
  priceCents: number;
  durationMinutes: number;
}

export interface AddOn {
  id: number;
  name: string;
  description: string;
  priceCents: number;
  durationMinutes: number;
  serviceIds: number[];
}

export interface CatalogItem {
  id: number;
  name: string;
  description: string;
  priceCents: number;
  durationMinutes: number;
  active: boolean;
  serviceIds?: number[];
}

export interface CatalogInput {
  name: string;
  description: string;
  priceCents: number;
  durationMinutes: number;
  serviceIds?: number[];
}

export interface Barber {
  id: number;
  name: string;
  bio: string;
  specialty: string;
  imageUrl: string;
}

export interface TimeSlot {
  startsAt: string;
  time: string;
  available: boolean;
  reason?: 'booked' | 'past' | 'lunch';
}

export interface SlotsResponse {
  date: string;
  timezone: string;
  durationMinutes: number;
  slots: TimeSlot[];
}

export interface PriceLine {
  name: string;
  priceCents: number;
  durationMinutes: number;
}

export interface PriceBreakdown {
  service: PriceLine;
  addOns: PriceLine[];
  totalCents: number;
  totalMinutes: number;
}

export interface Appointment {
  id: number;
  service?: string;
  barber?: string;
  customer?: string;
  email?: string;
  phone?: string;
  startsAt: string;
  endsAt?: string;
  status: string;
  priceCents?: number;
  addOns?: string[];
  breakdown?: PriceBreakdown;
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: 'customer' | 'admin';
  createdAt: string;
  appointments: number;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private readonly base = '/api';
  private readonly tokenKey = 'barbershop_token';
  private readonly userKey = 'barbershop_user';

  get token(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  get user(): User | null {
    try {
      return JSON.parse(localStorage.getItem(this.userKey) || 'null');
    } catch {
      return null;
    }
  }

  get loggedIn(): boolean {
    return !!this.token && !!this.user;
  }

  get isAdmin(): boolean {
    return this.user?.role === 'admin';
  }

  headers(): HttpHeaders {
    return this.token
      ? new HttpHeaders({ Authorization: `Bearer ${this.token}` })
      : new HttpHeaders();
  }

  private saveSession(result: { token: string; user: User }): void {
    localStorage.setItem(this.tokenKey, result.token);
    localStorage.setItem(this.userKey, JSON.stringify(result.user));
  }

  login(email: string, password: string): Observable<any> {
    return this.http.post<any>(`${this.base}/auth/login`, {
      email, password
    }).pipe(tap(result => this.saveSession(result)));
  }

  register(
    name: string, email: string, phone: string, password: string
  ): Observable<any> {
    return this.http.post<any>(`${this.base}/auth/register`, {
      name, email, phone, password
    }).pipe(tap(result => this.saveSession(result)));
  }

  get mustChangePassword(): boolean {
    return !!this.user?.mustChangePassword;
  }

  changePassword(
    currentPassword: string, newPassword: string
  ): Observable<any> {
    return this.http.post<any>(`${this.base}/auth/change-password`, {
      currentPassword, newPassword
    }, { headers: this.headers() }).pipe(tap(result => this.saveSession(result)));
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
  }

  services(): Observable<ServiceItem[]> {
    return this.http.get<ServiceItem[]>(`${this.base}/services`);
  }

  barbers(): Observable<Barber[]> {
    return this.http.get<Barber[]>(`${this.base}/barbers`);
  }

  addOns(): Observable<AddOn[]> {
    return this.http.get<AddOn[]>(`${this.base}/addons`);
  }

  barberSlots(
    barberId: number, serviceId: number | null, date: string,
    addOnIds: number[] = []
  ): Observable<SlotsResponse> {
    const params: Record<string, string> = { date };
    if (serviceId) params['serviceId'] = String(serviceId);
    if (serviceId && addOnIds.length) params['addOnIds'] = addOnIds.join(',');
    return this.http.get<SlotsResponse>(
      `${this.base}/barbers/${barberId}/slots`, { params }
    );
  }

  book(data: {
    serviceId: number;
    addOnIds?: number[];
    barberId: number;
    startsAt: string;
    notes: string;
  }): Observable<any> {
    return this.http.post(`${this.base}/appointments`, data, {
      headers: this.headers()
    });
  }

  myAppointments(): Observable<Appointment[]> {
    return this.http.get<Appointment[]>(
      `${this.base}/me/appointments`, { headers: this.headers() }
    );
  }

  cancel(id: number): Observable<any> {
    return this.http.delete(`${this.base}/appointments/${id}`, {
      headers: this.headers()
    });
  }

  adminAppointments(): Observable<Appointment[]> {
    return this.http.get<Appointment[]>(
      `${this.base}/admin/appointments`, { headers: this.headers() }
    );
  }

  adminServices(): Observable<CatalogItem[]> {
    return this.http.get<CatalogItem[]>(
      `${this.base}/admin/services`, { headers: this.headers() });
  }

  createService(data: CatalogInput): Observable<CatalogItem> {
    return this.http.post<CatalogItem>(
      `${this.base}/admin/services`, data, { headers: this.headers() });
  }

  updateService(
    id: number, data: Partial<CatalogInput> & { active?: boolean }
  ): Observable<CatalogItem> {
    return this.http.patch<CatalogItem>(
      `${this.base}/admin/services/${id}`, data, { headers: this.headers() });
  }

  adminAddOns(): Observable<CatalogItem[]> {
    return this.http.get<CatalogItem[]>(
      `${this.base}/admin/addons`, { headers: this.headers() });
  }

  createAddOn(data: CatalogInput): Observable<CatalogItem> {
    return this.http.post<CatalogItem>(
      `${this.base}/admin/addons`, data, { headers: this.headers() });
  }

  updateAddOn(
    id: number, data: Partial<CatalogInput> & { active?: boolean }
  ): Observable<CatalogItem> {
    return this.http.patch<CatalogItem>(
      `${this.base}/admin/addons/${id}`, data, { headers: this.headers() });
  }

  adminUsers(): Observable<AdminUser[]> {
    return this.http.get<AdminUser[]>(
      `${this.base}/admin/users`, { headers: this.headers() }
    );
  }

  resetUserPassword(id: number): Observable<{ temporaryPassword: string }> {
    return this.http.post<{ temporaryPassword: string }>(
      `${this.base}/admin/users/${id}/reset-password`, {},
      { headers: this.headers() }
    );
  }

  updateUserRole(id: number, role: 'customer' | 'admin'): Observable<any> {
    return this.http.patch(
      `${this.base}/admin/users/${id}`, { role },
      { headers: this.headers() }
    );
  }

  updateAppointment(id: number, status: string): Observable<any> {
    return this.http.patch(
      `${this.base}/admin/appointments/${id}`, { status },
      { headers: this.headers() }
    );
  }

  deleteAppointment(id: number): Observable<any> {
    return this.http.delete(
      `${this.base}/admin/appointments/${id}`,
      { headers: this.headers() }
    );
  }

  getBarberAvailability(
    barberId: number
  ): Observable<AvailabilityBlock[]> {
    return this.http.get<AvailabilityBlock[]>(
      `${this.base}/admin/barbers/${barberId}/availability`,
      { headers: this.headers() }
    );
  }

  saveBarberAvailability(
    barberId: number,
    blocks: AvailabilityBlock[]
  ): Observable<any> {
    return this.http.put(
      `${this.base}/admin/barbers/${barberId}/availability`,
      blocks,
      { headers: this.headers() }
    );
  }
}
