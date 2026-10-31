import { Component, OnInit, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService, ServiceItem, Barber } from '../core/api.service';

@Component({
  standalone: true,
  imports: [CurrencyPipe, RouterLink],
  template: `
    <section class="hero">
      <div class="hero-content">
        <span class="eyebrow">THE ART OF THE PERFECT CUT</span>
        <h1>Look good.<br><em>Feel confident.</em></h1>
        <p>Precision cuts. Expert grooming. An experience built around you.</p>
        <div class="hero-actions">
          <a routerLink="/book" class="button button-gold">Book an appointment ↗</a>
          <a href="#services" class="button button-outline">Explore services</a>
        </div>
        <div class="hero-note">CRAFT · PRECISION · CHARACTER</div>
      </div>
    </section>

    <section id="services" class="section">
      <div class="section-heading">
        <span class="eyebrow">THE MENU</span>
        <h2>Made for your style.</h2>
        <p>Thoughtful grooming, tailored to you.</p>
      </div>
      @if (error) {
        <p class="notice">{{ error }}</p>
      }
      <div class="service-grid">
        @for (s of services; track s.id) {
          <article class="service-card">
            <div class="service-number">0{{ s.id }}</div>
            <h3>{{ s.name }}</h3>
            <p>{{ s.description }}</p>
            <div class="service-meta">
              <span>{{ s.durationMinutes }} min</span>
              <strong>{{ s.priceCents / 100 | currency:'USD' }}</strong>
            </div>
            <a routerLink="/book" class="text-link">BOOK THIS SERVICE ↗</a>
          </article>
        } @empty {
          <p>Loading services…</p>
        }
      </div>
    </section>

    <section class="barbers-section">
      <div class="section-heading">
        <span class="eyebrow">THE CRAFTSMEN</span>
        <h2>Good hands. Great cuts.</h2>
      </div>
      <div class="barber-grid">
        @for (b of barbers; track b.id) {
          <article class="barber-card">
            @if (b.imageUrl) {
              <img [src]="b.imageUrl" [alt]="b.name" loading="lazy">
            } @else {
              <div class="barber-placeholder">✂</div>
            }
            <div class="barber-copy">
              <h3>{{ b.name }}</h3>
              <p>{{ b.specialty }}</p>
              <p>{{ b.bio }}</p>
            </div>
          </article>
        } @empty {
          <p>Meet the team at your next visit.</p>
        }
      </div>
      <div class="center-action">
        <a routerLink="/book" class="button button-gold">Find your time</a>
      </div>
    </section>

    <section class="booking-banner">
      <span class="eyebrow">YOUR CHAIR IS WAITING</span>
      <h2>Your next great cut starts here.</h2>
      <a routerLink="/book" class="button button-gold">Reserve your appointment ↗</a>
    </section>
  `
})
export class HomeComponent implements OnInit {
  private api = inject(ApiService);
  services: ServiceItem[] = [];
  barbers: Barber[] = [];
  error = '';

  ngOnInit(): void {
    this.api.services().subscribe({
      next: v => this.services = v,
      error: () => this.error = 'Services are temporarily unavailable.'
    });
    this.api.barbers().subscribe({
      next: v => this.barbers = v,
      error: () => this.error = 'Barber profiles are temporarily unavailable.'
    });
  }
}