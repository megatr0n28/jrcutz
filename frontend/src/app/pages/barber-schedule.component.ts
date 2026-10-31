import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ApiService,
  Barber,
  AvailabilityBlock
} from '../core/api.service';

@Component({
  selector: 'app-barber-schedule',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="schedule-section">
      <div class="section-heading">
        <span class="eyebrow">STAFF MANAGEMENT</span>
        <h2>Barber availability.</h2>
        <p>Set the weekly working hours for each barber.</p>
      </div>

      <div class="schedule-panel">

        <label>Select barber
          <select [(ngModel)]="selectedBarberId"
            name="barber"
            (ngModelChange)="loadSchedule()">
            <option [ngValue]="0">Choose a barber</option>
            @for (barber of barbers; track barber.id) {
              <option [ngValue]="barber.id">
                {{ barber.name }}
              </option>
            }
          </select>
        </label>

        @if (selectedBarberId) {
          <div class="schedule-days">
            @for (day of days; track day.value) {
              <div class="schedule-day">
                <div class="day-header">
                  <h3>{{ day.label }}</h3>
                  <button type="button"
                    class="action-link"
                    (click)="addBlock(day.value)">
                    + Add hours
                  </button>
                </div>

                @for (block of getBlocks(day.value); track block) {
                  <div class="time-block">
                    <label>Start
                      <input type="time"
                        [(ngModel)]="block.startTime"
                        [name]="'start-' + day.value + '-' + $index">
                    </label>

                    <label>End
                      <input type="time"
                        [(ngModel)]="block.endTime"
                        [name]="'end-' + day.value + '-' + $index">
                    </label>

                    <label class="active-toggle">
                      <input type="checkbox"
                        [(ngModel)]="block.isActive"
                        [name]="'active-' + day.value + '-' + $index">
                      Active
                    </label>

                    <button type="button"
                      class="remove-button"
                      (click)="removeBlock(block)">
                      Remove
                    </button>
                  </div>
                }

                @if (getBlocks(day.value).length === 0) {
                  <p class="day-empty">No working hours configured.</p>
                }
              </div>
            }
          </div>

          <div class="schedule-actions">
            <button class="button button-gold"
              (click)="saveSchedule()"
              [disabled]="saving">
              {{ saving ? 'Saving...' : 'Save weekly schedule' }}
            </button>
          </div>
        }

        @if (message) {
          <p class="success-message">{{ message }}</p>
        }

        @if (error) {
          <p class="error-message">{{ error }}</p>
        }
      </div>
    </section>
  `
})
export class BarberScheduleComponent implements OnInit {
  private api = inject(ApiService);

  barbers: Barber[] = [];
  selectedBarberId = 0;
  blocks: AvailabilityBlock[] = [];
  saving = false;
  message = '';
  error = '';

  days = [
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
    { value: 0, label: 'Sunday' }
  ];

  ngOnInit(): void {
    this.api.barbers().subscribe({
      next: result => this.barbers = result,
      error: () => this.error = 'Unable to load barbers.'
    });
  }

  loadSchedule(): void {
    this.blocks = [];
    this.message = '';
    this.error = '';

    if (!this.selectedBarberId) return;

    this.api.getBarberAvailability(this.selectedBarberId)
      .subscribe({
        next: result => this.blocks = result,
        error: () => this.error = 'Unable to load availability.'
      });
  }

  getBlocks(day: number): AvailabilityBlock[] {
    return this.blocks.filter(b => b.dayOfWeek === day);
  }

  addBlock(day: number): void {
    this.blocks = [
      ...this.blocks,
      {
        dayOfWeek: day,
        startTime: '09:00',
        endTime: '17:00',
        isActive: true
      }
    ];
  }

  removeBlock(block: AvailabilityBlock): void {
    this.blocks = this.blocks.filter(b => b !== block);
  }

  saveSchedule(): void {
    if (!this.selectedBarberId) return;

    this.error = '';
    this.message = '';

    // Check individual time ranges.
    for (const block of this.blocks) {
      if (
        !block.startTime ||
        !block.endTime ||
        block.startTime >= block.endTime
      ) {
        this.error = 'Please enter valid working hours.';
        return;
      }
    }

    // Check overlapping active blocks.
    for (let i = 0; i < this.blocks.length; i++) {
      for (let j = i + 1; j < this.blocks.length; j++) {
        const a = this.blocks[i];
        const b = this.blocks[j];

        if (
          a.isActive &&
          b.isActive &&
          a.dayOfWeek === b.dayOfWeek &&
          a.startTime < b.endTime &&
          b.startTime < a.endTime
        ) {
          this.error = 'Working hours cannot overlap.';
          return;
        }
      }
    }

    this.saving = true;

    this.api.saveBarberAvailability(
      this.selectedBarberId,
      this.blocks
    ).subscribe({
      next: () => {
        this.saving = false;
        this.message = 'Barber availability saved successfully!';
        this.loadSchedule();
      },
      error: e => {
        this.saving = false;
        this.error = e.error?.error || 'Unable to save schedule.';
      }
    });
  }
}
