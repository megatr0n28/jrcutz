
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
}

export interface ServiceItem {
  id: number;
  name: string;
  description: string;
  priceCents: number;
  durationMinutes: number;
}

export interface Barber {
  id: number;
  name: string;
  bio: string;
  specialty: string;
  imageUrl: string;
}

export interface Appointment {
  id: number;
  service?: string;
  barber?: string;
  customer?: string;
  email?: string;
  startsAt: string;
  endsAt?: string;
  status: string;
  priceCents?: number;
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

  book(data: {
    serviceId: number;
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

  updateAppointment(id: number, status: string): Observable<any> {
    return this.http.patch(
      `${this.base}/admin/appointments/${id}`, { status },
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
