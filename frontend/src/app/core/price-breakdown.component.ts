import { Component, Input } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { PriceBreakdown } from './api.service';

let nextId = 0;

@Component({
  selector: 'app-price-breakdown',
  standalone: true,
  imports: [CurrencyPipe],
  template: `
    @if (breakdown) {
      <button type="button" class="price-toggle" [attr.aria-expanded]="open"
        [attr.aria-controls]="panelId" (click)="open = !open">
        <strong>{{ breakdown.totalCents / 100 | currency:'USD' }}</strong>
        <span class="price-caret" aria-hidden="true">{{ open ? '▴' : '▾' }}</span>
        <span class="price-toggle-label">{{ open ? 'Hide' : 'Price' }} breakdown</span>
      </button>
      @if (open) {
        <dl class="price-lines" [id]="panelId">
          <div>
            <dt>{{ breakdown.service.name }}<small>{{ breakdown.service.durationMinutes }} min</small></dt>
            <dd>{{ breakdown.service.priceCents / 100 | currency:'USD' }}</dd>
          </div>
          @for (a of breakdown.addOns; track $index) {
            <div class="price-addon">
              <dt>+ {{ a.name }}<small>{{ a.durationMinutes }} min</small></dt>
              <dd>{{ a.priceCents / 100 | currency:'USD' }}</dd>
            </div>
          }
          <div class="price-total">
            <dt>Total<small>{{ breakdown.totalMinutes }} min</small></dt>
            <dd>{{ breakdown.totalCents / 100 | currency:'USD' }}</dd>
          </div>
        </dl>
      }
    } @else {
      <span class="price-none">—</span>
    }
  `
})
export class PriceBreakdownComponent {
  @Input() breakdown?: PriceBreakdown;
  open = false;
  readonly panelId = `price-lines-${nextId++}`;
}
